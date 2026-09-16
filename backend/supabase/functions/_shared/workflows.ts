// SiteSurveyor composite workflow tools.
//
// These are HIGH-LEVEL business operations: the agent makes ONE decision (the
// tool call with typed args) and this module performs the multi-step work
// against Supabase deterministically. They are pure of the LLM — fully
// unit-testable with any object matching Db.
//
// Each function returns a JSON string ready to be returned by executeTool, so
// the agent can surface the result verbatim.

export interface DbFetchOpts {
  supabaseUrl: string;
  serviceKey: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  preferCount?: boolean;
}

export interface Db {
  supabaseFetch(
    opts: DbFetchOpts,
  ): Promise<{ ok: boolean; status: number; json: unknown; count: number | null }>;
}

interface Row {
  [k: string]: unknown;
}

const ROW_NOT_FOUND = (table: string, id?: string) =>
  JSON.stringify({
    error: `No ${table} record found${id ? ` for id ${id}` : ""}.`,
  });

const HTTP_ERR = (table: string, out: { status: number; json: unknown }) =>
  JSON.stringify({ error: `HTTP ${out.status}`, table, details: out.json });

/** Fetch all rows matching a simple eq filter (no meta tools needed). */
async function readWhere(
  db: Db,
  opts: { supabaseUrl: string; serviceKey: string },
  table: string,
  filter: [column: string, value: string],
): Promise<{ ok: boolean; rows?: Row[]; status: number; json: unknown }> {
  const [column, value] = filter;
  const out = await db.supabaseFetch({
    ...opts,
    method: "GET",
    path: `${table}?select=*&${column}=eq.${encodeURIComponent(value)}&limit=100`,
  });
  return { ok: out.ok, rows: Array.isArray(out.json) ? (out.json as Row[]) : undefined, status: out.status, json: out.json };
}

/** Fetch all rows matching several eq filters (AND). */
async function readMany(
  db: Db,
  opts: { supabaseUrl: string; serviceKey: string },
  table: string,
  filters: [column: string, value: string][],
): Promise<{ ok: boolean; rows?: Row[]; status: number; json: unknown }> {
  const qs = filters
    .map(([c, v]) => `${c}=eq.${encodeURIComponent(v)}`)
    .join("&");
  const out = await db.supabaseFetch({
    ...opts,
    method: "GET",
    path: `${table}?select=*&${qs}&limit=100`,
  });
  return { ok: out.ok, rows: Array.isArray(out.json) ? (out.json as Row[]) : undefined, status: out.status, json: out.json };
}

async function patchRow(
  db: Db,
  opts: { supabaseUrl: string; serviceKey: string },
  table: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  return db.supabaseFetch({
    ...opts,
    method: "PATCH",
    path: `${table}?id=eq.${id}`,
    body: patch,
  });
}

