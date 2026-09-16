// In-memory PostgREST stand-in for the AI eval harness.
//
// runAgent talks to Supabase exclusively through {supabaseUrl}/rest/v1/* over
// fetch. The harness installs a global fetch shim (see run.ts) that routes
// requests for the fixture base URL into this class, so every agent run
// exercises the real tool/executeTool path against mutable fixture data with
// no live database.

export interface TableRow {
  [k: string]: unknown;
}

export type TableSeed = Record<string, TableRow[]>;

export const FIXTURE_BASE = "https://fixture-eval.invalid";

export const seed: TableSeed = {
  contacts: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      name: "John Smith",
      email: "john@acme.com",
      phone: "555-0101",
      company: "Acme Corp",
      workspace_id: "ws-test",
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      name: "Jane Roe",
      email: "jane@globex.com",
      phone: "555-0102",
      company: "Globex",
      workspace_id: "ws-test",
    },
    {
      id: "33333333-3333-3333-3333-333333333333",
      name: "Sam Brown",
      email: "sam@initech.com",
      phone: "555-0103",
      company: "Initech",
      workspace_id: "ws-test",
    },
  ],
  invoices: [
    {
      id: "aaaaaaaa-0000-0000-0000-000000000001",
      invoice_number: "INV-1001",
      status: "overdue",
      total: 1250.5,
      subtotal: 1100,
      tax_total: 150.5,
      contact_id: null,
      paid_at: null,
      workspace_id: "ws-test",
    },
    {
      id: "aaaaaaaa-0000-0000-0000-000000000002",
      invoice_number: "INV-1002",
      status: "overdue",
      total: 400,
      subtotal: 400,
      tax_total: 0,
      contact_id: null,
      paid_at: null,
      workspace_id: "ws-test",
    },
    {
      id: "aaaaaaaa-0000-0000-0000-000000000003",
      invoice_number: "INV-1003",
      status: "paid",
      total: 0,
      subtotal: 0,
      tax_total: 0,
      contact_id: null,
      paid_at: "2026-01-01T00:00:00Z",
      workspace_id: "ws-test",
    },
  ],
  projects: [
    {
      id: "bbbbbbbb-0000-0000-0000-000000000001",
      name: "Block A",
      datum: "AHD71",
      active_layer: "SETOUT",
      workspace_id: "ws-test",
    },
    {
      id: "bbbbbbbb-0000-0000-0000-000000000002",
      name: "Block B",
      datum: "AHD71",
      active_layer: "FENCE",
      workspace_id: "ws-test",
    },
  ],
  jobs: [
    {
      id: "cccccccc-0000-0000-0000-000000000001",
      title: "Site topo survey",
      status: "planned",
      project_id: "bbbbbbbb-0000-0000-0000-000000000001",
      workspace_id: "ws-test",
    },
  ],
  quotes: [
    {
      id: "dddddddd-0000-0000-0000-000000000001",
      status: "draft",
      quote_number: "Q-100",
      total: 3200,
      subtotal: 3200,
      tax_total: 0,
      currency_code: "USD",
      workspace_id: "ws-test",
    },
  ],
  quote_items: [
    {
      id: "cccccccc-1111-0000-0000-000000000001",
      quote_id: "dddddddd-0000-0000-0000-000000000001",
      description: "Existing line",
      qty: 1,
      rate: 3200,
      line_number: 1,
      workspace_id: "ws-test",
    },
  ],
  job_assignments: [
    {
      id: "cccccccc-2222-0000-0000-000000000001",
      job_id: "cccccccc-0000-0000-0000-000000000001",
      assignment_date: "2026-01-01",
      status: "draft",
      workspace_id: "ws-test",
    },
  ],
  project_cad_drawings: [
    {
      id: "eeeeeeee-0000-0000-0000-000000000001",
      project_id: "bbbbbbbb-0000-0000-0000-000000000001",
      name: "Block A boundary",
      workspace_id: "ws-test",
    },
  ],
  ai_memory: [],
  ai_skills: [
    {
      id: "ffffffff-0000-0000-0000-000000000001",
      key: "close-overdue-invoices",
      title: "Settling overdue invoices",
      description: "close overdue invoices settle mark paid",
      body: "Use the close_overdue_invoices workflow tool to settle every overdue invoice in one step.",
      examples: [],
      active: true,
      updated_at: "2026-09-02T00:00:00Z",
    },
    {
      id: "ffffffff-0000-0000-0000-000000000002",
      key: "create-quote",
      title: "Building quotes from line items",
      description: "create quote line items estimate proposal",
      body: "Use the create_quote_from_line_items workflow to build a quote and its line items in one step.",
      examples: [],
      active: true,
      updated_at: "2026-09-02T00:00:00Z",
    },
    {
      id: "ffffffff-0000-0000-0000-000000000003",
      key: "schedule-job",
      title: "Scheduling a job",
      description: "schedule job assign crew date assignment",
      body: "Use the schedule_job workflow to schedule a job.",
      examples: [],
      active: true,
      updated_at: "2026-09-02T00:00:00Z",
    },
    {
      id: "ffffffff-0000-0000-0000-000000000004",
      key: "destructive-action-policy",
      title: "Deletes need explicit confirmation",
      description: "delete remove erase destructive confirm",
      body: "Deletes are permanent and MUST NOT auto-execute. Propose the action and only execute after an explicit yes.",
      examples: [],
      active: true,
      updated_at: "2026-09-02T00:00:00Z",
    },
  ],
};

