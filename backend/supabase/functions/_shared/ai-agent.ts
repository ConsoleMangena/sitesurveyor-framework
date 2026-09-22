// SiteSurveyor AI agent core — shared by the `ai-chat` Edge Function (Deno)
// and the host-server fallback (Node). Zero external dependencies: talks to
// Alibaba Cloud Model Studio (DashScope, Singapore/ap-southeast-1) OpenAI-
// compatible chat completions API
// (https://dashscope-intl.aliyuncs.com/compatible-mode/v1) with streaming +
// tool-calling, and executes tools against the platform's Supabase REST API
// with the service-role key. Never imported by browser code.
//
// Safety contract (enforced here, mirrored in the system prompt):
// - Reads are free against the whitelisted tables.
// - Writes (insert/update/delete) are whitelisted and REQUIRE the model to
//   have shown the change and received an affirmative user reply before it
//   may set confirmed=true.

import {
  closeOverdueInvoices,
  createQuoteFromLineItems,
  scheduleJob,
} from "./workflows.ts";
import {
  formatSkillContext,
  loadSkills,
  promoteExample,
  selectSkills,
} from "./skills.ts";
import { forget, formatMemoryBlock, loadMemory, remember } from "./memory.ts";
import {
  DEFAULT_MODEL,
  isAllowedModel,
  scoreComplexity,
} from "./models.ts";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type AgentEvent =
  | { type: "delta"; text: string }
  | { type: "final"; text: string }
  | { type: "error"; message: string }
  | { type: "status"; phase: string }
  | { type: "tool"; name: string };

export interface RunAgentOptions {
  history: ChatTurn[];
  userMessage: string;
  dashscopeKey: string;
  supabaseUrl: string;
  serviceKey: string;
  maxToolRounds?: number;
  /** The signed-in user's primary workspace — stamped onto business writes. */
  workspaceId?: string;
  /** Project the user has open in the CAD workspace, if any. */
  projectId?: string;
  /** Rolling conversation summary (notes about turns outside the history window). */
  memoryNote?: string;
  /** Optional abort signal so callers can cancel an in-flight agent run. */
  signal?: AbortSignal;
  /** Override the default LLM model sent to DashScope (Qwen). */
  model?: string;
  /** Signed-in user id, for run attribution (optional). */
  userId?: string;
  /** Conversation this run belongs to, for run attribution (optional). */
  conversationId?: string;
  /** Chat-list context (dashboard vs cad); default 'dashboard'. */
  context?: string;
}

const DASHSCOPE_URL =
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
const MAX_TOOL_ROUNDS = 8;
/** Routine (simple) tasks never need the full round budget — cap them lower so
 *  a single query can't chain eight slow model round-trips. Complex tasks keep
 *  the full budget via scoreComplexity(). */
const SIMPLE_MAX_ROUNDS = 3;
/** Prior turns replayed to the model — every turn is re-sent on each round. */
const MAX_HISTORY_TURNS = 16;
/** Per-turn elision caps so one huge message cannot eat the whole window. */
const HISTORY_TURN_CAP_CHARS = 1_800;
const LIVE_MESSAGE_CAP_CHARS = 6_000;

// Latency guards: every outbound call has a deadline so a stalled upstream
// surfaces as an error instead of a frozen chat.
const SUPABASE_TIMEOUT_MS = 15_000;
const SCHEMA_TIMEOUT_MS = 10_000;
/** Max silence between SSE chunks from DashScope before the round is aborted. */
const LLM_IDLE_TIMEOUT_MS = 60_000;
/** Hard cap for one model round (streaming included). */
const LLM_ROUND_TIMEOUT_MS = 240_000;

/** Inline CAD models above this size are summarised instead of returned whole. */
const CAD_MODEL_CAP_CHARS = 48_000;
const CAD_SAMPLE_IDS_PER_TYPE = 25;

interface TimeoutHandle {
  signal: AbortSignal;
  done(): void;
}

function timeoutSignal(ms: number): TimeoutHandle {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    done: () => clearTimeout(timer),
  };
}

/** Tables the agent may read. */
const READ_TABLES = new Set([
  "workspaces",
  "workspace_members",
  "profiles",
  "projects",
  "project_activities",
  "quotes",
  "quote_items",
  "invoices",
  "invoice_items",
  "contacts",
  "assets",
  "asset_calibrations",
  "asset_maintenance_events",
  "jobs",
  "job_events",
  "job_assignments",
  "time_entries",
  "expense_entries",
  "notifications",
  "marketplace_listings",
  "professionals",
  "market_firms",
  "market_events",
  "market_job_posts",
  "project_cad_drawings",
]);

/** Tables the agent may mutate. */
const WRITE_TABLES = new Set([
  "quotes",
  "projects",
  "contacts",
  "jobs",
  "invoices",
  "assets",
  "job_events",
]);

const FILTER_OPS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike"]);

const CAD_ENTITY_ARRAYS: Record<string, string> = {
  point: "points",
  linework: "linework",
  text: "texts",
  circle: "circles",
  arc: "arcs",
  ellipse: "ellipses",
  hatch: "hatches",
  dimension: "dimensions",
  surface: "surfaces",
};

interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function filterSchema(): Record<string, unknown> {
  return {
    type: "array",
    description:
      "Optional equality/range filters combined with AND. Values are strings.",
    items: {
      type: "object",
      properties: {
        column: { type: "string" },
        op: {
          type: "string",
          enum: [...FILTER_OPS],
        },
        value: { type: "string" },
      },
      required: ["column", "op", "value"],
      additionalProperties: false,
    },
  };
}

