import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface Row {
  [k: string]: unknown;
}

const tables: Record<string, Row[]> = {};
const definitions: Record<
  string,
  { properties: Record<string, unknown>; required?: string[] }
> = {};
/** Every request the tools actually emitted, in order. */
const seen: string[] = [];
const mockFetch = vi.fn();

vi.mock("../src/supabase.js", () => ({
  supabaseFetch: vi.fn((...args: unknown[]) => (mockFetch as unknown as (...a: unknown[]) => Promise<unknown>)(...args)),
}));
vi.mock("../src/memory.js", () => ({
  remember: vi.fn(async () => ({ ok: true, changed: true, memory: [] })),
  forget: vi.fn(async () => ({ ok: true, changed: true, memory: [] })),
  loadMemoryEntries: vi.fn(async () => []),
  memoryPrompt: vi.fn(() => ""),
}));

function valueAt(row: Row, key: string): unknown {
  if (!key.includes(".")) return row[key];
  return key
    .split(".")
    .reduce<unknown>(
      (acc, part) => (acc && typeof acc === "object" ? (acc as Row)[part] : undefined),
      row,
    );
}

/** Mimic PostgREST well enough that a missing workspace predicate is visible:
 *  rows only come back when every filter in the request matches them. */
function matching(params: URLSearchParams, table: string): Row[] {
  let rows = tables[table] ?? [];
  for (const key of params.keys()) {
    const value = params.get(key);
    if (!value || !value.includes(".")) continue;
    const dot = value.indexOf(".");
    const op = value.slice(0, dot);
    const operand = value.slice(dot + 1);
    if (op === "eq") {
      rows = rows.filter((r) => String(valueAt(r, key)) === operand);
    } else if (op === "like" || op === "ilike") {
      // PostgREST uses `*` as the wildcard for like/ilike.
      const source = operand
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
      const re = new RegExp(`^${source}$`, op === "ilike" ? "i" : "");
      rows = rows.filter((r) => re.test(String(valueAt(r, key) ?? "")));
    }
  }
  return rows;
}

function installFetch() {
  mockFetch.mockImplementation(async ({ method, path, body, preferCount }: {
    method: string;
    path: string;
    body?: unknown;
    preferCount?: boolean;
  }) => {
    seen.push(`${method} ${path}`);
    const [table, qs = ""] = path.split("?");
    const params = new URLSearchParams(qs);
    // The Data API root is the schema source (see src/schema.ts).
    if (table === "") {
      return { ok: true, status: 200, json: { definitions }, count: null };
    }
    if (method === "GET") {
      const rows = matching(params, table);
      if (preferCount) return { ok: true, status: 200, json: rows.slice(0, 1), count: rows.length };
      return { ok: true, status: 200, json: JSON.parse(JSON.stringify(rows)), count: rows.length };
    }
    if (method === "POST") {
      const row = { ...(body as Row), id: `new-${(tables[table]?.length ?? 0) + 1}` };
      tables[table] = tables[table] ?? [];
      tables[table].push(row);
      return { ok: true, status: 201, json: [JSON.parse(JSON.stringify(row))], count: 1 };
    }
    const targets = matching(params, table);
    if (method === "PATCH") {
      for (const row of targets) {
        Object.assign(row, body as Row);
      }
      return { ok: true, status: 200, json: JSON.parse(JSON.stringify(targets)), count: targets.length };
    }
    if (method === "DELETE") {
      tables[table] = (tables[table] ?? []).filter((r) => !targets.includes(r));
      // The tools send `Prefer: return=representation`, so PostgREST answers
      // with the rows it removed — an empty array means nothing matched.
      return { ok: true, status: 200, json: JSON.parse(JSON.stringify(targets)), count: targets.length };
    }
    return { ok: true, status: 200, json: [], count: 0 };
  });
}

const CTX = {
  supabaseUrl: "http://test",
  serviceKey: "svc",
  workspaceId: "ws-1",
  stateDir: "/tmp",
  sessionId: "s1",
};

const NO_WS = { ...CTX, workspaceId: undefined };

