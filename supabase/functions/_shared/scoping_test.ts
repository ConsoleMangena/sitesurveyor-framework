/**
 * Tests for the tenant boundary every SiteSurveyor AI tool runs inside.
 *
 * The agent talks to PostgREST with the service-role key, which bypasses
 * row-level security, so the workspace predicate has to be in the request
 * itself. These tests cover the three layers that have to agree:
 *
 *  1. `scoping.ts` — the pure policy (which column scopes a table, what a
 *     model-supplied filter may say).
 *  2. `executeTool` — the exact HTTP requests a model tool call produces.
 *     Stubbed at `fetch`, so this asserts on real URLs, not on a re-reading of
 *     the policy.
 *  3. `workflows.ts` — the multi-step business operations, which inherit the
 *     predicate through `CallOpts.workspaceId`.
 *
 * Run with: deno test supabase/functions/_shared/
 */

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  PUBLIC_READ_TABLES,
  scopeRead,
  scopeWrite,
  workspaceParam,
} from "./scoping.ts";
import {
  closeOverdueInvoices,
  createQuoteFromLineItems,
  type CallOpts,
  type Db,
} from "./workflows.ts";
import { executeTool, type TableSchemaInfo } from "./ai-agent.ts";

const OWN_PROJECT = "11111111-1111-1111-1111-111111111111";
const RIVAL_PROJECT = "22222222-2222-2222-2222-222222222222";
const OWN_INVOICE = "33333333-3333-3333-3333-333333333333";
const RIVAL_INVOICE = "44444444-4444-4444-4444-444444444444";

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

function valueAt(row: Row, key: string): unknown {
  if (!key.includes(".")) return row[key];
  return key
    .split(".")
    .reduce<unknown>(
      (acc, part) => (acc && typeof acc === "object" ? (acc as Row)[part] : undefined),
      row,
    );
}

/** Honour every filter in the request, so a missing workspace predicate — or
 *  a mutation aimed at another workspace — shows up as an untouched rival row
 *  instead of passing silently. */
function select(store: Store, table: string, params: URLSearchParams): Row[] {
  let rows = store[table] ?? [];
  for (const key of params.keys()) {
    const value = params.get(key);
    if (!value || !value.includes(".")) continue;
    const dot = value.indexOf(".");
    const op = value.slice(0, dot);
    const operand = value.slice(dot + 1);
    if (op === "eq") {
      rows = rows.filter((r) => String(valueAt(r, key)) === operand);
    } else if (op === "like" || op === "ilike") {
      const source = operand
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
      const re = new RegExp(`^${source}$`, op === "ilike" ? "i" : "");
      rows = rows.filter((r) => re.test(String(valueAt(r, key) ?? "")));
    }
  }
  return rows;
}

function response(body: unknown, status: number, count: number | null): Response {
  const headers = new Headers();
  if (status === 204) return new Response(null, { status });
  headers.set("Content-Type", "application/json");
  if (count !== null) headers.set("content-range", `0-${Math.max(count - 1, 0)}/${count}`);
  return new Response(JSON.stringify(body), { status, headers });
}

/** Install a PostgREST stub over `fetch` and hand back the request log. */
function useSupabase(store: Store): {
  urls: string[];
  restore: () => void;
} {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    const u = new URL(url);
    const table = decodeURIComponent(u.pathname.slice("/rest/v1/".length));
    const params = new URLSearchParams(u.search);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body == null ? {} : JSON.parse(String(init.body)) as Row;

    if (method === "GET") {
      const rows = select(store, table, params);
      return response(rows, 200, rows.length);
    }
    if (method === "POST") {
      const list = (store[table] ??= []);
      const row = { ...body, id: `new-${list.length + 1}` };
      list.push(row);
      return response([row], 201, 1);
    }
    const targets = select(store, table, params);
    if (method === "PATCH") {
      for (const row of targets) Object.assign(row, body);
      return response(targets, 200, targets.length);
    }
    if (method === "DELETE") {
      store[table] = (store[table] ?? []).filter((r) => !targets.includes(r));
      return response(targets, 200, targets.length);
    }
    return response([], 200, 0);
  }) as typeof fetch;
  return { urls, restore: () => { globalThis.fetch = original; } };
}

