import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface Row {
  [k: string]: unknown;
}

const tables: Record<string, Row[]> = {};
const mockFetch = vi.fn();

vi.mock("../src/supabase.js", () => ({
  supabaseFetch: vi.fn((...args: unknown[]) => (mockFetch as unknown as (...a: unknown[]) => Promise<unknown>)(...args)),
}));
vi.mock("../src/memory.js", () => ({
  remember: vi.fn(async () => ({ ok: true, changed: true, memory: [] })),
  forget: vi.fn(async () => ({ ok: true, changed: true, found: true, memory: [] })),
  loadMemoryEntries: vi.fn(async () => []),
  memoryPrompt: vi.fn(() => ""),
}));

function jsonFor(method: string, path: string): Row[] {
  const [table] = path.split("?");
  return tables[table] ?? [];
}

function installFetch() {
  mockFetch.mockImplementation(async ({ method, path, preferCount }: {
    method: string;
    path: string;
    preferCount?: boolean;
  }) => {
    const rows = jsonFor(method, path);
    if (preferCount) {
      const total = rows.length;
      return { ok: true, status: 200, json: rows.slice(0, 1), count: total };
    }
    return { ok: true, status: 200, json: JSON.parse(JSON.stringify(rows)), count: rows.length };
  });
}

const CTX = {
  supabaseUrl: "http://test",
  serviceKey: "svc",
  workspaceId: "ws-1",
  stateDir: "/tmp",
  sessionId: "s1",
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sitesurveyor-tools-"));
  CTX.stateDir = dir;
  for (const key of Object.keys(tables)) delete tables[key];
  installFetch();
});

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("executeTool — read tools", () => {
  it("inspect_columns returns the columns of the first row", async () => {
    const { executeTool } = await import("../src/tools.js");
    tables.projects = [{ id: "p1", name: "A", workspace_id: "ws-1" }];
    const result = JSON.parse(await executeTool("inspect_columns", { table: "projects" }, CTX)) as { columns: string[] };
    expect(result.columns).toEqual(["id", "name", "workspace_id"]);
  });

  it("query_site_data returns truncated rows", async () => {
    const { executeTool } = await import("../src/tools.js");
    tables.projects = [{ id: "p1", name: "A" }];
    const result = JSON.parse(await executeTool("query_site_data", { table: "projects" }, CTX)) as Row[];
    expect(Array.isArray(result)).toBe(true);
  });

  it("count_site_data returns the count", async () => {
    const { executeTool } = await import("../src/tools.js");
    tables.invoices = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const result = JSON.parse(
      await executeTool("count_site_data", { table: "invoices" }, CTX),
    ) as { count: number };
    expect(result.count).toBe(3);
  });

  it("rejects reading a non-allowlisted table", async () => {
    const { executeTool } = await import("../src/tools.js");
    const result = JSON.parse(await executeTool("query_site_data", { table: "secrets" }, CTX)) as { error: string };
    expect(result.error).toMatch(/not readable/);
  });

  it("delete_site_record without confirmation returns pending_confirmation", async () => {
    const { executeTool } = await import("../src/tools.js");
    const result = JSON.parse(
      await executeTool("delete_site_record", { table: "invoices", id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", filter: { column: "id", op: "eq", value: "x" } }, CTX),
    ) as { status: string };
    expect(result.status).toBe("pending_confirmation");
  });
});