function matchOp(value: unknown, op: string, needle: string): boolean {
  const s = value == null ? "" : String(value);
  switch (op) {
    case "eq":
      return s === needle;
    case "neq":
      return s !== needle;
    case "gt":
      return Number(value) > Number(needle);
    case "gte":
      return Number(value) >= Number(needle);
    case "lt":
      return Number(value) < Number(needle);
    case "lte":
      return Number(value) <= Number(needle);
    case "like":
    case "ilike": {
      const escaped = needle.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(
        "^" + escaped.replace(/%/g, ".*").replace(/_/g, ".") + "$",
        op === "ilike" ? "i" : "",
      );
      return pattern.test(s);
    }
    default:
      return false;
  }
}

const VIEW_PARAMS = new Set(["select", "order", "limit", "offset"]);

export class FakePostgrest {
  tables: Record<string, TableRow[]>;
  loggedRows: TableRow[] = [];

  constructor(seeds: TableSeed = seed) {
    this.tables = JSON.parse(JSON.stringify(seeds));
  }

  private row(table: string): TableRow[] {
    if (!(table in this.tables)) this.tables[table] = [];
    return this.tables[table];
  }

  private select(table: string, params: URLSearchParams): {
    rows: TableRow[];
    total: number;
  } {
    let rows = this.row(table);
    const normalized = new URLSearchParams(params.toString());
    for (const [col, raw] of normalized) {
      if (VIEW_PARAMS.has(col)) continue;
      const m = raw.match(/^(eq|neq|gt|gte|lt|lte|like|ilike)\.(.*)$/s);
      if (!m) continue;
      rows = rows.filter((r) => matchOp(r[col], m[1], m[2]));
    }
    const total = rows.length;
    const order = normalized.get("order");
    if (order) {
      const [col, dir] = order.split(".");
      const mult = dir === "desc" ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        const av = a[col] ?? "";
        const bv = b[col] ?? "";
        if (av < bv) return -1 * mult;
        if (av > bv) return 1 * mult;
        return 0;
      });
    }
    const limit = Number(normalized.get("limit") ?? 100);
    if (Number.isFinite(limit) && limit > 0) rows = rows.slice(0, limit);
    return { rows, total };
  }

  private json(status: number, body: unknown, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    });
  }

  async handle(url: string, init: RequestInit): Promise<Response> {
    const u = new URL(url);
    const method = (init.method ?? "GET").toUpperCase();
    const path = u.pathname.replace(/^\/rest\/v1\/?/, "");
    const params = u.searchParams;

    if (path === "") {
      return this.json(200, definitionsFromSeeds(this.tables));
    }

    const table = path;

    if (method === "POST" && table === "ai_run_logs" && init.body) {
      this.loggedRows.push(JSON.parse(String(init.body)));
      return this.json(201, { id: "log" });
    }

    if (method === "GET") {
      const { rows, total } = this.select(table, params);
      const end = rows.length ? rows.length - 1 : 0;
      return this.json(200, rows, { "Content-Range": `0-${end}/${total}` });
    }

    if (method === "POST") {
      const body = JSON.parse(String(init.body)) as TableRow;
      if (!body.id) {
        (body as TableRow).id = crypto.randomUUID();
      }
      this.row(table).push(body);
      return this.json(201, [body]);
    }

    if (method === "PATCH") {
      const patch = JSON.parse(String(init.body)) as TableRow;
      const id = params.get("id")?.replace(/^eq\./, "");
      const updated: TableRow[] = [];
      for (const row of this.row(table)) {
        if (id == null || row.id === id) {
          Object.assign(row, patch);
          updated.push(row);
        }
      }
      return this.json(200, updated);
    }

    if (method === "DELETE") {
      const id = params.get("id")?.replace(/^eq\./, "");
      const before = this.row(table).length;
      this.tables[table] = this.row(table).filter((r) => id == null || r.id !== id);
      return new Response(null, { status: 204 });
    }

    return this.json(404, { error: `Unhandled ${method} /rest/v1/${table}` });
  }
}

export function definitionsFromSeeds(tables: Record<string, TableRow[]>) {
  const definitions: Record<string, unknown> = {};
  for (const [table, rows] of Object.entries(tables)) {
    const columns = rows.length ? Object.keys(rows[0]) : [];
    definitions[table] = {
      type: "object",
      properties: Object.fromEntries(columns.map((c) => [c, { type: "string" }])),
      required: columns,
    };
  }
  return {
    swagger: "2.0",
    paths: {},
    definitions,
  };
}