function freshStore(): Store {
  return {
    projects: [
      { id: OWN_PROJECT, name: "Home ridge", workspace_id: "ws-1" },
      { id: RIVAL_PROJECT, name: "Rival ledger", workspace_id: "ws-2" },
    ],
    invoices: [
      { id: OWN_INVOICE, status: "overdue", workspace_id: "ws-1", invoice_number: "INV-1" },
      { id: RIVAL_INVOICE, status: "overdue", workspace_id: "ws-2", invoice_number: "INV-2" },
    ],
    public_market_listings: [{ id: "l1", title: "Total station" }],
  };
}

const SCHEMAS = new Map<string, TableSchemaInfo>([
  ["projects", { columns: ["id", "name", "workspace_id", "status"], required: ["id"] }],
  ["invoices", { columns: ["id", "status", "workspace_id", "invoice_number"], required: ["id"] }],
]);

function ctx(workspaceId?: string) {
  return {
    supabaseUrl: "http://test",
    serviceKey: "svc",
    workspaceId,
    schemas: SCHEMAS,
  };
}

// ── 1. The policy ──────────────────────────────────────────────────────────

Deno.test("scopeRead: a public market view needs no workspace", () => {
  const scoped = scopeRead("public_market_listings", undefined, undefined);
  assert(scoped.ok);
  assertEquals(scoped.params, []);
  assert(PUBLIC_READ_TABLES.has("public_market_listings"));
});

Deno.test("scopeRead: a tenant table with no workspace is refused", () => {
  const scoped = scopeRead("projects", undefined, undefined);
  assert(!scoped.ok);
  assertStringIncludes(scoped.error, "no workspace");
});

Deno.test("scopeRead: each table shape gets the column that owns it", () => {
  const plain = scopeRead("projects", "ws-1", undefined);
  assert(plain.ok);
  assertEquals(plain.params, [["workspace_id", "ws-1"]]);

  const self = scopeRead("workspaces", "ws-1", undefined);
  assert(self.ok);
  assertEquals(self.params, [["id", "ws-1"]]);

  const profile = scopeRead("profiles", "ws-1", undefined);
  assert(profile.ok);
  assertEquals(profile.params, [["default_workspace_id", "ws-1"]]);

  const activity = scopeRead("project_activities", "ws-1", undefined);
  assert(activity.ok);
  assertEquals(activity.params, [["projects.workspace_id", "ws-1"]]);
  assertEquals(activity.select, "*,projects!inner(workspace_id)");
});

Deno.test("scopeRead: the run's own workspace is dropped, any other refused", () => {
  const redundant = scopeRead("projects", "ws-1", [
    { column: "workspace_id", op: "eq", value: "ws-1" },
  ]);
  assert(redundant.ok);
  assertEquals(redundant.filters, []);

  const foreign = scopeRead("projects", "ws-1", [
    { column: "workspace_id", op: "eq", value: "ws-2" },
  ]);
  assert(!foreign.ok);
  assertStringIncludes(foreign.error, "reads only workspace ws-1");

  const widened = scopeRead("projects", "ws-1", [
    { column: "workspace_id", op: "neq", value: "ws-1" },
  ]);
  assert(!widened.ok);

  const other = scopeRead("projects", "ws-1", [
    { column: "status", op: "eq", value: "active" },
  ]);
  assert(other.ok);
  assertEquals(other.filters.length, 1);
});

