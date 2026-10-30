import { describe, it, expect, vi, beforeEach } from "vitest";

interface Row {
  [k: string]: unknown;
}

const tables: Record<string, Row[]> = {};

vi.mock("../src/supabase.js", () => ({
  supabaseFetch: vi.fn(async ({ method, path, body }: {
    method: string;
    path: string;
    body?: unknown;
  }): Promise<{ ok: boolean; status: number; json: unknown; count: number | null }> => {
    const [table, qs = ""] = path.split("?");
    const params = new URLSearchParams(qs);
    if (method === "GET") {
      let rows = tables[table] ?? [];
      for (const key of params.keys()) {
        const value = params.get(key);
        if (!value || !/^eq\./.test(value)) continue;
        const expected = value.replace(/^eq\./, "");
        rows = rows.filter((r) => String(r[key]) === expected);
      }
      return { ok: true, status: 200, json: JSON.parse(JSON.stringify(rows)), count: rows.length };
    }
    if (method === "POST") {
      const row = { ...(body as Row), id: (tables[table]?.length ?? 0) + 1 };
      tables[table] = tables[table] ?? [];
      tables[table].push(row);
      return { ok: true, status: 201, json: [JSON.parse(JSON.stringify(row))], count: 1 };
    }
    if (method === "PATCH") {
      const id = params.get("id")?.replace(/^eq\./, "") ?? "";
      const idx = (tables[table] ?? []).findIndex((r) => String(r.id) === id);
      if (idx < 0) return { ok: false, status: 404, json: { message: "not found" }, count: 0 };
      tables[table][idx] = { ...tables[table][idx], ...(body as Row) };
      return { ok: true, status: 200, json: [tables[table][idx]], count: 1 };
    }
    return { ok: true, status: 200, json: [], count: 0 };
  }),
}));

const OPTS = { supabaseUrl: "http://test", serviceKey: "svc", workspaceId: "ws-1" };

async function rowCount(table: string): Promise<number> {
  return (tables[table] ?? []).length;
}

async function getRow(table: string, id: string): Promise<Row | undefined> {
  return (tables[table] ?? []).find((r) => String(r.id) === id);
}

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
});

describe("closeOverdueInvoices", () => {
  it("closes overdue invoices to paid and stamps paid_at", async () => {
    const { closeOverdueInvoices } = await import("../src/workflows.js");
    tables.invoices = [
      { id: "a", status: "overdue", invoice_number: "INV-1" },
      { id: "b", status: "overdue", invoice_number: "INV-2" },
      { id: "c", status: "draft", invoice_number: "INV-3" },
    ];
    const result = JSON.parse(await closeOverdueInvoices(OPTS, {})) as {
      closed_count: number;
      target_status: string;
    };
    expect(result.closed_count).toBe(2);
    expect(result.target_status).toBe("paid");
    expect((await getRow("invoices", "a"))!.status).toBe("paid");
    expect((await getRow("invoices", "a"))!.paid_at).toBeTruthy();
    expect((await getRow("invoices", "c"))!.status).toBe("draft");
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
    expect(await rowCount("quotes")).toBe(1);
    expect(await rowCount("quote_items")).toBe(2);
    expect(result.quote_id).toBeTruthy();
  });

  it("errors with no line items", async () => {
    const { createQuoteFromLineItems } = await import("../src/workflows.js");
    const result = await createQuoteFromLineItems(OPTS, { lines: [] });
    expect(JSON.parse(result).error).toBeTruthy();
  });
});

describe("scheduleJob", () => {
  it("schedules a schedulable job and updates status", async () => {
    const { scheduleJob } = await import("../src/workflows.js");
    tables.jobs = [{ id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", status: "confirmed", title: "GPS" }];
    const result = JSON.parse(
      await scheduleJob(OPTS, { job_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", assignment_date: "2026-09-10" }),
    ) as { status: string; assignment_id: string };
    expect(result.status).toBe("scheduled");
    expect(result.assignment_id).toBeTruthy();
    expect((await getRow("jobs", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"))!.status).toBe("scheduled");
    expect(await rowCount("job_assignments")).toBe(1);
  });

  it("rejects a completed job", async () => {
    const { scheduleJob } = await import("../src/workflows.js");
    tables.jobs = [{ id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", status: "completed", title: "Done" }];
    const result = await scheduleJob(OPTS, { job_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" });
    expect(JSON.parse(result).error).toMatch(/cannot be scheduled/);
  });

  it("rejects a malformed job id", async () => {
    const { scheduleJob } = await import("../src/workflows.js");
    const result = await scheduleJob(OPTS, { job_id: "not-a-uuid" });
    expect(JSON.parse(result).error).toMatch(/valid job_id/);
  });
});
