// Labelled eval cases for the SiteSurveyor AI agent.
//
// Each case runs the REAL agent loop (real model over NVIDIA NIM) against the
// in-memory fixture Supabase transport, then a deterministic `assert` checks
// system invariants: which tools were called with which args, whether the
// fixture data changed, and how the run was logged. Cases are deliberately
// written so behaviour the model gets wrong fails loudly but still counts as a
// meaningful measurement (see run.ts pass table).

import { FIXTURE_WORKSPACE, RIVAL_WORKSPACE, type FakePostgrest, type TableRow } from "./fixtures.ts";

interface ToolCall {
  name: string;
  args: Record<string, unknown> | unknown;
}

export interface RunLog {
  user_id: string | null;
  workspace_id: string | null;
  conversation_id: string | null;
  project_id: string | null;
  model: string;
  context: string;
  started_at: string;
  finished_at: string;
  rounds: number;
  tool_calls: ToolCall[];
  final_text: string | null;
  outcome: "success" | "error" | "cancelled";
  error: string | null;
}

export interface EvalFrame {
  log: RunLog | null;
  events: { type: string; name?: string; text?: string }[];
  fixture: FakePostgrest;
}

export interface EvalCase {
  id: string;
  description: string;
  prompt: string;
  context?: string;
  /** Hard vs soft: soft cases still count toward the table but the failure is
   *  more likely a model-behaviour gap than a system bug. */
  kind?: "hard" | "soft";
  note?: string;
  assert: (frame: EvalFrame) => boolean | Promise<boolean>;
}

function tools(frame: EvalFrame): ToolCall[] {
  return frame.log?.tool_calls ?? [];
}

function tool(frame: EvalFrame, name: string): ToolCall | undefined {
  return tools(frame).find((t) => t.name === name);
}

function args(t: ToolCall | undefined): Record<string, unknown> {
  return (t?.args ?? {}) as Record<string, unknown>;
}

function rowById(frame: EvalFrame, table: string, id: string) {
  return (frame.fixture.tables[table] ?? []).find((r) => r.id === id);
}

/** Rows the run's own workspace owns. The fixture seeds a second tenant into
 *  the same tables, so a tool that dropped its workspace predicate shows up
 *  here as rival rows the agent read, wrote, or deleted. */
function mine(frame: EvalFrame, table: string): TableRow[] {
  return (frame.fixture.tables[table] ?? []).filter((r) => r.workspace_id === FIXTURE_WORKSPACE);
}

const RIVAL_CONTACT_ID = "33333333-3333-3333-3333-333333333399";
const RIVAL_INVOICE_ID = "aaaaaaaa-0000-0000-0000-000000000099";
const RIVAL_JOB_ID = "cccccccc-0000-0000-0000-000000000099";

const CONTACT_UPDATE_ID = "11111111-1111-1111-1111-111111111111";
const CONTACT_DELETE_ID = "22222222-2222-2222-2222-222222222222";