Deno.test("scopeWrite: only the run's own workspace may own a row", () => {
  assert(!scopeWrite(undefined).ok);
  assert(!scopeWrite("").ok);
  assert(!scopeWrite("ws-1", "ws-2").ok);
  assert(scopeWrite("ws-1", "ws-1").ok);
  assert(scopeWrite("ws-1").ok);
  assertEquals(workspaceParam("ws/1"), "workspace_id=eq.ws%2F1");
});

// ── 2. The requests the tools emit ─────────────────────────────────────────

Deno.test("general job tables are no longer exposed to AI tools", async () => {
  const store = freshStore();
  const fake = useSupabase(store);
  try {
    for (const table of ["jobs", "job_events", "job_assignments"]) {
      const read = JSON.parse(
        await executeTool("query_site_data", JSON.stringify({ table }), ctx("ws-1")),
      ) as { error: string };
      assertStringIncludes(read.error, "not readable");

      const write = JSON.parse(
        await executeTool(
          "insert_site_record",
          JSON.stringify({ table, record: {}, confirmed: true }),
          ctx("ws-1"),
        ),
      ) as { error: string };
      assertStringIncludes(write.error, "not writable");
    }

    const scheduled = JSON.parse(
      await executeTool("schedule_job", JSON.stringify({}), ctx("ws-1")),
    ) as { error: string };
    assertStringIncludes(scheduled.error, "not writable");
    assertEquals(fake.urls, []);
  } finally {
    fake.restore();
  }
});

Deno.test("query_site_data returns only the run's rows", async () => {
  const store = freshStore();
  const fake = useSupabase(store);
  try {
    const rows = JSON.parse(
      await executeTool("query_site_data", JSON.stringify({ table: "projects" }), ctx("ws-1")),
    ) as Row[];
    assertEquals(rows.map((r) => r.id), [OWN_PROJECT]);
    assertStringIncludes(fake.urls[0], "workspace_id=eq.ws-1");
  } finally {
    fake.restore();
  }
});

Deno.test("a model filter cannot name another workspace, and emits no request", async () => {
  const store = freshStore();
  const fake = useSupabase(store);
  try {
    const result = JSON.parse(
      await executeTool(
        "query_site_data",
        JSON.stringify({ table: "projects", filters: [{ column: "workspace_id", op: "eq", value: "ws-2" }] }),
        ctx("ws-1"),
      ),
    ) as { error: string };
    assertStringIncludes(result.error, "reads only workspace ws-1");
    assertEquals(fake.urls, []);
  } finally {
    fake.restore();
  }
});

Deno.test("count_site_data counts inside the workspace only", async () => {
  const store = freshStore();
  const fake = useSupabase(store);
  try {
    const result = JSON.parse(
      await executeTool("count_site_data", JSON.stringify({ table: "invoices" }), ctx("ws-1")),
    ) as { count: number };
    assertEquals(result.count, 1);
    assertStringIncludes(fake.urls[0], "workspace_id=eq.ws-1");
  } finally {
    fake.restore();
  }
});

Deno.test("a non-market read with no workspace makes no request", async () => {
  const store = freshStore();
  const fake = useSupabase(store);
  try {
    const result = JSON.parse(
      await executeTool("query_site_data", JSON.stringify({ table: "projects" }), ctx(undefined)),
    ) as { error: string };
    assertStringIncludes(result.error, "no workspace");
    assertEquals(fake.urls, []);
  } finally {
    fake.restore();
  }
});

Deno.test("the anonymous market concierge still reads published views", async () => {
  const store = freshStore();
  const fake = useSupabase(store);
  try {
    const rows = JSON.parse(
      await executeTool(
        "query_site_data",
        JSON.stringify({ table: "public_market_listings" }),
        ctx(undefined),
      ),
    ) as Row[];
    assertEquals(rows.map((r) => r.id), ["l1"]);
    assertEquals(fake.urls.length, 1);
    assert(!fake.urls[0].includes("workspace_id=eq."), "published views carry no workspace predicate");
  } finally {
    fake.restore();
  }
});

