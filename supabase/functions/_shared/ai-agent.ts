// SiteSurveyor AI agent core — shared by the `ai-chat` Edge Function (Deno)
// and the host-server fallback (Node). Zero external dependencies: talks to
// the NVIDIA NIM (Nemotron) OpenAI-compatible chat completions API
// (https://integrate.api.nvidia.com/v1) with streaming +
// tool-calling, and executes tools against the platform's Supabase REST API
// with the service-role key. Never imported by browser code.
//
// Safety contract (enforced here, mirrored in the system prompt):
// - Every read and write is pinned to the run's workspace (see scoping.ts):
//   the service-role key bypasses RLS, so the predicate has to be in the query.
// - Reads are free against the whitelisted tables of that workspace.
// - Writes (insert/update/delete) are whitelisted and REQUIRE the model to
//   have shown the change and received an affirmative user reply before it
//   may set confirmed=true.

import {
  closeOverdueInvoices,
  createQuoteFromLineItems,
  scheduleJob,
} from "./workflows.ts";
import {
  quoteSatelliteSurvey,
  launchSatelliteSurvey,
  getSatelliteSurveyStatus,
  getSatelliteSurveyResult,
} from "./satellite-survey-workflow.ts";
import {
  formatSkillContext,
  loadSkills,
  promoteExample,
  selectSkills,
} from "./skills.ts";
import { forget, formatMemoryBlock, loadMemory, remember } from "./memory.ts";
import {
  PUBLIC_READ_TABLES,
  scopeRead,
  scopeWrite,
  workspaceParam,
} from "./scoping.ts";
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
  nvidiaApiKey: string;
  supabaseUrl: string;
  serviceKey: string;
  maxToolRounds?: number;
  /** The signed-in user's primary workspace — stamped onto business writes. */
  workspaceId?: string;
  /** Project the user has open in the CAD workspace, if any. */
  projectId?: string;
  /** Earth Observation survey run the user has open in the workbench, if any. */
  surveyRunId?: string;
  /** Rolling conversation summary (notes about turns outside the history window). */
  memoryNote?: string;
  /** Optional abort signal so callers can cancel an in-flight agent run. */
  signal?: AbortSignal;
  /** Override the default LLM model sent to NVIDIA NIM (Nemotron). */
  model?: string;
  /** Signed-in user id, for run attribution (optional). */
  userId?: string;
  /** Conversation this run belongs to, for run attribution (optional). */
  conversationId?: string;
  /** Chat-list context (dashboard vs cad); default 'dashboard'. */
  context?: string;
  /**
   * Agent surface. "workspace" (default) is the full signed-in assistant.
   * "market" is the anonymous public-market concierge: read-only tools over
   * the published market views, market-specific prompt, no skills/memory.
   */
  mode?: "workspace" | "market";
}

const NVIDIA_NIM_URL =
  "https://integrate.api.nvidia.com/v1/chat/completions";
const MAX_TOOL_ROUNDS = 8;
/** Routine (simple) tasks never need the full round budget — cap them lower so
 *  a single query can't chain eight slow model round-trips. Complex tasks keep
 *  the full budget via scoreComplexity(). Nemotron tends to issue one tool per
 *  round, so this leaves headroom past a single lookup-and-answer exchange. */
const SIMPLE_MAX_ROUNDS = 4;
/** An identical tool call is allowed twice per turn. The third is a loop: the
 *  model is asking for data it already has and is not making progress. */
const MAX_IDENTICAL_CALLS = 2;
/** Appended as a final user turn when the budget is spent. The wrap-up request
 *  carries no tool schema, so this is the one instruction the model can obey. */
const WRAP_UP_INSTRUCTION =
  "You have used every tool call allowed for this turn and cannot call tools " +
  "again. Write the user's answer now using only the tool results already in " +
  "this conversation. Report the findings you have, and state plainly what you " +
  "could not determine instead of guessing or asking to search again. Never " +
  "claim a record was created, updated or deleted unless a tool result " +
  "confirms it; if a call you attempted never ran, say so.";
/** Prior turns replayed to the model — every turn is re-sent on each round. */
const MAX_HISTORY_TURNS = 16;
/** Per-turn elision caps so one huge message cannot eat the whole window. */
const HISTORY_TURN_CAP_CHARS = 1_800;
const LIVE_MESSAGE_CAP_CHARS = 6_000;

// Latency guards: every outbound call has a deadline so a stalled upstream
// surfaces as an error instead of a frozen chat.
const SUPABASE_TIMEOUT_MS = 15_000;
const SCHEMA_TIMEOUT_MS = 10_000;
/** Max silence between SSE chunks from NVIDIA NIM (Nemotron) before the round is aborted. */
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

/**
 * Tables the agent may read. Each is scoped to one workspace; the three that do
 * not carry their own `workspace_id` are declared in scoping.ts.
 */
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

/**
 * Tables the anonymous public-market concierge may read: the published market
 * views only (available listings, open jobs, upcoming training — never
 * workspace records). Backs the `market-chat` surface, and the only tables
 * readable without a workspace — see scoping.ts.
 */
const MARKET_READ_TABLES = PUBLIC_READ_TABLES;

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

/**
 * The read-only tool trio (inspect columns / query rows / count rows) built
 * against a table allowlist. The workspace assistant gets every readable
 * table; the public market concierge gets the published market views only.
 */