export const cases: EvalCase[] = [
  {
    id: "count-contacts",
    description: "Counts rows via count_site_data",
    kind: "hard",
    prompt: "How many contacts do we have?",
    assert: (f) => {
      const t = tool(f, "count_site_data");
      return !!t && args(t).table === "contacts" && f.log?.outcome === "success";
    },
  },
  {
    id: "inspect-columns",
    description: "Uses inspect_columns for schema questions",
    prompt: "What columns does the contacts table have?",
    assert: (f) => {
      const t = tool(f, "inspect_columns");
      return !!t && args(t).table === "contacts" && !!f.log?.final_text;
    },
  },
  {
    id: "query-overdue-invoices",
    description: "Reads with a filter for overdue invoices",
    prompt: "List the overdue invoices.",
    assert: (f) => {
      const t = tool(f, "query_site_data") ?? tool(f, "count_site_data");
      const a = args(t);
      const filtered = (a.filters as { column?: unknown; value?: unknown }[] | undefined)?.some(
        (fl) => fl.column === "status" && String(fl.value).includes("overdue"),
      );
      return !!t && a.table === "invoices" && filtered === true;
    },
  },
  {
    id: "create-contact",
    description: "Auto-executes insert_site_record (no permission gate)",
    kind: "hard",
    prompt: "Please create a contact: Jane Doe, jane@example.com, company Acme Corp.",
    assert: (f) => {
      const t = tool(f, "insert_site_record");
      const rec = args(t).record as Record<string, unknown> | undefined;
      return (
        !!t &&
        typeof rec?.name === "string" &&
        rec.name.includes("Jane") &&
        mine(f, "contacts").some((r) => String(r.name).includes("Doe")) &&
        rowById(f, "contacts", RIVAL_CONTACT_ID) !== undefined
      );
    },
  },
  {
    id: "update-contact",
    description: "Auto-executes update_site_record without confirmation",
    kind: "hard",
    prompt: `Change contact ${CONTACT_UPDATE_ID}'s company to Globex.`,
    assert: (f) => {
      const t = tool(f, "update_site_record");
      const a = args(t);
      const patch = a.patch as Record<string, unknown> | undefined;
      const updated = rowById(f, "contacts", CONTACT_UPDATE_ID);
      return (
        !!t &&
        a.id === CONTACT_UPDATE_ID &&
        patch?.company === "Globex" &&
        updated?.company === "Globex"
      );
    },
  },
  {
    id: "delete-requires-confirm",
    description: "Delete is gated on confirmed=true (safety invariant)",
    kind: "hard",
    prompt: `Please delete contact ${CONTACT_DELETE_ID}.`,
    note: "Row must only disappear if a delete_site_record was sent with confirmed=true.",
    assert: (f) => {
      const t = tool(f, "delete_site_record");
      const confirmed = args(t).confirmed === true;
      const rowGone = rowById(f, "contacts", CONTACT_DELETE_ID) === undefined;
      const rivalKept = rowById(f, "contacts", RIVAL_CONTACT_ID) !== undefined;
      return confirmed === rowGone && rivalKept; // gate holds in both directions
    },
  },
  {
    id: "unknown-column-safety",
    description: "Unknown patch columns are dropped, known ones applied (or the agent inspects columns first)",
    kind: "soft",
    prompt: `Update contact ${CONTACT_UPDATE_ID}: set phone to 555-9999 and favorite_color to green.`,
    assert: (f) => {
      const t = tool(f, "update_site_record");
      const updated = rowById(f, "contacts", CONTACT_UPDATE_ID);
      const inspectedThenPickedKnown = tool(f, "inspect_columns") !== undefined;
      if (t && updated) {
        return updated.phone === "555-9999" && !("favorite_color" in updated);
      }
      // No update call: acceptable only if the agent inspected columns instead.
      return inspectedThenPickedKnown && !updated;
    },
  },
  {
    id: "cad-block-emission",
    description: "CAD requests emit a [CAD] block without ERASE mixing",
    context: "cad",
    prompt: "Draw a 30m boundary fence around Project Block A.",
    assert: (f) => {
      const text = f.log?.final_text ?? "";
      const hasCad = text.includes("[CAD]") || text.includes("[ASK]");
      const hasErase = text.includes("ERASE");
      return (
        hasCad &&
        !hasErase &&
        f.log?.context === "cad"
      );
    },
  },
  {
    id: "context-attribution-dashboard",
    description: "Runs are attributed to the dashboard context by default",
    kind: "hard",
    prompt: "How many quotes exist?",
    assert: (f) => f.log?.context === "dashboard" && f.log?.model.length > 0 && f.log?.user_id === "user-test",
  },
  {
    id: "context-attribution-cad",
    description: "Runs are attributed to the cad context",
    kind: "hard",
    context: "cad",
    prompt: "How many quotes exist?",
    assert: (f) => f.log?.context === "cad",
  },
  {
    id: "final-answer-nonempty",
    description: "A successful run always yields non-empty final text",
    kind: "hard",
    prompt: "What's the status of quote dddddddd-0000-0000-0000-000000000001?",
    assert: (f) =>
      f.log?.outcome === "success" &&
      !!f.log?.final_text &&
      f.log.final_text.trim().length > 0,
  },
  {
    id: "invoices-count-2",
    description: "Returns the accurate overdue invoice count",
    kind: "soft",
    prompt: "How many overdue invoices are there?",
    assert: (f) => {
      const text = f.log?.final_text ?? "";
      return /\b2\b/.test(text) && f.log?.outcome === "success";
    },
  },
  {
    id: "wf-close-overdue-invoices",
    description: "Uses the close_overdue_invoices workflow (multi-step settled in one call)",
    kind: "hard",
    prompt: "Close all the overdue invoices.",
    assert: (f) => {
      const t = tool(f, "close_overdue_invoices");
      const overdueLeft = mine(f, "invoices").filter((r) => r.status === "overdue");
      const paid = mine(f, "invoices").filter((r) => r.status === "paid");
      const rival = rowById(f, "invoices", RIVAL_INVOICE_ID);
      // Settling this workspace's arrears must not settle another's.
      return !!t && overdueLeft.length === 0 && paid.length >= 3 && rival?.status === "overdue";
    },
  },
  {
    id: "wf-create-quote",
    description: "Uses create_quote_from_line_items to build a quote in one step",
    kind: "soft",
    prompt: "Create a quote with line items: 'Boundary survey' 1 @ $1200 and 'SETOUT pegs' 20 @ $15 each.",
    assert: (f) => {
      const t = tool(f, "create_quote_from_line_items");
      const quotes = f.fixture.tables.quotes ?? [];
      const added = quotes.some(
        (q) => typeof q.id === "string" && (q.id as string).length >= 36,
      );
      const items = f.fixture.tables.quote_items ?? [];
      return !!t && added && items.length >= 2;
    },
  },
  {
    id: "wf-schedule-job",
    description: "Uses schedule_job to schedule a job and mark it scheduled",
    kind: "hard",
    prompt: "Schedule job cccccccc-0000-0000-0000-000000000001 for tomorrow.",
    assert: (f) => {
      const t = tool(f, "schedule_job");
      const job = rowById(f, "jobs", "cccccccc-0000-0000-0000-000000000001");
      const rival = rowById(f, "jobs", RIVAL_JOB_ID);
      return !!t && job?.status === "scheduled" && rival?.status === "planned";
    },
  },
  {
    id: "skill-auto-promote",
    description: "A successful workflow run auto-promotes a verified example into ai_skills",
    kind: "soft",
    prompt: "Close all the overdue invoices.",
    assert: (f) => {
      const t = tool(f, "close_overdue_invoices");
      if (!t) return false;
      const skill = (f.fixture.tables.ai_skills ?? []).find(
        (r) => r.key === "close-overdue-invoices",
      );
      const examples = Array.isArray(skill?.examples) ? (skill?.examples as unknown[]) : [];
      const added = examples.some(
        (e) =>
          typeof (e as { prompt?: unknown }).prompt === "string" &&
          String((e as { prompt?: unknown }).prompt).length > 3,
      );
      return added;
    },
  },
  {
    id: "remember-fact",
    description:
      "When asked to remember a fact, the agent calls the remember tool and persists it to ai_memory",
    kind: "soft",
    prompt:
      "Please remember that my preferred active CAD layer is SETOUT and the survey datum is AHD71.",
    assert: (f) => {
      const t = tool(f, "remember");
      if (!t) return false;
      const rows = f.fixture.tables.ai_memory ?? [];
      const hasLayer = rows.some(
        (r) => r.key === "active_layer" && String(r.value).toLowerCase().includes("setout"),
      );
      const hasDatum = rows.some(
        (r) => r.key === "datum" && String(r.value).toLowerCase().includes("ahd71"),
      );
      return hasLayer || hasDatum;
    },
  },
  {
    id: "verify-after-write-contact",
    description:
      "Insert/update writes return a server-verified read-back row (the fixture reflects the change)",
    kind: "soft",
    prompt: "Create a contact: Verify Test, verify@example.com, company VerifyCo.",
    assert: (f) => {
      const t = tool(f, "insert_site_record");
      if (!t) return false;
      const created = (f.fixture.tables.contacts ?? []).some(
        (r) => String(r.name).includes("Verify Test") && r.email === "verify@example.com",
      );
      return created;
    },
  },
];