Deno.test("inspect_columns never reads a tenant row", async () => {
  const store = freshStore();
  const fake = useSupabase(store);
  try {
    const result = JSON.parse(
      await executeTool("inspect_columns", JSON.stringify({ table: "projects" }), ctx("ws-1")),
    ) as { columns: string[] };
    assertEquals(result.columns, ["id", "name", "workspace_id", "status"]);
    assertEquals(fake.urls, []);
  } finally {
    fake.restore();
  }
});

Deno.test("insert stamps the run's workspace and refuses another", async () => {
  const store = freshStore();
  const fake = useSupabase(store);
  try {
    await executeTool(
      "insert_site_record",
      JSON.stringify({ table: "projects", record: { name: "New line" }, confirmed: true }),
      ctx("ws-1"),
    );
    const created = store.projects.find((r) => r.name === "New line");
    assertEquals(created?.workspace_id, "ws-1");

    const result = JSON.parse(
      await executeTool(
        "insert_site_record",
        JSON.stringify({ table: "projects", record: { name: "Trojan", workspace_id: "ws-2" }, confirmed: true }),
        ctx("ws-1"),
      ),
    ) as { error: string };
    assertStringIncludes(result.error, "outside this run");
    assertEquals(store.projects.filter((r) => r.name === "Trojan").length, 0);
  } finally {
    fake.restore();
  }
});

Deno.test("update cannot reach or re-parent another workspace's row", async () => {
  const store = freshStore();
  const fake = useSupabase(store);
  try {
    const reParent = JSON.parse(
      await executeTool(
        "update_site_record",
        JSON.stringify({ table: "projects", id: OWN_PROJECT, patch: { workspace_id: "ws-2" }, confirmed: true }),
        ctx("ws-1"),
      ),
    ) as { error: string };
    assertStringIncludes(reParent.error, "outside this run");
    assertEquals(store.projects.find((r) => r.id === OWN_PROJECT)?.workspace_id, "ws-1");

    const rival = JSON.parse(
      await executeTool(
        "update_site_record",
        JSON.stringify({ table: "projects", id: RIVAL_PROJECT, patch: { name: "Hijacked" }, confirmed: true }),
        ctx("ws-1"),
      ),
    ) as { _verified: boolean; error: string };
    assertEquals(rival._verified, false);
    assertStringIncludes(rival.error, "exists in workspace ws-1");
    assertEquals(store.projects.find((r) => r.id === RIVAL_PROJECT)?.name, "Rival ledger");
    const patch = fake.urls.find((url) => url.includes("/rest/v1/projects?") && url.includes("id=eq"));
    assertStringIncludes(patch ?? "", "workspace_id=eq.ws-1");
  } finally {
    fake.restore();
  }
});

Deno.test("delete only removes the run's own row", async () => {
  const store = freshStore();
  const fake = useSupabase(store);
  try {
    const rival = JSON.parse(
      await executeTool(
        "delete_site_record",
        JSON.stringify({ table: "invoices", id: RIVAL_INVOICE, confirmed: true }),
        ctx("ws-1"),
      ),
    ) as { deleted: boolean };
    assertEquals(rival.deleted, false);
    assertEquals(store.invoices.length, 2);

    const own = JSON.parse(
      await executeTool(
        "delete_site_record",
        JSON.stringify({ table: "invoices", id: OWN_INVOICE, confirmed: true }),
        ctx("ws-1"),
      ),
    ) as { deleted: boolean };
    assertEquals(own.deleted, true);
    assertEquals(store.invoices.map((r) => r.id), [RIVAL_INVOICE]);

    const del = fake.urls.find((url) => url.includes("id=eq.") && url.includes("invoices?"));
    assertStringIncludes(del ?? "", "workspace_id=eq.ws-1");
  } finally {
    fake.restore();
  }
});

// ── 3. The composite workflows ─────────────────────────────────────────────