function readTools(tables: ReadonlySet<string>): ToolSchema[] {
  return [
    {
      type: "function",
      function: {
        name: "inspect_columns",
        description:
          "List the column names of a table, from the Data API description rather than a sample row. Use when unsure which columns exist before filtering or writing.",
        parameters: {
          type: "object",
          properties: {
            table: { type: "string", enum: [...tables] },
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
          "Read rows from the SiteSurveyor platform database. Results are already limited to the caller's own workspace, so a workspace_id filter is never needed. Always narrow broad tables with filters or a small limit.",
        parameters: {
          type: "object",
          properties: {
            table: {
              type: "string",
              enum: [...tables],
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
            table: { type: "string", enum: [...tables] },
            filters: filterSchema(),
          },
          required: ["table"],
          additionalProperties: false,
        },
      },
    },
  ];
}

/** Read-only tool set for the anonymous public-market concierge. */
const MARKET_TOOLS: ToolSchema[] = readTools(MARKET_READ_TABLES);

/** Tool names the read-only market concierge is allowed to execute. */
const MARKET_TOOL_NAMES: ReadonlySet<string> = new Set(
  MARKET_TOOLS.map((tool) => tool.function.name),
);

const TOOLS: ToolSchema[] = [
  ...readTools(READ_TABLES),
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
        "Composite workflow: find every overdue invoice in the current workspace and settle it at once (marks them paid). Returns a summary. Use instead of manually querying then patching each one.",
      parameters: {
        type: "object",
        properties: {
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
  },  {
    type: "function",
    function: {
      name: "quote_satellite_survey",
      description:
        "Check pricing, area, coverage and credit balance for an Earth Observation satellite survey. Enforces ONE category at a time (water, minerals, soil, or hazard) and checks that no other survey is currently in progress for the workspace.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["water", "minerals", "soil", "hazard"],
            description:
              "Exactly ONE survey category: 'water' (groundwater/boreholes), 'minerals' (multi-mineral exploration), 'soil' (land capability), or 'hazard' (flood/safety).",
          },
          latitude: {
            type: "number",
            description: "GPS latitude (-56 to 41).",
          },
          longitude: {
            type: "number",
            description: "GPS longitude (-30 to 66).",
          },
          half_deg: {
            type: "number",
            description: "Study area half-degree radius (default 0.06 = ~13km box).",
          },
          client_name: {
            type: "string",
            description: "Optional client or site name.",
          },
          notes: {
            type: "string",
            description: "Questionnaire answers or site notes (e.g. intended water use, target commodity, infrastructure type).",
          },
        },
        required: ["category", "latitude", "longitude"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "launch_satellite_survey",
      description:
        "Deduct workspace credits and launch an Earth Observation satellite survey. Exactly ONE category at a time. Only call AFTER the user explicitly confirmed the credit cost.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["water", "minerals", "soil", "hazard"],
            description: "The confirmed single survey category.",
          },
          latitude: {
            type: "number",
            description: "GPS latitude.",
          },
          longitude: {
            type: "number",
            description: "GPS longitude.",
          },
          half_deg: {
            type: "number",
            description: "Study area half-degree radius (default 0.06).",
          },
          client_name: {
            type: "string",
            description: "Client or site name.",
          },
          project_id: {
            type: "string",
            description:
              "UUID of the project this survey job belongs to. Pass it when the user named or chose a project; Earth Observation jobs are always filed under a project.",
          },
          project_name: {
            type: "string",
            description:
              "Project NAME to resolve when no id is known (case-insensitive match). The launch tool files a single-project workspace automatically; with several projects and no hint it refuses and asks you to ask the user.",
          },
          notes: {
            type: "string",
            description: "Questionnaire answers or site notes.",
          },
          confirmed: {
            type: "boolean",
            description: "Must be true. Only call with true after user confirmed credit deduction.",
          },
        },
        required: ["category", "latitude", "longitude", "confirmed"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_satellite_survey_status",
      description:
        "Check the progress of a satellite survey run in this workspace. For the full findings of a completed run (scores, mineral systems, water depth, targets) use get_satellite_survey_result instead.",
      parameters: {
        type: "object",
        properties: {
          run_id: {
            type: "string",
            description: "Optional UUID of the survey run. If omitted, checks the latest survey run in the workspace.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_satellite_survey_result",
      description:
        "Read the full published dossier of a completed Earth Observation survey: category scores, indicated mineral systems with their map area share, depth-to-water, ranked targets with coordinates, data provenance and published files. Returns a progress pointer while the run is still in flight. Use this to answer what a survey found.",
      parameters: {
        type: "object",
        properties: {
          run_id: {
            type: "string",
            description: "Optional UUID of the survey run. If omitted, reads the latest survey run in the workspace.",
          },
        },
        additionalProperties: false,
      },
    },
  },

];

function systemPrompt(supabaseUrl: string): string {
  return [
    "You are SiteSurveyor AI, the AI agent of the SiteSurveyor platform -",
    "a multi-tenant survey operations product (projects, dispatching, assets,",
    "quotes, invoicing, time tracking, public market). When asked who you are,",
    "say you are SiteSurveyor AI. Tagline: your surveying reference point.",
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
    "10. Tool rounds are capped and each one costs latency: batch every",
    "   independent lookup into one round, and never repeat a call whose result",
    "   you already have.",
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
    "",
    "EARTH OBSERVATION & SATELLITE SURVEY QUESTIONNAIRE:",
    "When a user enters a survey command (/borehole, /water, /minerals, /prospect, /hazard, /flood, /soil, /agri, /eo) or asks to perform a satellite survey:",
    "Act as SiteSurveyor's Earth Observation Specialist. Conduct an interactive, AI-driven questionnaire. Never expect or demand the user to know raw command syntax or supply all parameters in one shot. Ask short, clear questions and offer clickable [ASK] choice chips so the user can easily guide the survey.",
    "",
    "QUESTIONNAIRE PROTOCOL:",
    "1. CONCURRENCY LOCK CHECK:",
    "   SiteSurveyor strictly enforces ONE survey run at a time per workspace to protect GPU/compute integrity. If a survey is currently in progress ('queued', 'acquiring', 'surveying', 'publishing'), quote_satellite_survey returns SURVEY_IN_PROGRESS. Inform the user warmly, report the active survey's domain and progress %, and ask them to wait for it to complete.",
    "",
    "2. DOMAIN RECOGNITION & WELCOME:",
    "   - /borehole (or /water): Welcome them to the Groundwater & Precision Borehole Siting survey (aquifer recharge, fracture lineaments, deep drilling targets).",
    "   - /minerals (or /prospect): Welcome them to the Mineral Exploration survey (hydrothermal alteration, gossans, shear lineaments).",
    "   - /hazard (or /flood): Welcome them to the Natural Hazards & Site Safety survey (40-year water inundation history, slope stability, safest buildable sites).",
    "   - /soil (or /agri): Welcome them to the Soil & Land Capability survey (soil fertility, vegetation health, erosion risks).",
    "   - /eo: If the user entered /eo without a domain, ask them to pick ONE domain with an [ASK] block:",
    "     [ASK]",
    "     Which survey domain would you like to run?",
    "     - /borehole — Groundwater & Borehole Siting",
    "     - /minerals — Mineral Exploration & Shear Zones",
    "     - /hazard — Natural Hazards & Site Safety",
    "     - /soil — Soil & Agricultural Land Capability",
    "     [/ASK]",
    "",
    "3. INTERACTIVE STEP-BY-STEP QUESTIONS:",
    "   If the user already supplied some details (e.g. coordinates in their command), do NOT ask for those again. Acknowledge them and proceed to the next item.",
    "",
    "   Step A: Target Location & Coordinates:",
    "   If coordinates are missing, ask for:",
    "   - Decimal GPS coordinates (e.g. -19.5048, 29.8459)",
    "   - A city, town or district in Africa (e.g. Gweru, Kadoma, Dodoma, Lusaka, Francistown)",
    "   - Or a Google Maps link or project reference.",
    "   (If a city/region name is provided, verify coordinates or find matching site records in the workspace).",
    "",
    "   Step B: Domain Technical Objectives (Use [ASK] chips):",
    "   * Groundwater (/borehole):",
    "     [ASK]",
    "     What is the intended application for this borehole?",
    "     - Domestic / Residential Borehole",
    "     - Commercial Irrigation & Crop Farming",
    "     - Livestock Watering & Pasture",
    "     - Mining / Industrial Process Water",
    "     [/ASK]",
    "   * Mineral Exploration (/minerals):",
    "     [ASK]",
    "     What commodity or geological structure are you targeting?",
    "     - Multi-Commodity Regional Screening (All available minerals)",
    "     - Gold (Shear zones, quartz veins & gossans)",
    "     - Lithium & Rare Element Pegmatites (LCT)",
    "     - Base Metals (Copper, Zinc, Lead, Nickel, PGMs)",
    "     - Iron Ore, Manganese, Bauxite & Industrial Minerals",
    "     - Artisanal / Alluvial Workings Screening",
    "     [/ASK]",
    "   * Natural Hazards (/hazard):",
    "     [ASK]",
    "     What type of project or risk concern are you evaluating?",
    "     - Residential / Commercial Development",
    "     - Solar / Renewable Energy Project",
    "     - Road, Rail or Linear Infrastructure",
    "     - 40-Year Flood History & Inundation Risk",
    "     - Slope Stability & Landslide Susceptibility",
    "     [/ASK]",
    "   * Soil & Agriculture (/soil):",
    "     [ASK]",
    "     What is the planned agricultural production?",
    "     - Arable Crops (Maize, Soya, Wheat)",
    "     - Horticulture & High-Value Orchards",
    "     - Pasture & Grazing Capacity",
    "     - Baseline Land Capability & Valuation",
    "     [/ASK]",
    "",
    "   Step C: Survey Area Extent (AOI):",
    "   Present area choices with clickable chips:",
    "   [ASK]",
    "   What survey coverage area do you need?",
    "   - Standard Site (~13 km box / 169 km² — 0.06°)",
    "   - Compact Parcel (~5 km box / 25 km² — 0.02°)",
    "   - Regional Block (~25 km box / 625 km² — 0.12°)",
    "   [/ASK]",
    "",
    "   Step D: Optional Project or Client Name:",
    "   Ask if they would like to tag the survey with a project name (e.g. 'Gweru South Farm Borehole 1').",
    "",
    "4. REAL-TIME SERVER QUOTE & BALANCE VERIFICATION:",
    "   As soon as location and domain are known, invoke quote_satellite_survey.",
    "   Present a clear summary:",
    "   - Survey Domain: e.g. Groundwater & Precision Boreholes",
    "   - Location: Centroid coordinates",
    "   - Survey Area: surface_area_km2 and surface_area_ha",
    "   - Questionnaire Notes: user's stated application and focus",
    "   - Credits Required: from price_satellite_survey",
    "   - Workspace Balance: current balance and balance remaining after launch",
    "   If balance is insufficient, state the deficit plainly and direct them to Billing.",
    "",
    "5. MANDATORY CONFIRMATION CHIP:",
    "   Never launch without user approval. Always present the final confirmation chip:",
    "   [ASK]",
    "   Confirm launching [Domain] Survey for [Lat, Lon]?",
    "   This will deduct [N] credits from your workspace balance ([Current] -> [Remaining] credits).",
    "   - Confirm & Launch Survey ([N] credits)",
    "   - Adjust Location or Area",
    "   - Cancel Survey",
    "   [/ASK]",
    "",
    "6. ATOMIC LAUNCH & WORKBENCH HANDOVER:",
    "   When user confirms, invoke launch_satellite_survey with confirmed=true and pass notes.",
    "   Earth Observation jobs always live inside a project: pass project_id (or",
    "   project_name) when the user or conversation names one. The launch tool files a",
    "   single-project workspace automatically; when it refuses with PROJECT_REQUIRED,",
    "   ask the user which project to file the survey under, then relaunch.",
    "   Provide the new run ID and estimated runtime (~4 minutes). Copy the result's",
    "   [WORKBENCH runId=... jobId=... projectId=...] line verbatim into your reply —",
    "   it is what powers the app's Open in Satellite Workbench button.",
    "",
    "7. READING COMPLETED SURVEYS:",
    "   When the user asks what a survey found, call get_satellite_survey_result",
    "   (run_id optional — defaults to the latest run). It returns the category",
    "   scores, indicated mineral systems with their map area share, depth-to-water,",
    "   ranked targets with coordinates, data provenance and the published files.",
    "   Answer with the real numbers from that dossier. Respect claim_ceiling:",
    "   scores rank investigation priority inside this one survey area — they are",
    "   not grade, not tonnage, and two different sites cannot be compared on them.",
    "   While a run is still queued/acquiring/surveying/publishing, report progress",
    "   from get_satellite_survey_status instead of guessing findings.",
    "   When you report on a run, copy its result's [WORKBENCH ...] line verbatim",
    "   so the reader can open that exact run in the workbench.",
    "   If a SURVEY CONTEXT line names an open run, 'this survey' means that run_id.",
    "CAD WORKFLOW:",
    "Before drawing onto an existing drawing, read it first (list_cad_layers)",
    "and reuse its layer names exactly. Group ONE logical action per [CAD]",
    "block (e.g. all setout points together) and keep prose out of blocks.",
    "Finish geometry-creating blocks with ZOOM EXTENTS so the result is",
    "visible. After work the user executed, confirm what changed in one line",
  ].join("\n");
}

/**
 * System prompt for the anonymous public-market concierge served by the
 * `market-chat` endpoint. Read-only by construction: its tool set is the
 * market views only, so the rules below steer behaviour, not capability.
 */
function marketSystemPrompt(supabaseUrl: string): string {
  return [
    "You are SiteSurveyor AI — the AI guide to SiteSurveyor's",
    "public marketplace for the surveying profession. Visitors browse the market",
    "without an account and ask you to find what they need: instruments and",
    "accessories, professionals to hire, open jobs, firms and training courses.",
    "When asked who or what powers you, say you are SiteSurveyor AI, running on",
    "NVIDIA Nemotron.",
    "",
    "You search the live published market through read-only tools:",
    "- public_market_listings — gear for sale or hire (name, type, condition,",
    "  price/currency, seller, location, category instrument|accessory,",
    "  listing_type hire|sale, specs, is_remote, city/country, saves).",
    "- public_market_professionals — people for hire (name, title, discipline,",
    "  rate/rate_per/currency, availability, rating/reviews, skills, location,",
    "  is_remote, saves).",
    "- public_market_jobs — open roles (title, discipline, employment_type,",
    "  rate/rate_per, company, location, seniority, closes_at, is_remote, saves).",
    "- public_market_firms — firms (name, services, rating/reviews, staff_count,",
    "  location, service_areas, is_remote, saves).",
    "- public_market_events — training and courses (title, kind, provider,",
    "  starts_at/ends_at, price, seats_left, cpd_points, certification_body,",
    "  location, is_remote, saves).",
    `Data lives in Supabase (REST base: ${supabaseUrl}).`,
    "",
    "Rules:",
    "1. Answer from tool results with real values — never invent rows, prices,",
    "   counts or ratings. When a search returns nothing, say so plainly and",
    "   widen one dimension (location, price, remote, kind) instead of guessing.",
    "2. Narrow the search: text match with `ilike` and % wildcards (name ilike",
    "   %total station%), location via city/country, price/rate with gt/lt,",
    "   remote with is_remote eq true, rating/saves with gte. Batch independent",
    "   lookups into one round and never repeat a call whose result you have.",
    "3. Format: headline answer first, then up to five short bullets —",
    "   'Name — location — price/rate'. Keep each row's own currency and rate",
    "   unit; never convert. For comparisons order by price or rate and give the",
    "   range in one line.",
    "4. You are read-only: you cannot save, message, request, publish or apply.",
    "   For those actions point at the control that does it — open the item on",
    "   the map or in the registry below, or sign in (header, 'Sign in') to save,",
    "   request or contact.",
    "5. Stay on the public market. Workspace questions (projects, quotes,",
    "   invoices, dispatch, accounts) need sign-in: say that in one line, then",
    "   offer to help with the market instead.",
    "6. This build's catalogue is sample data published by SiteSurveyor demo",
    "   workspaces. If asked whether the listings are real, say they are",
    "   demonstration data.",
    "7. Ask ONE short question only when a request is genuinely ambiguous (for",
    "   example which country to search). Otherwise answer.",
    "8. Keep replies compact: no preamble, no restating the question — plain",
    "   lines or short markdown bullets, headline first.",
  ].join("\n");
}

// ── Live schema awareness ─────────────────────────────────────────────────
// Fetched once per runtime from PostgREST's OpenAPI root so the model sees
// REAL column names for whitelisted tables instead of guessing. Cached
// module-level; a failed fetch simply omits the section.

export interface TableSchemaInfo {
  columns: string[]; // column names
  required: string[];
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
      for (const table of new Set([
        ...READ_TABLES,
        ...WRITE_TABLES,
        ...MARKET_READ_TABLES,
      ])) {
        const def = api.definitions?.[table];
        if (!def?.properties) continue;
        const columns = Object.keys(def.properties);
        map.set(table, {
          columns,
          required: def.required ?? [],
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
  scope: { select: string; params: [string, string][] },
): string {
  const params = new URLSearchParams();
  params.set("select", scope.select);
  for (const f of filters ?? []) {
    params.set(f.column, `${f.op}.${f.value}`);
  }
  // Applied last: `set` replaces a same-named model filter, so the tenant
  // predicate always wins even if scopeRead ever misses one.
  for (const [column, value] of scope.params) {
    params.set(column, `eq.${value}`);
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

/**
 * The seam every model tool call runs through. Exported so the scoping tests
 * can assert the exact requests a call produces.
 */
export async function executeTool(
  name: string,
  rawArgs: string,
  ctx: {
    supabaseUrl: string;
    serviceKey: string;
    workspaceId?: string;
    conversationId?: string;
    /** Signed-in user, stamped onto survey runs the agent launches. */
    userId?: string;
    /** Project the user has open — the default project an AI satellite
     *  survey files under when no explicit project is given. */
    projectId?: string;
    schemas: Map<string, TableSchemaInfo>;
    /** When set, only these tools may execute (public market concierge). */
    allowedTools?: ReadonlySet<string>;
  },
): Promise<string> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
  } catch {
    return JSON.stringify({ error: "Invalid JSON arguments." });
  }
  // Surface guard: the schema already hides other tools from the model, this
  // stops a hallucinated call (writes, CAD, workflows) from ever executing.
  if (ctx.allowedTools && !ctx.allowedTools.has(name)) {
    return JSON.stringify({
      error: `Tool '${name}' is not available on this agent.`,
    });
  }

  const str = (v: unknown) => (typeof v === "string" ? v : "");

  if (name === "inspect_columns") {
    const table = str(args.table);
    if (!READ_TABLES.has(table) && !MARKET_READ_TABLES.has(table))
      return JSON.stringify({ error: `Table '${table}' is not readable.` });
    const info = ctx.schemas.get(table);
    if (info) {
      return JSON.stringify({ table, columns: info.columns, required: info.required });
    }
    // No OpenAPI description (the schema fetch failed): fall back to a sample
    // row, still scoped so the sample cannot belong to another workspace.
    const scoped = scopeRead(table, ctx.workspaceId, undefined);
    if (!scoped.ok) return JSON.stringify({ error: scoped.error });
    const params = new URLSearchParams();
    params.set("select", scoped.select);
    params.set("limit", "1");
    for (const [column, value] of scoped.params) params.set(column, `eq.${value}`);
    const out = await supabaseFetch({
      ...ctx,
      method: "GET",
      path: `${table}?${params.toString()}`,
    });
    if (!out.ok) return JSON.stringify({ error: `HTTP ${out.status}`, details: out.json });
    const row = Array.isArray(out.json) ? out.json[0] : null;
    return JSON.stringify({ table, columns: row ? Object.keys(row) : [] });
  }

  if (name === "query_site_data" || name === "count_site_data") {
    const table = str(args.table);
    // Allow both workspace tables (READ_TABLES) and public market views (MARKET_READ_TABLES)
    if (!READ_TABLES.has(table) && !MARKET_READ_TABLES.has(table)) {
      return JSON.stringify({ error: `Table '${table}' is not readable.` });
    }
    const tableSchema = ctx.schemas.get(table);
    const requested = Array.isArray(args.filters)
      ? (args.filters as { column?: unknown; op?: unknown; value?: unknown }[])
          .filter((f) => typeof f.column === "string" && typeof f.op === "string" && FILTER_OPS.has(String(f.op)))
          .map((f) => ({ column: String(f.column), op: String(f.op), value: String(f.value ?? "") }))
      : undefined;
    if (requested?.length && tableSchema) {
      const unknown = requested.filter((f) => !tableSchema.columns.includes(f.column));
      if (unknown.length > 0) {
        return JSON.stringify({
          error: `Unknown filter column(s): ${unknown.map((f) => f.column).join(", ")}`,
          valid_columns: tableSchema.columns,
        });
      }
    }
    const scoped = scopeRead(table, ctx.workspaceId, requested);
    if (!scoped.ok) return JSON.stringify({ error: scoped.error });
    if (name === "count_site_data") {
      const path = buildQueryPath(table, scoped.filters, undefined, undefined, 1, scoped);
      const out = await supabaseFetch({ ...ctx, method: "GET", path, preferCount: true });
      if (!out.ok) return JSON.stringify({ error: `HTTP ${out.status}`, details: out.json });
      return JSON.stringify({ table, count: out.count });
    }
    const path = buildQueryPath(
      table,
      scoped.filters,
      args.order_by == null ? undefined : str(args.order_by),
      str(args.order_dir) || undefined,
      typeof args.limit === "number" ? args.limit : undefined,
      scoped,
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
    const scoped = scopeRead("project_cad_drawings", ctx.workspaceId, undefined);
    if (!scoped.ok) return JSON.stringify({ error: scoped.error });
    const cadParams = new URLSearchParams();
    cadParams.set("select", "model");
    cadParams.set("project_id", `eq.${projectId}`);
    for (const [column, value] of scoped.params) cadParams.set(column, `eq.${value}`);
    const out = await supabaseFetch({
      ...ctx,
      method: "GET",
      path: `project_cad_drawings?${cadParams.toString()}`,
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
      {
        supabaseUrl: ctx.supabaseUrl,
        serviceKey: ctx.serviceKey,
        workspaceId: ctx.workspaceId,
      },
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

  if (name === "quote_satellite_survey") {
    return quoteSatelliteSurvey(
      { supabaseFetch },
      { supabaseUrl: ctx.supabaseUrl, serviceKey: ctx.serviceKey, workspaceId: ctx.workspaceId },
      args as {
        category: string;
        latitude: number;
        longitude: number;
        half_deg?: number;
        client_name?: string;
        notes?: string;
      },
    );
  }
  if (name === "launch_satellite_survey") {
    return launchSatelliteSurvey(
      { supabaseFetch },
      { supabaseUrl: ctx.supabaseUrl, serviceKey: ctx.serviceKey, workspaceId: ctx.workspaceId },
      ctx.userId,
      args as {
        category: string;
        latitude: number;
        longitude: number;
        half_deg?: number;
        client_name?: string;
        notes?: string;
        project_id?: string;
        project_name?: string;
        confirmed: boolean;
      },
      ctx.projectId,
    );
  }
  if (name === "get_satellite_survey_status") {
    return getSatelliteSurveyStatus(
      { supabaseFetch },
      { supabaseUrl: ctx.supabaseUrl, serviceKey: ctx.serviceKey, workspaceId: ctx.workspaceId },
      args as { run_id?: string },
    );
  }
  if (name === "get_satellite_survey_result") {
    return getSatelliteSurveyResult(
      { supabaseFetch },
      { supabaseUrl: ctx.supabaseUrl, serviceKey: ctx.serviceKey, workspaceId: ctx.workspaceId },
      args as { run_id?: string },
    );
  }

  const table = str(args.table);
  const confirmed = args.confirmed === true;

  if (!WRITE_TABLES.has(table)) return JSON.stringify({ error: `Table '${table}' is not writable.` });

  // Sanitise payloads against the live schema: drop unknown columns (the
  // model is told which were dropped). Workspace ownership is applied below,
  // never from the payload.
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
    return { clean, dropped };
  };

  /** Every mutation is pinned to the run's workspace, or it does not run. */
  const owner = scopeWrite(ctx.workspaceId);
  if (!owner.ok) return JSON.stringify({ error: owner.error });
  const rowScope = `&${workspaceParam(owner.workspaceId)}`;

  if (name === "insert_site_record") {
    const { clean, dropped } = sanitise(args.record as Record<string, unknown>);
    if (dropped.length > 0) {
      return JSON.stringify({
        error: `Ignored unknown columns: ${dropped.join(", ")}`,
        valid_columns: schema ? schema.columns : undefined,
      });
    }
    const owned = scopeWrite(ctx.workspaceId, clean.workspace_id);
    if (!owned.ok) return JSON.stringify({ error: owned.error });
    clean.workspace_id = owned.workspaceId;
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
      path: `${table}?id=eq.${newId}&select=*${rowScope}`,
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
    const owned = scopeWrite(ctx.workspaceId, clean.workspace_id);
    if (!owned.ok) return JSON.stringify({ error: owned.error });
    // A row cannot be re-parented to another workspace, and it cannot be
    // stamped from a patch either — the predicate below owns the row.
    delete clean.workspace_id;
    const out = await supabaseFetch({
      ...ctx,
      method: "PATCH",
      path: `${table}?id=eq.${id}${rowScope}`,
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
    const patched = Array.isArray(out.json) ? out.json : [];
    if (patched.length === 0)
      return JSON.stringify({
        updated: null,
        _verified: false,
        error: `No ${table} row with id ${id} exists in workspace ${owner.workspaceId}.`,
      });
    const verify = await supabaseFetch({
      ...ctx,
      method: "GET",
      path: `${table}?id=eq.${id}&select=*${rowScope}`,
    });
    const row = Array.isArray(verify.json) ? verify.json[0] : null;
    return JSON.stringify({ updated: row ?? patched[0], _verified: verify.ok && !!row });
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
    const out = await supabaseFetch({
      ...ctx,
      method: "DELETE",
      path: `${table}?id=eq.${id}${rowScope}`,
    });
    if (!out.ok) return JSON.stringify({ error: `HTTP ${out.status}`, details: out.json });
    // PostgREST answers 2xx even when the predicate matched nothing, so the
    // returned rows are the only proof the delete landed on a real record.
    const removed = Array.isArray(out.json) ? out.json : [];
    if (removed.length === 0)
      return JSON.stringify({
        deleted: false,
        error: `No ${table} row with id ${id} exists in workspace ${owner.workspaceId}.`,
      });
    return JSON.stringify({ deleted: true, removed: removed[0] });
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

interface StreamedToolCall {
  id: string;
  name: string;
  arguments: string;
  index: number;
}

interface ModelRound {
  content: string;
  toolCalls: Map<number, StreamedToolCall>;
  finishReason: string | null;
  /** Set when the request failed outright; the caller surfaces it verbatim. */
  error?: string;
  aborted: boolean;
}

/**
 * One streamed model request: watchdog, SSE parsing and delta forwarding in
 * place, shared by the tool loop and the tool-free wrap-up turn. Yields the
 * events the caller should pass on and returns what the round produced.
 */
async function* streamModelRound(opts: {
  nvidiaApiKey: string;
  model: string;
  messages: OutboundMessage[];
  /** Omitting the schema is what makes a wrap-up turn unable to loop. */
  tools?: ToolSchema[];
  externalSignal?: AbortSignal;
  phase: string;
}): AsyncGenerator<AgentEvent, ModelRound> {
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  if (opts.externalSignal?.aborted) controller.abort();
  else opts.externalSignal?.addEventListener("abort", onOuterAbort, { once: true });
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

  yield { type: "status", phase: opts.phase };

  let content = "";
  const toolCalls = new Map<number, StreamedToolCall>();
  let finishReason: string | null = null;
  let error: string | undefined;

  try {
    let res: Response;
    try {
      res = await fetch(NVIDIA_NIM_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${opts.nvidiaApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://sitesurveyor.app",
          "X-Title": "SiteSurveyor AI",
        },
        body: JSON.stringify({
          model: opts.model,
          messages: opts.messages,
          ...(opts.tools ? { tools: opts.tools } : {}),
          stream: true,
        }),
      });
    } catch (err) {
      throw new Error(`Could not reach NVIDIA NIM (Nemotron): ${(err as Error).message}`);
    }

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `NVIDIA NIM error ${res.status}: ${detail.slice(0, 300) || "no response"}`,
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
    error = stalled
      ? `AI request timed out (no progress for ${Math.round(LLM_IDLE_TIMEOUT_MS / 1000)}s) — please try again.`
      : (err as Error).message;
  } finally {
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    opts.externalSignal?.removeEventListener("abort", onOuterAbort);
  }

  return {
    content,
    toolCalls,
    finishReason,
    error,
    aborted: opts.externalSignal?.aborted === true,
  };
}

/**
 * Tool arguments arrive in fragments, so a call is only executable once the
 * whole JSON object has landed. A reasoning model that spends the token budget
 * on thinking cuts calls off mid-JSON; executing that yields "Invalid JSON
 * arguments." back to the model, which retries — and retrying is how the round
 * budget actually gets burned. Absent args are legitimate (some tools take none).
 */
function isCompleteToolArgs(raw: string): boolean {
  const s = (raw || "").trim();
  if (!s || s === "{}") return true;
  if (!s.startsWith("{")) return false;
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

/** Key-sorting stringify so key order alone does not look like a new call. */
function canonicalArgs(raw: string): string {
  const sortDeep = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, val]) => [k, sortDeep(val)]),
      );
    }
    return v;
  };
  try {
    return JSON.stringify(sortDeep(JSON.parse(raw || "{}")));
  } catch {
    return (raw || "").replace(/\s+/g, "");
  }
}

function callKey(tc: StreamedToolCall): string {
  return `${tc.name}:${canonicalArgs(tc.arguments)}`;
}

/**
 * Runs the agent loop and yields delta/final/error events.
 * final always carries the complete reply text.
 */
export async function* runAgent(opts: RunAgentOptions): AsyncGenerator<AgentEvent> {
  const supabaseUrl = opts.supabaseUrl.replace(/\/$/, "");
  /** Public market concierge surface: read-only market tools, no workspace. */
  const market = opts.mode === "market";
  // Hard allowlist: unknown/empty falls back to the default. Serve paths
  // (ai-chat, ai-gateway-server) call resolveModel() so this rarely fires,
  // but it keeps the boundary enforced even for direct internal callers
  // (eval harness, tests) and prevents accidental model drift.
  if (opts.model && !isAllowedModel(opts.model)) {
    yield { type: "error", message: `Model '${opts.model}' is not in the allowlist.` };
    return;
  }
  if (!opts.nvidiaApiKey) {
    yield {
      type: "error",
      message: "Missing NVIDIA NIM API key (NVIDIA_API_KEY).",
    };
    return;
  }
  const [schemas, loadedSkills, memoryFacts] = await Promise.all([
    loadTableSchemas(supabaseUrl, opts.serviceKey),
    // The public market concierge has no skills library or structured memory:
    // skip both fetches and keep its prompt on the market alone.
    market
      ? Promise.resolve([])
      : loadSkills(
          { supabaseFetch },
          { supabaseUrl, serviceKey: opts.serviceKey },
        ),
    !market && opts.conversationId
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
    userId: opts.userId,
    projectId: opts.projectId,
    schemas,
    allowedTools: market ? MARKET_TOOL_NAMES : undefined,
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
      context: opts.context ?? (market ? "marketplace" : "dashboard"),
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
  // Market mode sees only the published market views in its schema section;
  // the workspace prompt and its writable-table markers stay out of it.
  const promptSchemas = market
    ? new Map([...schemas].filter(([table]) => MARKET_READ_TABLES.has(table)))
    : schemas;
  const system =
    (market ? marketSystemPrompt(supabaseUrl) : systemPrompt(supabaseUrl)) +
    "\n" +
    schemaSection(promptSchemas) +
    formatSkillContext(selectedSkills) +
    formatMemoryBlock(memoryFacts) +
    (opts.memoryNote?.trim()
      ? `\n\nCONVERSATION MEMORY — notes about earlier in this chat:\n${opts.memoryNote.trim()}\nTreat as background context, not current state. If it records a pending write awaiting the user's yes/no, that confirmation is still open. Re-verify exact numbers and coordinates with tools when precision matters.`
      : "") +
    (opts.workspaceId
      ? `\nThis run is scoped to workspace ${opts.workspaceId}, and the tools enforce it: every row they return belongs to that workspace, records you create are owned by it, and a filter or write naming another workspace is refused. Say what you can see rather than offering to reach around this boundary.`
      : "") +
    (opts.projectId
      ? `\nThe user currently has project ${opts.projectId} open in the CAD workspace.`
      : "") +
    (opts.surveyRunId
      ? `\nSURVEY CONTEXT: the user currently has Earth Observation survey run ${opts.surveyRunId} open in the Satellite Workbench. Treat "this survey" as that run and pass run_id="${opts.surveyRunId}" to the satellite survey tools.`
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
  /** How many times each identical call has run this turn. A second pass is a
   *  legitimate re-read (checking whether a write landed); a third is a loop. */
  const executedCalls = new Map<string, number>();
  while (round < maxRounds) {
    round += 1;
    const modelRound = yield* streamModelRound({
      nvidiaApiKey: opts.nvidiaApiKey,
      model: opts.model || DEFAULT_MODEL,
      messages: outbound,
      tools: market ? MARKET_TOOLS : TOOLS,
      externalSignal: opts.signal,
      phase:
        round === 1 ? "thinking" : `working (step ${round}/${maxRounds})`,
    });

    if (modelRound.error) {
      yield { type: "error", message: modelRound.error };
      if (modelRound.aborted) {
        await finalize("cancelled", "cancelled by caller");
      } else {
        await finalize("error", modelRound.error);
      }
      return;
    }

    const content = modelRound.content;
    const finishReason = modelRound.finishReason;
    const streamed = [...modelRound.toolCalls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, tc]) => tc);
    const usable = streamed.filter((tc) => isCompleteToolArgs(tc.arguments));
    const cutOff = streamed.filter((tc) => !isCompleteToolArgs(tc.arguments));

    const dbg =
      (globalThis as { process?: { env?: Record<string, string> } }).process?.env?.SS_AI_DEBUG;
    if (dbg)
      console.error(
        `[ai-agent] round=${round} finish=${finishReason} contentLen=${content.length} tools=${streamed.length} usable=${usable.length} cutOff=${cutOff.length}`,
      );

    // A provider that reports `stop` or `length` after streaming tool_calls
    // still meant to call them. Gating on finish_reason === "tool_calls" alone
    // dropped those calls and answered with a canned failure.
    if (usable.length > 0) {
      const fresh = usable.filter(
        (tc) => (executedCalls.get(callKey(tc)) ?? 0) < MAX_IDENTICAL_CALLS,
      );
      // The model asked for something it already has: that is looping, not
      // progress. Stop burning rounds and answer from what is on hand.
      if (fresh.length === 0) break;

      for (const tc of fresh) {
        const key = callKey(tc);
        executedCalls.set(key, (executedCalls.get(key) ?? 0) + 1);
      }

      outbound.push({
        role: "assistant",
        content: content || null,
        tool_calls: usable.map((tc) => ({
          id: tc.id || `call_${tc.name}_${tc.index ?? 0}`,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments || "{}" },
        })),
      });
      for (const tc of fresh) {
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
      // tool_call_ids in original order below. A repeated call answers with a
      // pointer rather than a second round-trip, keeping the transcript legal.
      const results = await Promise.all(
        usable.map(async (tc) => {
          if (!fresh.includes(tc)) {
            return JSON.stringify({
              note: "Identical to a call you already made this turn — reuse that result.",
            });
          }
          try {
            return await executeTool(tc.name, tc.arguments, ctx);
          } catch (err) {
            return JSON.stringify({ error: `Tool crashed: ${(err as Error).message}` });
          }
        }),
      );
      usable.forEach((tc, i) => {
        outbound.push({
          role: "tool",
          tool_call_id: tc.id || `call_${tc.name}_${tc.index ?? 0}`,
          content: results[i],
        });
      });
      continue; // next model round with tool results
    }

    // Plain final answer. Guard against silent-empty completions: a provider
    // occasionally reports `stop` while yielding no content.
    if (!content.trim()) {
      // Nothing to say, but earlier tool results (or calls the token cap
      // truncated) are worth a real reply — fall through to the wrap-up turn
      // instead of failing the turn outright.
      if (trace.length > 0 || cutOff.length > 0) break;
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

  // Out of rounds, looping, or truncated calls — the tool results already
  // gathered are worth far more to the user than an error message. Spend one
  // tool-free turn reading them; without the schema the model cannot loop.
  const wrap = yield* streamModelRound({
    nvidiaApiKey: opts.nvidiaApiKey,
    model: opts.model || DEFAULT_MODEL,
    messages: [...outbound, { role: "user", content: WRAP_UP_INSTRUCTION }],
    externalSignal: opts.signal,
    phase: "wrapping up",
  });

  const wrapText = wrap.content.trim();
  if (wrapText) {
    finalText = wrapText;
    yield { type: "final", text: wrapText };
    await promoteRun(selectedSkills, trace, opts.userMessage, wrapText, {
      supabaseFetch,
      supabaseUrl,
      serviceKey: opts.serviceKey,
    });
    await finalize("success");
    return;
  }

  const message =
    wrap.error ??
    "The agent ran out of tool rounds before producing a final answer.";
  yield { type: "error", message };
  await finalize("error", message);
}

// ── Rolling conversation memory ───────────────────────────────────────────
// Best-effort background compaction: folds turns that fell out of the
// verbatim window into dense notes. Callers persist the result on
// ai_conversations.summary / summary_through.

const SUMMARY_SYSTEM = [
  "You maintain the rolling memory of SiteSurveyor AI, an AI agent for a survey",
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
  nvidiaApiKey: string;
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
    const res = await fetch(NVIDIA_NIM_URL, {
      method: "POST",
      signal: t.signal,
      headers: {
        Authorization: `Bearer ${opts.nvidiaApiKey}`,
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
