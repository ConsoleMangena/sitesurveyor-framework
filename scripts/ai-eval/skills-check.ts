// Deterministic unit checks for the AI skill store (router, context
// formatting, auto-promotion). No model required — pure logic against the
// in-memory fixture. Run: `npm run ai:skills-check`.

import {
  selectSkills,
  formatSkillContext,
  promoteExample,
  parseExamples,
} from "../../backend/supabase/functions/_shared/skills.ts";
import { seed } from "./fixtures.ts";

const skills = (seed as unknown as { ai_skills: Record<string, unknown>[] }).ai_skills.map(
  (s: Record<string, unknown>) => ({
    ...s,
    examples: parseExamples(s.examples),
  }),
);

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean): void {
  if (cond) {
    pass += 1;
    console.log("PASS", name);
  } else {
    fail += 1;
    console.log("FAIL", name);
  }
}

// Router selects the relevant skill for each prompt shape.
check(
  "router->overdue",
  selectSkills("Please close all the overdue invoices", skills).some(
    (s) => s.key === "close-overdue-invoices",
  ),
);
check(
  "router->quote",
  selectSkills("Build a quote with line items", skills).some((s) => s.key === "create-quote"),
);
check(
  "router->schedule",
  selectSkills("Schedule job x for tomorrow", skills).some((s) => s.key === "schedule-job"),
);
check(
  "router->delete",
  selectSkills("Delete contact abc", skills).some((s) => s.key === "destructive-action-policy"),
);
check(
  "router->max3",
  selectSkills("schedule the job and close overdue invoices and delete x", skills).length <= 3,
);
check("router->nomatch", selectSkills("what is the weather", skills).length === 0);

// Context rendering includes the skill body and a clear section header.
const ctx = formatSkillContext(selectSkills("close overdue invoices", skills));
check("ctx-body", ctx.includes("close_overdue_invoices"));
check("ctx-header", ctx.includes("SKILLS"));

// Auto-promotion: insert, dedupe by prompt, bound by max.
const rows: Record<string, { id: string; key: string; examples: unknown[] }> = {};
rows.c1 = { id: "c1", key: "close-overdue-invoices", examples: [] };
const byKey = (k: string) => Object.values(rows).find((r) => r.key === k);
const fakeDb = {
  async supabaseFetch(opts: {
    method: string;
    path: string;
    body?: { examples?: unknown[] };
  }): Promise<{ ok: boolean; status: number; json: unknown[]; count: number }> {
    const q = (opts.path.split("?")[1] ?? "");
    const g = q.match(/(?:key|id)=eq\.([^&]+)/);
    if (!g) return { ok: true, status: 200, json: [], count: 0 };
    const val = decodeURIComponent(g[1]);
    const row = byKey(val) ?? Object.values(rows).find((r) => r.id === val);
    if (opts.method === "GET") {
      return {
        ok: true,
        status: 200,
        json: row ? [{ id: row.id, examples: row.examples }] : [],
        count: row ? 1 : 0,
      };
    }
    if (opts.method === "PATCH" && row && opts.body?.examples) {
      row.examples = opts.body.examples;
    }
    return { ok: true, status: 200, json: row ? [row] : [], count: row ? 1 : 0 };
  },
};
const dbOpts = { supabaseFetch: fakeDb.supabaseFetch.bind(fakeDb) } as {
  supabaseFetch: typeof fakeDb.supabaseFetch;
};
const dbCfg = { supabaseUrl: "https://x.invalid", serviceKey: "k" };
await promoteExample(dbOpts, dbCfg, "close-overdue-invoices", {
  prompt: "Close overdue",
  tools: [{ name: "close_overdue_invoices", args: {} }],
  result: "done",
});
check("promote-inserted", (byKey("close-overdue-invoices")?.examples ?? []).length === 1);
await promoteExample(dbOpts, dbCfg, "close-overdue-invoices", {
  prompt: "Close overdue",
  tools: [],
  result: "done",
});
check("promote-dedup", (byKey("close-overdue-invoices")?.examples ?? []).length === 1);
await promoteExample(dbOpts, dbCfg, "close-overdue-invoices", {
  prompt: "Close other ones",
  tools: [],
  result: "done2",
});
check("promote-add", (byKey("close-overdue-invoices")?.examples ?? []).length === 2);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