// Mutations only accept UUID ids, and a fixture that the code refuses for its
// shape would let a scoping bug pass unnoticed.
const OWN_PROJECT = "11111111-1111-1111-1111-111111111111";
const RIVAL_PROJECT = "22222222-2222-2222-2222-222222222222";
const OWN_INVOICE = "33333333-3333-3333-3333-333333333333";
const RIVAL_INVOICE = "44444444-4444-4444-4444-444444444444";

/** The last request path for a table, or "" when none was made. */
function lastPath(table: string): string {
  const hit = [...seen].reverse().find((entry) => entry.split(" ")[1]?.startsWith(`${table}?`));
  return hit ? decodeURIComponent(hit.slice(hit.indexOf(" ") + 1)) : "";
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sitesurveyor-tools-"));
  CTX.stateDir = dir;
  for (const key of Object.keys(tables)) delete tables[key];
  for (const key of Object.keys(definitions)) delete definitions[key];
  seen.length = 0;
  installFetch();
  definitions.projects = {
    properties: { id: {}, name: {}, workspace_id: {}, status: {} },
    required: ["id"],
  };
  definitions.invoices = {
    properties: { id: {}, status: {}, workspace_id: {}, invoice_number: {}, paid_at: {} },
    required: ["id"],
  };
  tables.projects = [
    { id: OWN_PROJECT, name: "Home ridge", workspace_id: "ws-1" },
    { id: RIVAL_PROJECT, name: "Rival ledger", workspace_id: "ws-2" },
  ];
  tables.invoices = [
    { id: OWN_INVOICE, status: "overdue", workspace_id: "ws-1", invoice_number: "INV-1" },
    { id: RIVAL_INVOICE, status: "overdue", workspace_id: "ws-2", invoice_number: "INV-2" },
  ];
});

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("executeTool — reads are pinned to one workspace", () => {
  it("query_site_data returns only the run's rows", async () => {
    const { executeTool } = await import("../src/tools.js");
    const rows = JSON.parse(
      await executeTool("query_site_data", { table: "projects" }, CTX),
    ) as Row[];
    expect(rows.map((r) => r.id)).toEqual([OWN_PROJECT]);
  });

  it("count_site_data counts only the run's rows", async () => {
    const { executeTool } = await import("../src/tools.js");
    const result = JSON.parse(
      await executeTool("count_site_data", { table: "invoices" }, CTX),
    ) as { count: number };
    expect(result.count).toBe(1);
  });

  it("a model filter cannot name another workspace", async () => {
    const { executeTool } = await import("../src/tools.js");
    const result = JSON.parse(
      await executeTool(
        "query_site_data",
        { table: "projects", filters: [{ column: "workspace_id", op: "eq", value: "ws-2" }] },
        CTX,
      ),
    ) as { error: string };
    expect(result.error).toMatch(/reads only workspace ws-1/);
    expect(seen.filter((s) => s.startsWith("GET projects"))).toEqual([]);
  });

  it("a redundant filter on the run's own workspace is dropped, not doubled", async () => {
    const { executeTool } = await import("../src/tools.js");
    await executeTool(
      "query_site_data",
      { table: "projects", filters: [{ column: "workspace_id", op: "eq", value: "ws-1" }] },
      CTX,
    );
    expect(lastPath("projects").match(/workspace_id=eq\.ws-1/g)).toHaveLength(1);
  });

  it("any other filter still applies inside the workspace", async () => {
    const { executeTool } = await import("../src/tools.js");
    const rows = JSON.parse(
      await executeTool(
        "query_site_data",
        { table: "projects", filters: [{ column: "name", op: "like", value: "*Home*" }] },
        CTX,
      ),
    ) as Row[];
    expect(rows.map((r) => r.id)).toEqual([OWN_PROJECT]);
    const rival = JSON.parse(
      await executeTool(
        "query_site_data",
        { table: "projects", filters: [{ column: "name", op: "like", value: "*Rival*" }] },
        CTX,
      ),
    ) as Row[];
    expect(rival).toEqual([]);
  });

  it("reads without a workspace on this run are refused before any request", async () => {
    const { executeTool } = await import("../src/tools.js");
    const result = JSON.parse(
      await executeTool("query_site_data", { table: "projects" }, NO_WS),
    ) as { error: string };
    expect(result.error).toMatch(/no workspace/);
    expect(seen.filter((s) => s.includes("projects"))).toEqual([]);
  });

  it("inspect_columns reads the schema, not a tenant's row", async () => {
    const { executeTool } = await import("../src/tools.js");
    const result = JSON.parse(
      await executeTool("inspect_columns", { table: "projects" }, CTX),
    ) as { columns: string[] };
    expect(result.columns).toEqual(["id", "name", "workspace_id", "status"]);
    expect(seen.filter((s) => s.includes("projects?"))).toEqual([]);
  });

  it("the workspaces table is scoped to its own id", async () => {
    const { executeTool } = await import("../src/tools.js");
    tables.workspaces = [
      { id: "ws-1", name: "A" },
      { id: "ws-2", name: "B" },
    ];
    const rows = JSON.parse(
      await executeTool("query_site_data", { table: "workspaces" }, CTX),
    ) as Row[];
    expect(rows.map((r) => r.id)).toEqual(["ws-1"]);
    expect(lastPath("workspaces")).toContain("id=eq.ws-1");
  });

  it("profiles are scoped to the workspace, not to whoever has a profile", async () => {
    const { executeTool } = await import("../src/tools.js");
    tables.profiles = [
      { id: "u1", default_workspace_id: "ws-1" },
      { id: "u2", default_workspace_id: "ws-2" },
    ];
    const rows = JSON.parse(
      await executeTool("query_site_data", { table: "profiles" }, CTX),
    ) as Row[];
    expect(rows.map((r) => r.id)).toEqual(["u1"]);
    expect(lastPath("profiles")).toContain("default_workspace_id=eq.ws-1");
  });

  it("project_activities reach the workspace through the project join", async () => {
    const { executeTool } = await import("../src/tools.js");
    tables.project_activities = [
      { id: "a1", project_id: OWN_PROJECT, projects: { workspace_id: "ws-1" } },
      { id: "a2", project_id: RIVAL_PROJECT, projects: { workspace_id: "ws-2" } },
    ];
    const rows = JSON.parse(
      await executeTool("query_site_data", { table: "project_activities" }, CTX),
    ) as Row[];
    expect(rows.map((r) => r.id)).toEqual(["a1"]);
    expect(lastPath("project_activities")).toContain("projects.workspace_id=eq.ws-1");
    expect(lastPath("project_activities")).toContain("select=*,projects!inner(workspace_id)");
  });

  it("a CAD drawing from another workspace is not found", async () => {
    const { executeTool } = await import("../src/tools.js");
    tables.project_cad_drawings = [
      {
        id: "d2",
        project_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        workspace_id: "ws-2",
        model: { points: [{ id: "pt1" }] },
      },
    ];
    const result = JSON.parse(
      await executeTool(
        "get_cad_drawing",
        { project_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
        CTX,
      ),
    ) as { error: string };
    expect(result.error).toMatch(/No drawing found/);
  });

  it.each(["secrets", "jobs", "job_events", "job_assignments"])(
    "rejects reading the removed or non-allowlisted table %s",
    async (table) => {
      const { executeTool } = await import("../src/tools.js");
      const result = JSON.parse(
        await executeTool("query_site_data", { table }, CTX),
      ) as { error: string };
      expect(result.error).toMatch(/not readable/);
      expect(seen).toEqual([]);
    },
  );
});

describe("executeTool — writes are owned by one workspace", () => {
  const uuid = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("insert stamps the run's workspace even when the record omits it", async () => {
    const { executeTool } = await import("../src/tools.js");
    await executeTool(
      "insert_site_record",
      { table: "projects", record: { name: "New line" } },
      CTX,
    );
    const created = (tables.projects ?? []).find((r) => r.id === "new-3");
    expect(created?.workspace_id).toBe("ws-1");
  });

  it("insert refuses a record addressed to another workspace", async () => {
    const { executeTool } = await import("../src/tools.js");
    const result = JSON.parse(
      await executeTool(
        "insert_site_record",
        { table: "projects", record: { name: "Trojan", workspace_id: "ws-2" } },
        CTX,
      ),
    ) as { error: string };
    expect(result.error).toMatch(/outside this run/);
    expect(tables.projects).toHaveLength(2);
  });

  it("update cannot move a row to another workspace", async () => {
    const { executeTool } = await import("../src/tools.js");
    const result = JSON.parse(
      await executeTool(
        "update_site_record",
        { table: "projects", id: OWN_PROJECT, patch: { workspace_id: "ws-2" } },
        CTX,
      ),
    ) as { error: string };
    expect(result.error).toMatch(/outside this run/);
    expect(tables.projects.find((r) => r.id === OWN_PROJECT)?.workspace_id).toBe("ws-1");
  });

  it("update only patches a row the run owns", async () => {
    const { executeTool } = await import("../src/tools.js");
    const result = JSON.parse(
      await executeTool(
        "update_site_record",
        { table: "projects", id: RIVAL_PROJECT, patch: { name: "Hijacked" } },
        CTX,
      ),
    ) as { updated: unknown; _verified: boolean; error: string };
    expect(tables.projects.find((r) => r.id === RIVAL_PROJECT)?.name).toBe("Rival ledger");
    expect(result._verified).toBe(false);
    expect(result.error).toMatch(/exists in workspace ws-1/);
  });

  it("delete cannot remove another workspace's row", async () => {
    const { executeTool } = await import("../src/tools.js");
    const result = JSON.parse(
      await executeTool(
        "delete_site_record",
        { table: "invoices", id: RIVAL_INVOICE, confirmed: true },
        CTX,
      ),
    ) as { deleted?: boolean; error: string };
    expect(result.deleted).toBe(false);
    expect(result.error).toMatch(/No invoices row/);
    expect((tables.invoices ?? []).length).toBe(2);
  });

  it("delete removes the run's own row when confirmed", async () => {
    const { executeTool } = await import("../src/tools.js");
    const result = JSON.parse(
      await executeTool(
        "delete_site_record",
        { table: "invoices", id: OWN_INVOICE, confirmed: true },
        CTX,
      ),
    ) as { deleted: boolean };
    expect(result.deleted).toBe(true);
    expect((tables.invoices ?? []).map((r) => r.id)).toEqual([RIVAL_INVOICE]);
  });

  it("delete without confirmation returns pending_confirmation", async () => {
    const { executeTool } = await import("../src/tools.js");
    const result = JSON.parse(
      await executeTool("delete_site_record", { table: "invoices", id: uuid }, CTX),
    ) as { status: string };
    expect(result.status).toBe("pending_confirmation");
  });

  it("writes with no workspace on this run are refused", async () => {
    const { executeTool } = await import("../src/tools.js");
    const result = JSON.parse(
      await executeTool("insert_site_record", { table: "projects", record: { name: "x" } }, NO_WS),
    ) as { error: string };
    expect(result.error).toMatch(/no workspace/);
  });

  it.each(["jobs", "job_events"])("rejects writing the removed table %s", async (table) => {
    const { executeTool } = await import("../src/tools.js");
    const result = JSON.parse(
      await executeTool("insert_site_record", { table, record: {} }, CTX),
    ) as { error: string };
    expect(result.error).toMatch(/not writable/);
    expect(seen).toEqual([]);
  });

  it("does not expose job scheduling to legacy MCP clients", async () => {
    const { executeTool } = await import("../src/tools.js");
    const { TOOL_NAMES } = await import("../src/constants.js");
    const { TOOL_DEFS } = await import("../src/toolDefs.js");
    expect(TOOL_NAMES).not.toContain("schedule_job");
    expect(TOOL_DEFS.map((tool) => tool.name)).not.toContain("schedule_job");

    const result = JSON.parse(await executeTool("schedule_job", {}, CTX)) as { error: string };
    expect(result.error).toMatch(/not writable/);
    expect(seen).toEqual([]);
  });
});
