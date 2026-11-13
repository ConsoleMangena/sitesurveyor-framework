// Composite SiteSurveyor workflow tools ported from the shared workflows.ts.
// Deterministic multi-step business operations; pure of the LLM and
// unit-testable with any object matching Db.

import { supabaseFetch, type DbResult } from "./supabase.js";
import { scopeWrite, workspaceParam } from "./scoping.js";

export interface DbOpts {
  supabaseUrl: string;
  serviceKey: string;
  /** The workspace the run is scoped to; every workflow step is pinned to it. */
  workspaceId?: string;
}

interface Row {
  [k: string]: unknown;
}

const HTTP_ERR = (table: string, out: Pick<DbResult, "status" | "json">) =>
  JSON.stringify({ error: `HTTP ${out.status}`, table, details: out.json });

/** Each workflow resolves its workspace before the first step, so this always
 *  carries a real id; an empty one matches no rows and fails closed. */
function scoped(base: string, workspaceId: string | undefined): string {
  return `${base}&${workspaceParam(workspaceId ?? "")}`;
}

async function readMany(
  opts: DbOpts,
  table: string,
  filters: [string, string][],
): Promise<{ ok: boolean; rows?: Row[]; status: number; json: unknown }> {
  const qs = filters.map(([c, v]) => `${c}=eq.${encodeURIComponent(v)}`).join("&");
  const out = await supabaseFetch({
    ...opts,
    method: "GET",
    path: scoped(`${table}?select=*&${qs}&limit=100`, opts.workspaceId),
  });
  return {
    ok: out.ok,
    rows: Array.isArray(out.json) ? (out.json as Row[]) : undefined,
    status: out.status,
    json: out.json,
  };
}

async function patchRow(opts: DbOpts, table: string, id: string, patch: Row) {
  return supabaseFetch({
    ...opts,
    method: "PATCH",
    path: scoped(`${table}?id=eq.${id}`, opts.workspaceId),
    body: patch,
  });
}

async function insertRow(opts: DbOpts, table: string, body: Row) {
  return supabaseFetch({ ...opts, method: "POST", path: table, body });
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function closeOverdueInvoices(
  opts: DbOpts,
  args: { scope?: { workspace_id?: string }; target_status?: string },
): Promise<string> {
  // The workspace comes from the run, never from the model: an unscoped close
  // would settle every tenant's invoices at once.
  const owner = scopeWrite(opts.workspaceId, args.scope?.workspace_id);
  if (!owner.ok) return JSON.stringify({ error: owner.error });
  const db: DbOpts = { ...opts, workspaceId: owner.workspaceId };

  const filters: [string, string][] = [["status", "overdue"]];
  const target = args.target_status === "cancelled" ? "cancelled" : "paid";

  const res = await readMany(db, "invoices", filters);
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
    const up = await patchRow(db, "invoices", id, patch);
    if (up.ok) closed.push({ id, invoice_number: inv.invoice_number ?? null });
    else skipped.push({ id, error: `HTTP ${up.status}` });
  }

  return JSON.stringify({
    workflow: "close_overdue_invoices",
    workspace_id: owner.workspaceId,
    closed_count: closed.length,
    skipped_count: skipped.length,
    target_status: target,
    closed,
    skipped,
  });
}

export async function createQuoteFromLineItems(
  opts: DbOpts,
  args: {
    project_id?: string;
    contact_id?: string;
    currency_code?: string;
    lines: { description?: string; qty?: number; rate?: number; unit?: string }[];
    tax_rate_percent?: number;
    notes?: string;
  },
): Promise<string> {
  const owner = scopeWrite(opts.workspaceId);
  if (!owner.ok) return JSON.stringify({ error: owner.error });
  const wsId = owner.workspaceId;
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
  const quoteRes = await insertRow(opts, "quotes", quote);
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
    const li = await insertRow(opts, "quote_items", item);
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
