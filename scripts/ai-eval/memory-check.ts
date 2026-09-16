// Deterministic unit checks for the AI structured-memory module
// (load/format/remember/forget). No model required — pure logic against an
// in-memory fake DB matching the Supabase REST shape. Run:
//   npm run ai:memory-check.

import {
  formatMemoryBlock,
  forget,
  loadMemory,
  remember,
} from "../../backend/supabase/functions/_shared/memory.ts";

interface MemoryRow {
  conversation_id: string;
  key: string;
  value: unknown;
  updated_at: string;
}

function makeDb(initial: MemoryRow[] = []) {
  const rows: MemoryRow[] = initial.map((r) => ({ ...r }));
  return {
    rows,
    async supabaseFetch(opts: {
      method: string;
      path: string;
      body?: { value?: unknown; updated_at?: string; conversation_id?: string; key?: string };
    }): Promise<{ ok: boolean; status: number; json: unknown; count: number | null }> {
      const q = (opts.path.split("?")[1] ?? "");
      const params = new URLSearchParams(q);
      const convFilter = params.get("conversation_id")?.replace("eq.", "");
      const keyFilter = params.get("key")?.replace("eq.", "");
      if (opts.method === "GET") {
        const matches = rows.filter(
          (r) =>
            (!convFilter || r.conversation_id === convFilter) &&
            (!keyFilter || r.key === keyFilter),
        );
        return { ok: true, status: 200, json: matches, count: matches.length };
      }
      if (opts.method === "PATCH") {
        let changed = 0;
        for (const r of rows) {
          if (
            (!convFilter || r.conversation_id === convFilter) &&
            (!keyFilter || r.key === keyFilter)
          ) {
            if (opts.body?.value !== undefined) r.value = opts.body.value;
            if (opts.body?.updated_at) r.updated_at = opts.body.updated_at;
            changed += 1;
          }
        }
        return { ok: true, status: 200, json: [], count: changed };
      }
      if (opts.method === "POST") {
        if (!opts.body?.conversation_id || !opts.body?.key) {
          return { ok: false, status: 400, json: { error: "missing" }, count: 0 };
        }
        rows.push({
          conversation_id: opts.body.conversation_id,
          key: opts.body.key,
          value: opts.body.value ?? null,
          updated_at: opts.body.updated_at ?? new Date().toISOString(),
        });
        return { ok: true, status: 201, json: [rows[rows.length - 1]], count: 1 };
      }
      if (opts.method === "DELETE") {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) {
          const r = rows[i];
          if (
            (!convFilter || r.conversation_id === convFilter) &&
            (!keyFilter || r.key === keyFilter)
          ) {
            rows.splice(i, 1);
          }
        }
        return { ok: true, status: 204, json: [], count: before - rows.length };
      }
      return { ok: true, status: 200, json: [], count: 0 };
    },
  };
}

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

const cfg = { supabaseUrl: "https://x.invalid", serviceKey: "k", conversationId: "conv-1" };
const dbOpts = (db: ReturnType<typeof makeDb>) => ({ supabaseFetch: db.supabaseFetch.bind(db) });

// loadMemory returns [] on empty.
const empty = makeDb();
check("load-empty", (await loadMemory(dbOpts(empty), cfg)).length === 0);

// remember inserts a new fact (POST when none match).
const fresh = makeDb();
const ok1 = await remember(dbOpts(fresh), cfg, "active_layer", "SETOUT");
check("remember-insert", ok1 && fresh.rows.length === 1 && fresh.rows[0].value === "SETOUT");

// remember updates an existing fact (PATCH path).
const ok2 = await remember(dbOpts(fresh), cfg, "active_layer", "BOUNDARY");
check(
  "remember-update",
  ok2 && fresh.rows.length === 1 && fresh.rows[0].value === "BOUNDARY",
);

// remember rejects empty key.
check("remember-empty-key", !(await remember(dbOpts(fresh), cfg, "  ", "x")));

// formatMemoryBlock renders a compact block when facts exist.
const facts = await loadMemory(dbOpts(fresh), cfg);
const block = formatMemoryBlock(facts);
check("block-header", block.includes("STRUCTURED MEMORY"));
check("block-content", block.includes("active_layer") && block.includes("BOUNDARY"));

// formatMemoryBlock returns "" when no facts.
check("block-empty", formatMemoryBlock([]) === "");

// forget removes a key.
const ok3 = await forget(dbOpts(fresh), cfg, "active_layer");
check("forget-ok", ok3 && fresh.rows.length === 0);

// forget on empty key returns false.
check("forget-empty-key", !(await forget(dbOpts(fresh), cfg, "")));

// loadMemory catches fetch failures and returns [].
const broken = {
  async supabaseFetch(): Promise<{ ok: boolean; status: number; json: unknown; count: null }> {
    throw new Error("network down");
  },
};
check("load-resilient", (await loadMemory({ supabaseFetch: broken.supabaseFetch.bind(broken) }, cfg)).length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
