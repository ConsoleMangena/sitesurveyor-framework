import { describe, it, expect, vi, beforeEach } from "vitest";

interface Row {
  [k: string]: unknown;
}

const tables: Record<string, Row[]> = {};
const seen: string[] = [];

vi.mock("../src/supabase.js", () => ({
  supabaseFetch: vi.fn(async ({
    method,
    path,
    body,
  }: {
    method: string;
    path: string;
    body?: unknown;
  }): Promise<{ ok: boolean; status: number; json: unknown; count: number | null }> => {
    seen.push(`${method} ${path}`);
    const [table, qs = ""] = path.split("?");
    const params = new URLSearchParams(qs);

    // Every eq. filter in the request is honoured, so a mutation that lost the
    // workspace predicate shows up as an untouched rival row instead of
    // passing silently.
    const matching = (): Row[] =>
      (tables[table] ?? []).filter((row) => {
        for (const key of params.keys()) {
          const value = params.get(key);
          if (!value || !value.startsWith("eq.")) continue;
          if (String(row[key]) !== value.slice(3)) return false;
        }
        return true;
      });

    if (method === "GET") {
      const rows = matching();
      return { ok: true, status: 200, json: JSON.parse(JSON.stringify(rows)), count: rows.length };
    }
    if (method === "POST") {
      const list = tables[table] ?? [];
      const row = { ...(body as Row), id: `${table}-${list.length + 1}` };
      list.push(row);
      tables[table] = list;
      return { ok: true, status: 201, json: [JSON.parse(JSON.stringify(row))], count: 1 };
    }
    if (method === "PATCH") {
      const hits = matching();
      if (hits.length === 0) {
        return { ok: false, status: 404, json: { message: "no row matched" }, count: 0 };
      }
      for (const row of hits) Object.assign(row, body as Row);
      return { ok: true, status: 200, json: JSON.parse(JSON.stringify(hits)), count: hits.length };
    }
    return { ok: true, status: 200, json: [], count: 0 };
  }),
}));

const OPTS = { supabaseUrl: "http://test", serviceKey: "svc", workspaceId: "ws-1" };
const NO_WS = { supabaseUrl: "http://test", serviceKey: "svc" };

function rowCount(table: string): number {
  return (tables[table] ?? []).length;
}

function getRow(table: string, id: string): Row | undefined {
  return (tables[table] ?? []).find((r) => String(r.id) === id);
}

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  seen.length = 0;
});

describe("closeOverdueInvoices", () => {
  it("closes only its own workspace's overdue invoices", async () => {
    const { closeOverdueInvoices } = await import("../src/workflows.js");
    tables.invoices = [
      { id: "a", status: "overdue", invoice_number: "INV-1", workspace_id: "ws-1" },
      { id: "b", status: "overdue", invoice_number: "INV-2", workspace_id: "ws-1" },
      { id: "c", status: "draft", invoice_number: "INV-3", workspace_id: "ws-1" },
      { id: "d", status: "overdue", invoice_number: "INV-4", workspace_id: "ws-2" },
    ];
    const result = JSON.parse(await closeOverdueInvoices(OPTS, {})) as {
      closed_count: number;
      target_status: string;
      workspace_id: string;
    };
    expect(result.closed_count).toBe(2);
    expect(result.target_status).toBe("paid");
    expect(result.workspace_id).toBe("ws-1");
    expect(getRow("invoices", "a")!.status).toBe("paid");
    expect(getRow("invoices", "a")!.paid_at).toBeTruthy();
    expect(getRow("invoices", "c")!.status).toBe("draft");
    expect(getRow("invoices", "d")!.status).toBe("overdue");
    expect(getRow("invoices", "d")!.paid_at).toBeUndefined();
  });

  it("refuses a workspace named by the caller", async () => {
    const { closeOverdueInvoices } = await import("../src/workflows.js");
    tables.invoices = [
      { id: "d", status: "overdue", invoice_number: "INV-4", workspace_id: "ws-2" },
    ];
    const result = await closeOverdueInvoices(OPTS, { scope: { workspace_id: "ws-2" } });
    expect(JSON.parse(result).error).toMatch(/outside this run/);
    expect(seen).toHaveLength(0);
    expect(getRow("invoices", "d")!.status).toBe("overdue");
  });

  it("refuses to run without a workspace", async () => {
    const { closeOverdueInvoices } = await import("../src/workflows.js");
    tables.invoices = [
      { id: "a", status: "overdue", invoice_number: "INV-1", workspace_id: "ws-1" },
    ];
    const result = await closeOverdueInvoices(NO_WS, {});
    expect(JSON.parse(result).error).toMatch(/no workspace/);
    expect(seen).toHaveLength(0);
    expect(getRow("invoices", "a")!.status).toBe("overdue");
  });
});

describe("createQuoteFromLineItems", () => {
  it("creates a quote and its items with computed totals", async () => {
    const { createQuoteFromLineItems } = await import("../src/workflows.js");
    const result = JSON.parse(
      await createQuoteFromLineItems(OPTS, {
        lines: [
          { description: "Boundary survey", qty: 2, rate: 100 },
          { description: "Stakeout", qty: 1, rate: 50 },
        ],
      }),
    ) as {
      quote_id: string;
      subtotal: number;
      tax_total: number;
      total: number;
      line_count: number;
    };
    expect(result.subtotal).toBe(250);
    expect(result.tax_total).toBe(0);
    expect(result.total).toBe(250);
    expect(result.line_count).toBe(2);
    expect(rowCount("quotes")).toBe(1);
    expect(rowCount("quote_items")).toBe(2);
    expect(result.quote_id).toBeTruthy();
  });

  it("owns every row it creates by the run's workspace", async () => {
    const { createQuoteFromLineItems } = await import("../src/workflows.js");
    await createQuoteFromLineItems(OPTS, {
      lines: [{ description: "Control survey", qty: 1, rate: 500 }],
    });
    expect(getRow("quotes", "quotes-1")!.workspace_id).toBe("ws-1");
    expect(getRow("quote_items", "quote_items-1")!.workspace_id).toBe("ws-1");
  });

  it("errors with no line items", async () => {
    const { createQuoteFromLineItems } = await import("../src/workflows.js");
    const result = await createQuoteFromLineItems(OPTS, { lines: [] });
    expect(JSON.parse(result).error).toBeTruthy();
  });

  it("refuses to quote into a workspace-less run", async () => {
    const { createQuoteFromLineItems } = await import("../src/workflows.js");
    const result = await createQuoteFromLineItems(NO_WS, {
      lines: [{ description: "Boundary survey", qty: 1, rate: 100 }],
    });
    expect(JSON.parse(result).error).toMatch(/no workspace/);
    expect(seen).toHaveLength(0);
    expect(rowCount("quotes")).toBe(0);
  });
});