const TOOLS: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "inspect_columns",
      description:
        "List the column names of a table (from one sample row). Use when unsure which columns exist before filtering or writing.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: [...READ_TABLES] },
        },
        required: ["table"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_site_data",
      description:
        "Read rows from the SiteSurveyor platform database. Always narrow broad tables with filters or a small limit.",
      parameters: {
        type: "object",
        properties: {
          table: {
            type: "string",
            enum: [...READ_TABLES],
            description: "Table to read.",
          },
          filters: filterSchema(),
          order_by: { type: "string", description: "Column to sort by." },
          order_dir: { type: "string", enum: ["asc", "desc"] },
          limit: {
            type: "integer",
            description: "Max rows to return (default 20, max 100).",
          },
        },
        required: ["table"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "count_site_data",
      description:
        "Count rows matching optional filters. Cheaper than fetching rows — prefer this for 'how many' questions.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: [...READ_TABLES] },
          filters: filterSchema(),
        },
        required: ["table"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "insert_site_record",
      description:
        "Create one record. You MUST describe the full record to the user and receive an explicit yes BEFORE calling with confirmed=true.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: [...WRITE_TABLES] },
          record: { type: "object", description: "Column/value pairs to insert." },
          confirmed: {
            type: "boolean",
            description: "True ONLY after the user explicitly approved this exact change.",
          },
        },
        required: ["table", "record", "confirmed"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_site_record",
      description:
        "Patch one record by id. You MUST describe the exact field changes and receive an explicit yes BEFORE confirmed=true.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: [...WRITE_TABLES] },
          id: { type: "string", description: "UUID of the row." },
          patch: { type: "object", description: "Column/value pairs to change." },
          confirmed: { type: "boolean" },
        },
        required: ["table", "id", "patch", "confirmed"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_site_record",
      description:
        "Delete one record permanently. Strongly prefer status/archived updates over deletes. Requires explicit yes BEFORE confirmed=true.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: [...WRITE_TABLES] },
          id: { type: "string" },
          confirmed: { type: "boolean" },
        },
        required: ["table", "id", "confirmed"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "close_overdue_invoices",
      description:
        "Composite workflow: find every overdue invoice and settle it at once (marks them paid). Returns a summary. Use instead of manually querying then patching each one.",
      parameters: {
        type: "object",
        properties: {
          scope: {
            type: "object",
            description: "Optional scope, e.g. { workspace_id: '...' } to limit which workspace's overdue invoices to close.",
            properties: {
              workspace_id: { type: "string" },
            },
          },
          target_status: {
            type: "string",
            enum: ["paid", "cancelled"],
            description: "Default 'paid' (settle). Only use 'cancelled' with explicit user approval.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_quote_from_line_items",
      description:
        "Composite workflow: build a quote (and its line items) in one step from a list of { description, qty, rate, unit }. Computes subtotal/tax/total deterministically. Returns the quote id and totals.",
      parameters: {
        type: "object",
        properties: {
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                qty: { type: "number" },
                rate: { type: "number" },
                unit: { type: "string" },
              },
              required: ["description", "qty", "rate"],
            },
          },
          project_id: { type: "string" },
          contact_id: { type: "string" },
          currency_code: { type: "string" },
          tax_rate_percent: { type: "number" },
          notes: { type: "string" },
        },
        required: ["lines"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_job",
      description:
        "Composite workflow: schedule a job on a date — verifies the job exists and is schedulable, creates a job_assignment, and sets the job status to 'scheduled'. Returns the assignment id.",
      parameters: {
        type: "object",
        properties: {
          job_id: { type: "string", description: "UUID of the job." },
          assignment_date: { type: "string", description: "ISO date (YYYY-MM-DD). Defaults to today." },
          notes: { type: "string" },
          status: {
            type: "string",
            enum: ["draft", "confirmed", "in_progress", "completed", "cancelled"],
          },
        },
        required: ["job_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cad_drawing",
      description:
        "Fetch the full CAD drawing model for a project. Returns the JSONB model containing layers, points, linework, texts, circles, arcs, ellipses, hatches, dimensions, and surfaces arrays. Use this to understand what is currently drawn.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "UUID of the project." },
        },
        required: ["project_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_cad_layers",
      description:
        "List all layers in a project's CAD drawing with their colours, visibility, lock status, and entity counts per layer.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "UUID of the project." },
        },
        required: ["project_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "count_cad_entities",
      description:
        "Count entities in a project's CAD drawing, optionally filtered by layer and/or entity type. Returns a total plus per-type counts.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "UUID of the project." },
          layer_id: {
            type: "string",
            description: "Optional layer UUID — count only entities on this layer.",
          },
          entity_type: {
            type: "string",
            enum: [
              "point",
              "linework",
              "text",
              "circle",
              "arc",
              "ellipse",
              "hatch",
              "dimension",
              "surface",
            ],
            description: "Optional entity type to count.",
          },
        },
        required: ["project_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "inspect_cad_entity",
      description:
        "Fetch one entity from a project's CAD drawing by its UUID. Returns the entity type and its full properties.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "UUID of the project." },
          entity_id: { type: "string", description: "UUID of the entity to inspect." },
        },
        required: ["project_id", "entity_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remember",
      description:
        "Persist a discrete fact (active CAD layer, datum, stated user preference/default) into this conversation's structured memory. Facts are re-injected into context on every turn and survive history truncation. Use small, stable keys (e.g. 'active_layer', 'datum', 'user_pref.units').",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Stable memory key (lowercase, dot-separated)." },
          value: {
            description:
              "The value to remember. Strings, numbers, booleans, or small objects/arrays are fine.",
          },
        },
        required: ["key", "value"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "forget",
      description: "Remove a previously remembered fact by key.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Memory key to remove." },
        },
        required: ["key"],
        additionalProperties: false,
      },
    },
  },
];

function systemPrompt(supabaseUrl: string): string {
  return [
    "You are SiteSurveyor, the AI agent of the SiteSurveyor platform -",
    "a multi-tenant survey operations product (projects, dispatching, assets,",
    "quotes, invoicing, time tracking, public market). When asked who you are,",
    "say you are SiteSurveyor. Tagline: your surveying reference point.",
    "",
    "You interact with system functionality through your tools:",
    "- Reporting & analysis across projects, quotes, invoices, payments,",
    "  contacts, assets, calibrations, maintenance, jobs/dispatch, schedule",
    "  events (job_events), assignments, time & expense entries, notifications,",
    "  and the public market (listings, professionals, firms, training).",
    "- Creating/updating records: quotes (+ quote_items lines), projects,",
    "  contacts, jobs, invoices, assets (e.g. status changes), and scheduling",
    "  via job_events entries.",
    "Data lives in Supabase",
    `(REST base: ${supabaseUrl}).`,
    "",
    "Rules:",
    "1. Answer questions with real numbers from count/query tools - never guess.",
    "2. Cap exploratory queries (limit <= 20) unless the user asks for more.",
    "3. Use inspect_columns first when unsure which columns exist on a table.",
    "4. Money/date formatting follows what the data uses; never invent values.",
    "5. Writes: creates and updates execute immediately - do NOT ask",
    "   permission; apply sensible defaults and report the result in one or",
    "   two lines. Deletes require an explicit yes: propose the delete in an",
    "   [ASK] block naming the record (title/ref and truncated id) with",
    "   options 'Yes, delete' / 'Cancel', and execute only after the user",
    "   confirms. Prefer archiving via update when possible.",
    "6. If a tool fails, report the error verbatim; do not retry blindly.",
    "7. Keep answers compact: headline number first, then notable exceptions.",
    "8. Writes are server-verified: after a successful insert/update the tool",
    "   returns the read-back row with `_verified: true`. Only report facts that",
    "   verification confirmed; if `_verified` is false or missing, say the write",
    "   did not verify and check before claiming success.",
    "9. Persist durable facts (active CAD layer, datum, stated user preferences",
    "   and defaults) with the `remember` tool under stable keys. They will be",
    "   re-injected on every turn as STRUCTURED MEMORY and survive history",
    "   truncation. Use `forget` to remove stale ones.",
    "",
    "CAD INTEGRATION — READING:",
    "Use get_cad_drawing to fetch the full model for a project.",
    "Use list_cad_layers to see layers with entity counts.",
    "Use count_cad_entities for totals (filterable by layer/type).",
    "Use inspect_cad_entity for a single entity's full properties.",
    "Model arrays: points (pointNo, n, e, z, code, layerId), linework",
    "(kind=line|polyline|boundary, vertices[]), texts (text, n, e, height,",
    "rotation), circles (center{n,e}, radius), arcs (center, radius,",
    "startAngle°, endAngle°), ellipses (semiMajor/Minor, rotation), hatches",
    "(vertices, holes), dimensions (kind, defPoints), surfaces (points,",
    "triangles).",
    "",
    "CAD INTEGRATION — WRITING:",
    "When the user asks you to DRAW, CREATE, or ADD geometry, output commands",
    "inside a [CAD] ... [/CAD] block, one command per line:",
    "  POINT <n> <e> [z] [code=CODE] [layer=LAYER]",
    "  LINE <n1>,<e1> <n2>,<e2> ... [closed] [layer=LAYER]",
    "  (2 vertices = simple line)",
    '  TEXT <n> <e> "content" [h=height] [rot=degrees] [layer=LAYER]',
    "  CIRCLE <cn>,<ce> <radius> [layer=LAYER]",
    "  ARC <cn>,<ce> <radius> <start_deg> <end_deg> [layer=LAYER]",
    "  LAYER CREATE <name> [color=#hex]",
    "  ZOOM EXTENTS",
    "  ERASE ALL  (clears the whole drawing)",
    "  ERASE LAYER <name>",
    "  ERASE TYPE <point|linework|text|circle|arc|ellipse|hatch|dimension|surface>",
    "Coordinates are Northing,Eastings. Prefer existing layers; create new ones",
    "only when needed. Example: [CAD]",
    "POINT 501234 2845678 code=CP1 layer=CONTROL",
    "LINE 501234,2845678 501240,2845680",
    "[/CAD]",
    "ERASE commands run only when the user presses Execute on your block. Before",
    "emitting any ERASE, restate exactly what will be deleted (counts per",
    "layer/type from the read tools) and offer an [ASK] confirm with",
    "'Yes, delete' / 'Cancel'. Never mix ERASE with creation commands in one",
    "block. The user can undo the whole batch with one Undo press.",
    "",
    "COMMUNICATION:",
    "Default to action: when a detail is missing but has a sensible default",
    "(target layer = the drawing's active layer, or SETOUT for setout geometry;",
    "datum = the project's datum), state the assumption in ONE short line and",
    "proceed. Ask a question only when there is NO defensible default or the",
    "request is destructive or genuinely ambiguous - then ask ONE short question",
    "with an [ASK] block:",
    "[ASK]",
    "Which layer should the new boundary go on?",
    "- BOUNDARY",
    "- SETOUT",
    "- Create a new layer",
    "[/ASK]",
    "Plain lines form the question; each '- ' line is a clickable option.",
    "Never invent coordinates, names, or counts - query tools or ask. When you",
    "proceed on a stated default, say the assumption in one short line.",
    "Keep answers compact: headline first, then a small table or bullets;",
    "no restating the question, no filler.",
    "",
    "CAD WORKFLOW:",
    "Before drawing onto an existing drawing, read it first (list_cad_layers)",
    "and reuse its layer names exactly. Group ONE logical action per [CAD]",
    "block (e.g. all setout points together) and keep prose out of blocks.",
    "Finish geometry-creating blocks with ZOOM EXTENTS so the result is",
    "visible. After work the user executed, confirm what changed in one line",
  ].join("\n");
}

// ── Live schema awareness ─────────────────────────────────────────────────
// Fetched once per runtime from PostgREST's OpenAPI root so the model sees
// REAL column names for whitelisted tables instead of guessing. Cached
// module-level; a failed fetch simply omits the section.

interface TableSchemaInfo {
  columns: string[]; // column names
  required: string[];
  hasWorkspaceId: boolean;
}

const schemaCache = new Map<string, Promise<Map<string, TableSchemaInfo>>>();

function loadTableSchemas(
  supabaseUrl: string,
  serviceKey: string,
): Promise<Map<string, TableSchemaInfo>> {
  const cached = schemaCache.get(supabaseUrl);
  if (cached) return cached;
  const promise = (async () => {
    const map = new Map<string, TableSchemaInfo>();
    const t = timeoutSignal(SCHEMA_TIMEOUT_MS);
    try {
      const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        signal: t.signal,
      });
      if (!res.ok) return map;
      const api = (await res.json()) as {
        definitions?: Record<
          string,
          {
            properties?: Record<string, Record<string, unknown>>;
            required?: string[];
          }
        >;
      };
      for (const table of new Set([...READ_TABLES, ...WRITE_TABLES])) {
        const def = api.definitions?.[table];
        if (!def?.properties) continue;
        const columns = Object.keys(def.properties);
        map.set(table, {
          columns,
          required: def.required ?? [],
          hasWorkspaceId: columns.includes("workspace_id"),
        });
      }
    } catch {
      // Schema awareness is best-effort.
    } finally {
      t.done();
    }
    return map;
  })();
  schemaCache.set(supabaseUrl, promise);
  return promise;
}