/** The same eq/like-aware store, injected as the workflow `db` seam. */
function workflowDb(store: Store): { db: Db; paths: string[] } {
  const paths: string[] = [];
  const db: Db = {
    async supabaseFetch(opts) {
      paths.push(opts.path);
      const [table, qs = ""] = opts.path.split("?");
      const params = new URLSearchParams(qs);
      if (opts.method === "GET") {
        const rows = select(store, table, params);
        return { ok: true, status: 200, json: rows, count: rows.length };
      }
      if (opts.method === "POST") {
        const list = (store[table] ??= []);
        const row = { ...(opts.body as Row), id: `new-${list.length + 1}` };
        list.push(row);
        return { ok: true, status: 201, json: [row], count: 1 };
      }
      const targets = select(store, table, params);
      if (opts.method === "PATCH") {
        for (const row of targets) Object.assign(row, opts.body as Row);
        return { ok: true, status: 200, json: targets, count: targets.length };
      }
      store[table] = (store[table] ?? []).filter((r) => !targets.includes(r));
      return { ok: true, status: 200, json: targets, count: targets.length };
    },
  };
  return { db, paths };
}

const OPTS: CallOpts = { supabaseUrl: "http://test", serviceKey: "svc", workspaceId: "ws-1" };

Deno.test("close_overdue_invoices settles one workspace, not the platform", async () => {
  const store: Store = {
    invoices: [
      { id: "a", status: "overdue", invoice_number: "INV-1", workspace_id: "ws-1" },
      { id: "b", status: "overdue", invoice_number: "INV-2", workspace_id: "ws-1" },
      { id: "c", status: "draft", invoice_number: "INV-3", workspace_id: "ws-1" },
      { id: "d", status: "overdue", invoice_number: "INV-4", workspace_id: "ws-2" },
    ],
  };
  const { db, paths } = workflowDb(store);
  const result = JSON.parse(await closeOverdueInvoices(db, OPTS, {})) as {
    closed_count: number;
    workspace_id: string;
  };
  assertEquals(result.closed_count, 2);
  assertEquals(result.workspace_id, "ws-1");
  assertEquals(store.invoices.find((r) => r.id === "a")?.status, "paid");
  assertEquals(store.invoices.find((r) => r.id === "d")?.status, "overdue");
  assertEquals(store.invoices.find((r) => r.id === "d")?.paid_at, undefined);
  assert(paths.length > 0);
  for (const path of paths) assertStringIncludes(path, "workspace_id=eq.ws-1");

  const foreign = JSON.parse(
    await closeOverdueInvoices(db, OPTS, { scope: { workspace_id: "ws-2" } }),
  ) as { error: string };
  assertStringIncludes(foreign.error, "outside this run");

  const pathCount = paths.length;
  await closeOverdueInvoices(db, { ...OPTS, workspaceId: undefined }, {});
  assertEquals(paths.length, pathCount, "a workspace-less close must emit nothing");
});

Deno.test("create_quote_from_line_items owns its rows by the run's workspace", async () => {
  const store: Store = { quotes: [], quote_items: [] };
  const { db } = workflowDb(store);
  const result = JSON.parse(
    await createQuoteFromLineItems(db, OPTS, {
      lines: [{ description: "Boundary survey", qty: 2, rate: 100 }],
    }),
  ) as { subtotal: number; total: number; quote_id: string };
  assertEquals(result.subtotal, 200);
  assertEquals(result.total, 200);
  assertEquals(store.quotes[0]?.workspace_id, "ws-1");
  assertEquals(store.quote_items[0]?.workspace_id, "ws-1");

  const orphan = JSON.parse(
    await createQuoteFromLineItems(db, { ...OPTS, workspaceId: undefined }, {
      lines: [{ description: "Boundary survey", qty: 1, rate: 100 }],
    }),
  ) as { error: string };
  assertStringIncludes(orphan.error, "no workspace");
  assertEquals(store.quotes.length, 1);
});