async function insertRow(
  db: Db,
  opts: { supabaseUrl: string; serviceKey: string },
  table: string,
  body: Row,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  return db.supabaseFetch({ ...opts, method: "POST", path: table, body });
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Mark every overdue invoice as paid, returning a summary.
 * scope.workspace_id restricts which workspace is scanned; target_status
 * defaults to "paid" (settling the debt) — never deletes anything.
 */
export async function closeOverdueInvoices(
  db: Db,
  opts: { supabaseUrl: string; serviceKey: string },
  args: { scope?: { workspace_id?: string }; target_status?: string },
): Promise<string> {
  const filters: [string, string][] = [["status", "overdue"]];
  const workspaceId = args.scope?.workspace_id;
  if (workspaceId) filters.push(["workspace_id", workspaceId]);
  const target = args.target_status === "cancelled" ? "cancelled" : "paid";

  const res = await readMany(db, opts, "invoices", filters);
  if (!res.ok) return HTTP_ERR("invoices", res);
  const overdue = res.rows ?? [];

  const closed: Row[] = [];
  const skipped: Row[] = [];
  for (const inv of overdue) {
    const id = String(inv.id ?? "");
    if (!id) continue;
    const now = new Date().toISOString();
    const patch: Row = { status: target };
    if (target === "paid") patch.paid_at = now;
    const up = await patchRow(db, opts, "invoices", id, patch);
    if (up.ok) closed.push({ id, invoice_number: inv.invoice_number ?? null });
    else skipped.push({ id, error: `HTTP ${up.status}` });
  }

  return JSON.stringify({
    workflow: "close_overdue_invoices",
    closed_count: closed.length,
    skipped_count: skipped.length,
    target_status: target,
    closed,
    skipped,
  });
}

/**
 * Build a quote from line items in one deterministic step.
 * Computes subtotal = sum(rate*qty), taxes = 0 by default, total = subtotal.
 */
export async function createQuoteFromLineItems(
  db: Db,
  opts: { supabaseUrl: string; serviceKey: string; workspaceId?: string },
  args: {
    project_id?: string;
    contact_id?: string;
    currency_code?: string;
    lines: { description?: string; qty?: number; rate?: number; unit?: string }[];
    tax_rate_percent?: number;
    notes?: string;
  },
): Promise<string> {
  const workspaceId = args.project_id ? undefined : opts.workspaceId;
  void workspaceId;
  if (!Array.isArray(args.lines) || args.lines.length === 0) {
    return JSON.stringify({ error: "At least one line item is required." });
  }
  const cleanedLines = args.lines
    .map((l, i) => ({
      description: typeof l.description === "string" ? l.description : `Line ${i + 1}`,
      qty: num(l.qty) || 1,
      rate: num(l.rate),
      unit: typeof l.unit === "string" ? l.unit : null,
    }))
    .filter((l) => l.rate >= 0);

  const subtotal = cleanedLines.reduce((s, l) => s + l.qty * l.rate, 0);
  const taxRate = num(args.tax_rate_percent) / 100;
  const taxTotal = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + taxTotal) * 100) / 100;

  const wsId = opts.workspaceId ?? "";
  const quote: Row = {
    quote_number: `Q-${Date.now().toString(36).toUpperCase()}`,
    status: "draft",
    currency_code: args.currency_code ?? "USD",
    project_id: args.project_id ?? null,
    contact_id: args.contact_id ?? null,
    issue_date: new Date().toISOString().slice(0, 10),
    subtotal: Math.round(subtotal * 100) / 100,
    tax_total: taxTotal,
    total,
    notes: args.notes ?? null,
    workspace_id: wsId,
  };
  const quoteRes = await insertRow(db, opts, "quotes", quote);
  if (!quoteRes.ok) return HTTP_ERR("quotes", quoteRes);
  const quoteRow = Array.isArray(quoteRes.json) ? (quoteRes.json as Row[])[0] : null;
  const quoteId = quoteRow ? String(quoteRow.id) : "";

  if (!quoteId) return JSON.stringify({ error: "Quote insert returned no id." });

  const savedItems: Row[] = [];
  for (let i = 0; i < cleanedLines.length; i++) {
    const l = cleanedLines[i];
    const item: Row = {
      quote_id: quoteId,
      description: l.description,
      qty: l.qty,
      rate: l.rate,
      unit: l.unit,
      line_number: i + 1,
      workspace_id: wsId,
    };
    const li = await insertRow(db, opts, "quote_items", item);
    if (li.ok) {
      const row = Array.isArray(li.json) ? (li.json as Row[])[0] : null;
      if (row) savedItems.push({ id: row.id, description: row.description });
    }
  }

  return JSON.stringify({
    workflow: "create_quote_from_line_items",
    quote_id: quoteId,
    quote_number: quoteRow?.quote_number ?? quote.quote_number,
    line_count: savedItems.length,
    subtotal,
    tax_total: taxTotal,
    total,
    status: "draft",
  });
}

/**
 * Schedule a job: verify it exists and is schedulable, then create a
 * job_assignment and set the job status to "scheduled".
 */
export async function scheduleJob(
  db: Db,
  opts: { supabaseUrl: string; serviceKey: string; workspaceId?: string },
  args: {
    job_id: string;
    assignment_date?: string;
    notes?: string;
    status?: "draft" | "confirmed" | "in_progress" | "completed" | "cancelled";
  },
): Promise<string> {
  const id = String(args.job_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return JSON.stringify({ error: "A valid job_id UUID is required." });
  }
  const jobRes = await readWhere(db, opts, "jobs", ["id", id]);
  if (!jobRes.ok) return HTTP_ERR("jobs", jobRes);
  const job = (jobRes.rows ?? [])[0];
  if (!job) return ROW_NOT_FOUND("jobs", id);
  if (job.status === "completed" || job.status === "cancelled") {
    return JSON.stringify({
      error: `Job ${id} is ${job.status} and cannot be scheduled.`,
    });
  }

  const date = args.assignment_date
    ? String(args.assignment_date)
    : new Date().toISOString().slice(0, 10);
  const assign: Row = {
    job_id: id,
    project_id: job.project_id ?? null,
    assignment_date: date,
    notes: args.notes ?? null,
    status: args.status ?? "draft",
    workspace_id: opts.workspaceId ?? job.workspace_id ?? "",
  };
  const ins = await insertRow(db, opts, "job_assignments", assign);
  if (!ins.ok) return HTTP_ERR("job_assignments", ins);
  const assignmentRow = Array.isArray(ins.json) ? (ins.json as Row[])[0] : null;

  const updJob = await patchRow(db, opts, "jobs", id, { status: "scheduled", scheduled_start: date });
  if (!updJob.ok) {
    return JSON.stringify({
      error: `Assignment created but could not update job status: HTTP ${updJob.status}`,
      assignment_id: assignmentRow?.id ?? null,
    });
  }

  return JSON.stringify({
    workflow: "schedule_job",
    job_id: id,
    title: job.title ?? null,
    assignment_id: assignmentRow?.id ?? null,
    assignment_date: date,
    status: "scheduled",
  });
}