function schemaSection(schemas: Map<string, TableSchemaInfo>): string {
  const lines: string[] = ["", "REAL TABLE COLUMNS (use exactly these names):"];
  for (const [table, info] of schemas) {
    const marker = WRITE_TABLES.has(table) ? " [writable]" : "";
    const req = info.required.filter((c) => c !== "id" && c !== "created_at" && c !== "updated_at");
    lines.push(
      `- ${table}${marker}: ${info.columns.join(", ")}` +
        (req.length ? ` | required: ${req.join(", ")}` : ""),
    );
  }
  return lines.join("\n");
}

interface OutboundMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

async function supabaseFetch(
  opts: {
    supabaseUrl: string;
    serviceKey: string;
    method: "GET" | "POST" | "PATCH" | "DELETE";
    path: string;
    body?: unknown;
    preferCount?: boolean;
  },
): Promise<{ ok: boolean; status: number; json: unknown; count: number | null }> {
  const headers: Record<string, string> = {
    apikey: opts.serviceKey,
    Authorization: `Bearer ${opts.serviceKey}`,
    "Content-Type": "application/json",
  };
  if (opts.preferCount) headers.Prefer = "count=exact";
  if (opts.method !== "GET") headers.Prefer = opts.preferCount ? headers.Prefer : "return=representation";
  const t = timeoutSignal(SUPABASE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${opts.supabaseUrl}/rest/v1/${opts.path}`, {
      method: opts.method,
      headers,
      body: opts.body == null ? undefined : JSON.stringify(opts.body),
      signal: t.signal,
    });
  } finally {
    t.done();
  }
  let json: unknown = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  const contentRange = res.headers.get("content-range");
  let count: number | null = null;
  if (contentRange) {
    const total = contentRange.split("/")[1];
    count = total && total !== "*" ? Number(total) : null;
  }
  return { ok: res.ok, status: res.status, json, count };
}

async function logRun(
  ctx: { supabaseUrl: string; serviceKey: string },
  row: Record<string, unknown>,
): Promise<void> {
  try {
    await supabaseFetch({ ...ctx, method: "POST", path: "ai_run_logs", body: row });
  } catch {
    // Logging must never break the chat.
  }
}

function buildQueryPath(
  table: string,
  filters: { column: string; op: string; value: string }[] | undefined,
  orderBy: string | undefined,
  orderDir: string | undefined,
  limit: number | undefined,
): string {
  const params = new URLSearchParams();
  params.set("select", "*");
  for (const f of filters ?? []) {
    params.set(f.column, `${f.op}.${f.value}`);
  }
  if (orderBy) params.set("order", `${orderBy}${orderDir ? "." + orderDir : ""}`);
  params.set("limit", String(Math.min(Math.max(limit ?? 20, 1), 100)));
  return `${table}?${params.toString()}`;
}

function truncateRows(rows: unknown): string {
  const text = JSON.stringify(rows);
  return text.length > 12_000 ? text.slice(0, 12_000) + "...[truncated]" : text;
}

/** Head+tail elision so oversized turns cannot dominate the token budget. */
function elide(text: string, capChars: number, headChars: number, tailChars: number): string {
  if (text.length <= capChars) return text;
  return (
    text.slice(0, headChars) +
    "\n…[middle elided]…" +
    text.slice(-tailChars)
  );
}

async function executeTool(
  name: string,
  rawArgs: string,
  ctx: {
    supabaseUrl: string;
    serviceKey: string;
    workspaceId?: string;
    conversationId?: string;
    schemas: Map<string, TableSchemaInfo>;
  },
): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
  } catch {
    return JSON.stringify({ error: "Invalid JSON arguments." });
  }

  const str = (v: unknown) => (typeof v === "string" ? v : "");

  if (name === "inspect_columns") {
    const table = str(args.table);
    if (!READ_TABLES.has(table)) return JSON.stringify({ error: `Table '${table}' is not readable.` });
    const out = await supabaseFetch({
      ...ctx,
      method: "GET",
      path: `${table}?select=*&limit=1`,
    });
    if (!out.ok) return JSON.stringify({ error: `HTTP ${out.status}`, details: out.json });
    const row = Array.isArray(out.json) ? out.json[0] : null;
    return JSON.stringify({ table, columns: row ? Object.keys(row) : [] });
  }

  if (name === "query_site_data" || name === "count_site_data") {
    const table = str(args.table);
    if (!READ_TABLES.has(table)) return JSON.stringify({ error: `Table '${table}' is not readable.` });
    const tableSchema = ctx.schemas.get(table);
    const filters = Array.isArray(args.filters)
      ? (args.filters as { column?: unknown; op?: unknown; value?: unknown }[])
          .filter((f) => typeof f.column === "string" && typeof f.op === "string" && FILTER_OPS.has(String(f.op)))
          .map((f) => ({ column: String(f.column), op: String(f.op), value: String(f.value ?? "") }))
      : undefined;
    if (filters?.length && tableSchema) {
      const unknown = filters.filter((f) => !tableSchema.columns.includes(f.column));
      if (unknown.length > 0) {
        return JSON.stringify({
          error: `Unknown filter column(s): ${unknown.map((f) => f.column).join(", ")}`,
          valid_columns: tableSchema.columns,
        });
      }
    }
    if (name === "count_site_data") {
      const path = buildQueryPath(table, filters, undefined, undefined, 1);
      const out = await supabaseFetch({ ...ctx, method: "GET", path, preferCount: true });
      if (!out.ok) return JSON.stringify({ error: `HTTP ${out.status}`, details: out.json });
      return JSON.stringify({ table, count: out.count });
    }
    const path = buildQueryPath(
      table,
      filters,
      args.order_by == null ? undefined : str(args.order_by),
      str(args.order_dir) || undefined,
      typeof args.limit === "number" ? args.limit : undefined,
    );
    const out = await supabaseFetch({ ...ctx, method: "GET", path });
    if (!out.ok) return JSON.stringify({ error: `HTTP ${out.status}`, details: out.json });
    return truncateRows(out.json);
  }

  if (
    name === "get_cad_drawing" ||
    name === "list_cad_layers" ||
    name === "count_cad_entities" ||
    name === "inspect_cad_entity"
  ) {
    const uuidRe = /^[0-9a-f-]{36}$/i;
    const projectId = str(args.project_id);
    if (!uuidRe.test(projectId))
      return JSON.stringify({ error: "A valid project_id UUID is required." });
    for (const key of ["layer_id", "entity_id"]) {
      const value = args[key];
      if (value != null && !uuidRe.test(str(value)))
        return JSON.stringify({ error: `A valid ${key} UUID is required.` });
    }
    const out = await supabaseFetch({
      ...ctx,
      method: "GET",
      path: `project_cad_drawings?project_id=eq.${projectId}&select=model`,
    });
    if (!out.ok) return JSON.stringify({ error: `HTTP ${out.status}`, details: out.json });
    const rows = Array.isArray(out.json) ? out.json : [];
    if (rows.length === 0)
      return JSON.stringify({ error: "No drawing found for this project." });
    const row = rows[0] as { model?: unknown };

    const model =
      row.model && typeof row.model === "object" ? (row.model as Record<string, unknown>) : {};
    const arr = (key: string): Record<string, unknown>[] =>
      Array.isArray(model[key]) ? (model[key] as Record<string, unknown>[]) : [];

    if (name === "get_cad_drawing") {
      const full = JSON.stringify(row.model ?? {});
      if (full.length <= CAD_MODEL_CAP_CHARS) return JSON.stringify({ model: row.model });
      // Too large to inline (it would be re-sent on every later round and
      // stall the model). Summarise instead; the read tools drill down.
      const counts: Record<string, number> = {};
      const idSamples: Record<string, string[]> = {};
      for (const [singular, plural] of Object.entries(CAD_ENTITY_ARRAYS)) {
        const entities = arr(plural);
        counts[singular] = entities.length;
        idSamples[singular] = entities
          .slice(0, CAD_SAMPLE_IDS_PER_TYPE)
          .map((e) => String(e.id))
          .filter((id) => id && id !== "undefined");
      }
      return JSON.stringify({
        model_summary_only: true,
        reason: `Full drawing is ${full.length} chars — too large to inline.`,
        entity_counts: counts,
        layers: arr("layers").map((layer) => ({
          id: layer.id,
          name: layer.name,
          color: layer.color,
          visible: layer.visible,
          locked: layer.locked,
        })),
        sample_entity_ids: idSamples,
        next_step:
          "Use count_cad_entities / list_cad_layers for totals and inspect_cad_entity for individual entities. Never guess geometry you have not fetched.",
      });
    }

    if (name === "list_cad_layers") {
      const counts = new Map<string, number>();
      for (const plural of Object.values(CAD_ENTITY_ARRAYS)) {
        for (const entity of arr(plural)) {
          const layerId = entity.layerId;
          if (typeof layerId === "string")
            counts.set(layerId, (counts.get(layerId) ?? 0) + 1);
        }
      }
      return JSON.stringify({
        layers: arr("layers").map((layer) => ({
          id: layer.id,
          name: layer.name,
          color: layer.color,
          visible: layer.visible,
          locked: layer.locked,
          entity_count:
            counts.get(typeof layer.id === "string" ? layer.id : "") ?? 0,
        })),
      });
    }

    if (name === "count_cad_entities") {
      const layerFilter = str(args.layer_id) || undefined;
      const typeFilter = str(args.entity_type) || undefined;
      if (typeFilter && !(typeFilter in CAD_ENTITY_ARRAYS))
        return JSON.stringify({
          error: `Unknown entity_type '${typeFilter}'. Valid types: ${Object.keys(CAD_ENTITY_ARRAYS).join(", ")}.`,
        });
      const byType: Record<string, number> = {};
      let total = 0;
      for (const [singular, plural] of Object.entries(CAD_ENTITY_ARRAYS)) {
        if (typeFilter && singular !== typeFilter) continue;
        const entities = arr(plural);
        const n = layerFilter
          ? entities.filter((e) => e.layerId === layerFilter).length
          : entities.length;
        byType[singular] = n;
        total += n;
      }
      return JSON.stringify({
        total,
        by_type: byType,
        layer_filter: layerFilter ?? null,
        type_filter: typeFilter ?? null,
      });
    }

    const entityId = str(args.entity_id);
    for (const [singular, plural] of Object.entries(CAD_ENTITY_ARRAYS)) {
      const found = arr(plural).find((e) => e.id === entityId);
      if (found) return JSON.stringify({ entity_type: singular, entity: found });
    }
    return JSON.stringify({ error: "Entity not found" });
  }

  if (name === "close_overdue_invoices") {
    return closeOverdueInvoices(
      { supabaseFetch },
      { supabaseUrl: ctx.supabaseUrl, serviceKey: ctx.serviceKey },
      (args as {
        scope?: { workspace_id?: string };
        target_status?: string;
      }),
    );
  }
  if (name === "create_quote_from_line_items") {
    return createQuoteFromLineItems(
      { supabaseFetch },
      {
        supabaseUrl: ctx.supabaseUrl,
        serviceKey: ctx.serviceKey,
        workspaceId: ctx.workspaceId,
      },
      (args as {
        project_id?: string;
        contact_id?: string;
        currency_code?: string;
        lines: { description?: string; qty?: number; rate?: number; unit?: string }[];
        tax_rate_percent?: number;
        notes?: string;
      }),
    );
  }
  if (name === "schedule_job") {
    return scheduleJob(
      { supabaseFetch },
      { supabaseUrl: ctx.supabaseUrl, serviceKey: ctx.serviceKey, workspaceId: ctx.workspaceId },
      (args as {
        job_id: string;
        assignment_date?: string;
        notes?: string;
        status?: "draft" | "confirmed" | "in_progress" | "completed" | "cancelled";
      }),
    );
  }

  if (name === "remember" || name === "forget") {
    if (!ctx.conversationId)
      return JSON.stringify({
        error: "Structured memory requires a conversation_id on this run.",
      });
    const key = str(args.key);
    if (!key) return JSON.stringify({ error: "A non-empty key is required." });
    if (name === "remember") {
      const ok = await remember(
        { supabaseFetch },
        { supabaseUrl: ctx.supabaseUrl, serviceKey: ctx.serviceKey, conversationId: ctx.conversationId },
        key,
        args.value,
      );
      return JSON.stringify({ remembered: ok, key });
    }
    const ok = await forget(
      { supabaseFetch },
      { supabaseUrl: ctx.supabaseUrl, serviceKey: ctx.serviceKey, conversationId: ctx.conversationId },
      key,
    );
    return JSON.stringify({ forgotten: ok, key });
  }

  const table = str(args.table);
  const confirmed = args.confirmed === true;

  if (!WRITE_TABLES.has(table)) return JSON.stringify({ error: `Table '${table}' is not writable.` });

  // Sanitise payloads against the live schema: drop unknown columns (the
  // model is told which were dropped) and stamp the caller's workspace.
  const schema = ctx.schemas.get(table);
  const sanitise = (
    payload: Record<string, unknown> | undefined,
  ): { clean: Record<string, unknown>; dropped: string[] } => {
    const input = { ...(payload ?? {}) };
    const dropped: string[] = [];
    let clean = input;
    if (schema) {
      clean = {};
      for (const [key, value] of Object.entries(input)) {
        if (key === "id" || key === "created_at" || key === "updated_at") continue;
        if (schema.columns.includes(key)) clean[key] = value;
        else dropped.push(key);
      }
    }
    if (ctx.workspaceId && (!schema || schema.hasWorkspaceId)) {
      if (clean.workspace_id == null) clean.workspace_id = ctx.workspaceId;
    }
    return { clean, dropped };
  };

  if (name === "insert_site_record") {
    const { clean, dropped } = sanitise(args.record as Record<string, unknown>);
    if (dropped.length > 0) {
      return JSON.stringify({
        error: `Ignored unknown columns: ${dropped.join(", ")}`,
        valid_columns: schema ? schema.columns : undefined,
      });
    }
    const out = await supabaseFetch({ ...ctx, method: "POST", path: table, body: clean });
    if (!out.ok)
      return JSON.stringify({
        error: `HTTP ${out.status}`,
        details: out.json,
        hint: schema
          ? `Valid columns for ${table}: ${schema.columns.join(", ")}`
          : undefined,
      });
    const inserted = Array.isArray(out.json) ? out.json[0] : null;
    const newId = inserted && typeof inserted.id === "string" ? inserted.id : undefined;
    if (!newId) return JSON.stringify({ inserted: out.json, _verified: false });
    const verify = await supabaseFetch({
      ...ctx,
      method: "GET",
      path: `${table}?id=eq.${newId}&select=*`,
    });
    const row = Array.isArray(verify.json) ? verify.json[0] : inserted;
    return JSON.stringify({ inserted: row, _verified: verify.ok && !!row });
  }

  const id = str(args.id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return JSON.stringify({ error: "A valid UUID id is required." });

  if (name === "update_site_record") {
    const { clean, dropped } = sanitise(args.patch as Record<string, unknown>);
    if (dropped.length > 0) {
      return JSON.stringify({
        error: `Ignored unknown columns: ${dropped.join(", ")}`,
        valid_columns: schema ? schema.columns : undefined,
      });
    }
    const out = await supabaseFetch({
      ...ctx,
      method: "PATCH",
      path: `${table}?id=eq.${id}`,
      body: clean,
    });
    if (!out.ok)
      return JSON.stringify({
        error: `HTTP ${out.status}`,
        details: out.json,
        hint: schema
          ? `Valid columns for ${table}: ${schema.columns.join(", ")}`
          : undefined,
      });
    const verify = await supabaseFetch({
      ...ctx,
      method: "GET",
      path: `${table}?id=eq.${id}&select=*`,
    });
    const row = Array.isArray(verify.json) ? verify.json[0] : null;
    return JSON.stringify({ updated: row ?? out.json, _verified: verify.ok && !!row });
  }

  if (name === "delete_site_record") {
    if (!confirmed)
      return JSON.stringify({
        status: "pending_confirmation",
        instruction:
          "Deletes are permanent. Confirm scope with the user and suggest archiving instead when sensible. Only then confirmed=true.",
        table,
        id,
      });
    const out = await supabaseFetch({ ...ctx, method: "DELETE", path: `${table}?id=eq.${id}` });
    if (!out.ok) return JSON.stringify({ error: `HTTP ${out.status}`, details: out.json });
    return JSON.stringify({ deleted: true });
  }

  return JSON.stringify({ error: `Unknown tool '${name}'.` });
}

/** Minimal SSE line reader over a fetch body (works on Deno and Node 18+). */
async function* sseEvents(res: Response): AsyncGenerator<{ data: string }> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line.startsWith("data:")) yield { data: line.slice(5).trim() };
    }
  }
}

interface UpstreamChoice {
  delta?: {
    content?: string | null;
    tool_calls?: {
      index: number;
      id?: string;
      function?: { name?: string; arguments?: string };
    }[];
  };
  finish_reason?: string | null;
}

/**
 * Maps the tool calls made in a run to a candidate skill key for
 * auto-promotion. Returns undefined when nothing meaty happened (e.g. the
 * model asked a question or only read data), so we don't pollute examples.
 */
function skillKeyForTrace(trace: { name: string; args: unknown }[]): string | undefined {
  const names = trace.map((t) => t.name);
  if (names.includes("close_overdue_invoices")) return "close-overdue-invoices";
  if (names.includes("create_quote_from_line_items")) return "create-quote";
  if (names.includes("schedule_job")) return "schedule-job";
  if (
    names.some((n) => n === "insert_site_record" || n === "update_site_record") &&
    trace.some((t) => {
      const args = t.args as { table?: string };
      return args?.table === "contacts";
    })
  ) {
    return "contact-records";
  }
  if (names.some((n) => n.startsWith("list_cad") || n.startsWith("get_cad") || n.includes("_layer"))) {
    return "default-cad-layers";
  }
  return undefined;
}

/**
 * Auto-promotes a successful run transcript into the matching skill's
 * examples so the model gets ground-truth few-shots of how the system wants
 * a task done. Best-effort; never throws.
 */
async function promoteRun(
  selectedSkills: import("./skills.ts").Skill[],
  trace: { name: string; args: unknown }[],
  userMessage: string,
  result: string,
  ctx: { supabaseFetch: typeof supabaseFetch; supabaseUrl: string; serviceKey: string },
): Promise<void> {
  if (trace.length === 0 || !userMessage.trim()) return;
  const key = skillKeyForTrace(trace);
  if (!key) return;
  if (!selectedSkills.some((s) => s.key === key)) return;
  const clean = trace.map((t) => ({ name: t.name, args: (t.args ?? {}) as Record<string, unknown> }));
  try {
    await promoteExample(
      { supabaseFetch: ctx.supabaseFetch },
      { supabaseUrl: ctx.supabaseUrl, serviceKey: ctx.serviceKey },
      key,
      { prompt: userMessage.trim(), tools: clean, result },
    );
  } catch {
    // Promotion must never break the chat.
  }
}

/**
 * Runs the agent loop and yields delta/final/error events.
 * final always carries the complete reply text.
 */
export async function* runAgent(opts: RunAgentOptions): AsyncGenerator<AgentEvent> {
  const supabaseUrl = opts.supabaseUrl.replace(/\/$/, "");
  // Hard allowlist: unknown/empty falls back to the default. Serve paths
  // (ai-chat, ai-gateway-server) call resolveModel() so this rarely fires,
  // but it keeps the boundary enforced even for direct internal callers
  // (eval harness, tests) and prevents accidental model drift.
  if (opts.model && !isAllowedModel(opts.model)) {
    yield { type: "error", message: `Model '${opts.model}' is not in the allowlist.` };
    return;
  }
  const [schemas, loadedSkills, memoryFacts] = await Promise.all([
    loadTableSchemas(supabaseUrl, opts.serviceKey),
    loadSkills(
      { supabaseFetch },
      { supabaseUrl, serviceKey: opts.serviceKey },
    ),
    opts.conversationId
      ? loadMemory(
          { supabaseFetch },
          {
            supabaseUrl,
            serviceKey: opts.serviceKey,
            conversationId: opts.conversationId,
          },
        )
      : Promise.resolve([]),
  ]);
  const ctx = {
    supabaseUrl,
    serviceKey: opts.serviceKey,
    workspaceId: opts.workspaceId,
    conversationId: opts.conversationId,
    schemas,
  };
  const trace: { name: string; args: unknown }[] = [];
  let finalText = "";
  let runErrorMessage: string | undefined;
  const startedAt = new Date().toISOString();
  const finalize = async (
    outcome: "success" | "error" | "cancelled",
    errorText?: string,
  ): Promise<void> => {
    runErrorMessage = errorText ?? runErrorMessage;
    await logRun(ctx, {
      user_id: opts.userId ?? null,
      workspace_id: opts.workspaceId ?? null,
      conversation_id: opts.conversationId ?? null,
      project_id: opts.projectId ?? null,
      model: opts.model || DEFAULT_MODEL,
      context: opts.context ?? "dashboard",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      rounds: round,
      tool_calls: trace,
      final_text: finalText || null,
      outcome,
      error: runErrorMessage ?? null,
    });
  };
  const selectedSkills = selectSkills(opts.userMessage, loadedSkills);
  const system =
    systemPrompt(supabaseUrl) +
    "\n" +
    schemaSection(schemas) +
    formatSkillContext(selectedSkills) +
    formatMemoryBlock(memoryFacts) +
    (opts.memoryNote?.trim()
      ? `\n\nCONVERSATION MEMORY — notes about earlier in this chat:\n${opts.memoryNote.trim()}\nTreat as background context, not current state. If it records a pending write awaiting the user's yes/no, that confirmation is still open. Re-verify exact numbers and coordinates with tools when precision matters.`
      : "") +
    (opts.workspaceId
      ? `\nWhen creating or updating business records, ALWAYS set workspace_id to "${opts.workspaceId}" unless the user explicitly names another workspace.`
      : "") +
    (opts.projectId
      ? `\nThe user currently has project ${opts.projectId} open in the CAD workspace.`
      : "");

  const outbound: OutboundMessage[] = [
    { role: "system", content: system },
    ...opts.history.slice(-MAX_HISTORY_TURNS).map((turn) => ({
      role: turn.role,
      content: elide(turn.content, HISTORY_TURN_CAP_CHARS, 1_200, 400),
    })),
    {
      role: "user",
      content: elide(opts.userMessage, LIVE_MESSAGE_CAP_CHARS, 4_500, 1_000),
    },
  ];

  let round = 0;
  const maxRounds =
    opts.maxToolRounds ??
    (scoreComplexity(opts.userMessage, selectedSkills.length) === "complex"
      ? MAX_TOOL_ROUNDS
      : SIMPLE_MAX_ROUNDS);
  while (round < maxRounds) {
    round += 1;
    yield {
      type: "status",
      phase:
        round === 1 ? "thinking" : `working (step ${round}/${maxRounds})`,
    };

    // Watchdog: abort the upstream request when it stalls (no SSE traffic
    // for LLM_IDLE_TIMEOUT_MS) or blows past LLM_ROUND_TIMEOUT_MS total.
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    if (opts.signal?.aborted) controller.abort();
    else opts.signal?.addEventListener("abort", onOuterAbort, { once: true });
    const startedAt = Date.now();
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let stalled = false;
    const armIdle = () => {
      if (idleTimer !== undefined) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        stalled = true;
        controller.abort();
      }, LLM_IDLE_TIMEOUT_MS);
    };
    armIdle();

    let content = "";
    const toolCalls = new Map<
      number,
      { id: string; name: string; arguments: string; index: number }
    >();
    let finishReason: string | null = null;

    try {
      let res: Response;
      try {
        res = await fetch(DASHSCOPE_URL, {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${opts.dashscopeKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://sitesurveyor.app",
            "X-Title": "SiteSurveyor AI",
          },
          body: JSON.stringify({
            model: opts.model || DEFAULT_MODEL,
            messages: outbound,
            tools: TOOLS,
            stream: true,
          }),
        });
      } catch (err) {
        throw new Error(`Could not reach DashScope (Alibaba Model Studio): ${(err as Error).message}`);
      }

      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `DashScope error ${res.status}: ${detail.slice(0, 300) || "no response"}`,
        );
      }

      try {
        for await (const evt of sseEvents(res)) {
          armIdle();
          if (Date.now() - startedAt > LLM_ROUND_TIMEOUT_MS) {
            stalled = true;
            controller.abort();
          }
          if (evt.data === "[DONE]") break;
          let parsed: { choices?: UpstreamChoice[] };
          try {
            parsed = JSON.parse(evt.data) as { choices?: UpstreamChoice[] };
          } catch {
            continue;
          }
          const choice = parsed.choices?.[0];
          if (!choice) continue;
          if (choice.delta?.content) {
            content += choice.delta.content;
            yield { type: "delta", text: choice.delta.content };
          }
          for (const tc of choice.delta?.tool_calls ?? []) {
            const slot =
              toolCalls.get(tc.index) ??
              { id: "", name: "", arguments: "", index: tc.index };
            if (tc.id) slot.id = tc.id;
            if (tc.function?.name) slot.name = tc.function.name;
            if (tc.function?.arguments) slot.arguments += tc.function.arguments;
            toolCalls.set(tc.index, slot);
          }
          if (choice.finish_reason) finishReason = choice.finish_reason;
        }
      } catch (err) {
        throw new Error(`Stream failed: ${(err as Error).message}`);
      }
    } catch (err) {
      const message = stalled
        ? `AI request timed out (no progress for ${Math.round(LLM_IDLE_TIMEOUT_MS / 1000)}s) — please try again.`
        : (err as Error).message;
      yield { type: "error", message };
      if (opts.signal?.aborted) {
        await finalize("cancelled", "cancelled by caller");
      } else {
        await finalize("error", message);
      }
      return;
    } finally {
      if (idleTimer !== undefined) clearTimeout(idleTimer);
      opts.signal?.removeEventListener("abort", onOuterAbort);
    }

    if (finishReason === "tool_calls" && toolCalls.size > 0) {
      outbound.push({
        role: "assistant",
        content: content || null,
        ...(toolCalls.size > 0
          ? {
              tool_calls: [...toolCalls.values()].map((tc) => ({
                id: tc.id || `call_${tc.name}_${tc.index ?? 0}`,
                type: "function" as const,
                function: { name: tc.name, arguments: tc.arguments || "{}" },
              })),
            }
          : {}),
      });
      const ordered = [...toolCalls.entries()].sort((a, b) => a[0] - b[0]);
      for (const [, tc] of ordered) {
        let args: unknown = tc.arguments;
        try {
          args = JSON.parse(tc.arguments || "{}");
        } catch {
          /* keep raw string */
        }
        trace.push({ name: tc.name, args });
        yield { type: "tool", name: tc.name };
      }
      // Independent tools run concurrently; results are re-paired with their
      // tool_call_ids in original order below.
      const results = await Promise.all(
        ordered.map(async ([, tc]) => {
          try {
            return await executeTool(tc.name, tc.arguments, ctx);
          } catch (err) {
            return JSON.stringify({ error: `Tool crashed: ${(err as Error).message}` });
          }
        }),
      );
      ordered.forEach(([, tc], i) => {
        outbound.push({
          role: "tool",
          tool_call_id: tc.id || `call_${tc.name}_${tc.index ?? 0}`,
          content: results[i],
        });
      });
      continue; // next model round with tool results
    }

    // Plain final answer. Guard against silent-empty completions: a provider
    // occasionally reports `stop` (or `tool_calls` with no parseable calls)
    // while yielding no content — surface a retryable message instead of an
    // empty reply, which the client would have to report as an error.
    const dbg =
      (globalThis as { process?: { env?: Record<string, string> } }).process?.env?.SS_AI_DEBUG;
    if (dbg)
      console.error(
        `[ai-agent] round=${round} finish=${finishReason} contentLen=${content.length} tools=${toolCalls.size}`,
      );
    if (!content.trim()) {
      yield {
        type: "final",
        text: "I couldn't complete that response — please send it again.",
      };
      await finalize("error", "empty completion");
      return;
    }
    finalText = content.trim();
    yield { type: "final", text: content.trim() };
    await promoteRun(selectedSkills, trace, opts.userMessage, content.trim(), {
      supabaseFetch,
      supabaseUrl,
      serviceKey: opts.serviceKey,
    });
    await finalize("success");
    return;
  }

  yield {
    type: "error",
    message: "The agent ran out of tool rounds before producing a final answer.",
  };
  await finalize("error", "out of tool rounds");
}

// ── Rolling conversation memory ───────────────────────────────────────────
// Best-effort background compaction: folds turns that fell out of the
// verbatim window into dense notes. Callers persist the result on
// ai_conversations.summary / summary_through.

const SUMMARY_SYSTEM = [
  "You maintain the rolling memory of SiteSurveyor, an AI agent for a survey",
  "operations platform. Merge PRIOR NOTES and NEW TURNS into one updated note",
  "block (max ~250 words). Preserve exactly:",
  "- decisions, preferences and constraints the user stated;",
  "- record IDs, names, counts, money amounts and coordinates mentioned;",
  "- open questions and stated assumptions;",
  "- any pending WRITE PROPOSAL awaiting the user's yes/no — quote it",
  "  precisely; it must survive until confirmed or explicitly cancelled.",
  "Drop greetings, filler and resolved small talk. Output only the notes.",
].join("\n");

/**
 * Folds older turns into a rolling summary. Returns null when the upstream
 * call fails or yields nothing usable — summarisation is best-effort and
 * simply retried on a later turn.
 */
export async function summarizeConversationTurns(opts: {
  dashscopeKey: string;
  priorSummary: string;
  turns: ChatTurn[];
  model?: string;
}): Promise<string | null> {
  if (opts.turns.length === 0) return null;
  const transcript = opts.turns
    .map((t) => `${t.role}: ${elide(t.content, 2_000, 1_500, 300)}`)
    .join("\n");
  const t = timeoutSignal(30_000);
  try {
    const res = await fetch(DASHSCOPE_URL, {
      method: "POST",
      signal: t.signal,
      headers: {
        Authorization: `Bearer ${opts.dashscopeKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://sitesurveyor.app",
        "X-Title": "SiteSurveyor AI",
      },
      body: JSON.stringify({
        model: opts.model || DEFAULT_MODEL,
        stream: false,
        messages: [
          { role: "system", content: SUMMARY_SYSTEM },
          {
            role: "user",
            content:
              `PRIOR NOTES:\n${opts.priorSummary.trim() || "(none)"}\n\n` +
              `NEW TURNS:\n${transcript}\n\n` +
              "Output the updated notes only.",
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    return text ? text : null;
  } catch {
    return null;
  } finally {
    t.done();
  }
}
