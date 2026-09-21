// AI agent evaluation runner.
//
// Usage:
//   NVIDIA_API_KEY=nvapi-... node scripts/ai-eval/run.ts
//   NVIDIA_API_KEY=... node scripts/ai-eval/run.ts --model=nvidia/llama-3.1-nemotron-70b-instruct --filter=create-contact
//
// Runs each labelled case through the REAL agent loop (live model over
// NVIDIA NIM at build.nvidia.com) against an in-memory copy of the fixture
// Supabase transport, then applies deterministic assertions. Prints a pass/fail
// table; exit code 0 only if every case passes.

import {
  FakePostgrest,
  FIXTURE_BASE,
  seed,
} from "./fixtures.ts";
import { cases, type EvalFrame, type RunLog } from "./cases.ts";
import { runAgent, type AgentEvent } from "../../backend/supabase/functions/_shared/ai-agent.ts";

const KEY = process.env.NVIDIA_API_KEY ?? "";
const CASE_TIMEOUT_MS = 180_000;

function parseArgs(argv: string[]): { model?: string; filter?: string } {
  const out: { model?: string; filter?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const match = a.match(/^--(model|filter)=(.*)$/);
    if (match) {
      out[match[1] as "model" | "filter"] = match[2];
    } else if ((a === "--model" || a === "--filter") && i + 1 < argv.length) {
      out[a.slice(2) as "model" | "filter"] = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

function pad(text: string, width: number): string {
  const t = text.length > width ? text.slice(0, width - 1) + "…" : text;
  return t.padEnd(width);
}

function reqUrl(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return String((input as { url?: unknown })?.url ?? input);
}

async function main(): Promise<void> {
  if (!KEY) {
    console.error(
      "Missing NVIDIA_API_KEY. Set it to run the AI eval harness (it calls the real model against fixture data).",
    );
    process.exit(1);
  }
  const { model, filter } = parseArgs(process.argv.slice(2));
  const selected = filter ? cases.filter((c) => c.id.includes(filter)) : cases;
  if (selected.length === 0) {
    console.error(`No cases match --filter=${filter}`);
    process.exit(1);
  }

  const realFetch = globalThis.fetch.bind(globalThis);
  const holder: { fixture: FakePostgrest | null } = { fixture: null };
  globalThis.fetch = ((input: unknown, init?: RequestInit): Promise<Response> => {
    const url = reqUrl(input);
    if (url.startsWith(FIXTURE_BASE) && holder.fixture) {
      return holder.fixture.handle(url, init ?? {});
    }
    return realFetch(input as RequestInfo, init);
  }) as unknown as typeof fetch;

  const start = Date.now();
  let passCount = 0;
  let failCount = 0;
  const rows: {
    case: string;
    pass: boolean;
    note: string;
    model: string;
  }[] = [];
  const failures: string[] = [];

  for (const c of selected) {
    const fixture = new FakePostgrest(seed);
    holder.fixture = fixture;
    const events: { type: string; name?: string; text?: string }[] = [];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CASE_TIMEOUT_MS);
    let runError: string | undefined;
    const t0 = Date.now();
    try {
      const gen = runAgent({
        history: [],
        userMessage: c.prompt,
        nvidiaKey: KEY,
        supabaseUrl: FIXTURE_BASE,
        serviceKey: "test",
        model,
        userId: "user-test",
        conversationId: "conv-test",
        context: c.context ?? "dashboard",
        signal: controller.signal,
      });
      for await (const ev of gen as AsyncGenerator<AgentEvent>) {
        events.push(ev.type === "tool"
          ? { type: ev.type, name: (ev as { name: string }).name }
          : ev as { type: string; text?: string });
      }
    } catch (err) {
      runError = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
    }

    const logged = fixture.loggedRows;
    const log = logged.length ? (logged[logged.length - 1] as RunLog) : null;
    if (runError && log) {
      (log as { error?: string | null }).error = runError;
      (log as { outcome?: string }).outcome = "error";
    }
    const frame: EvalFrame = { log, events, fixture };
    let pass = false;
    let note = runError ? `run error: ${runError}` : "";
    const kindTag = c.kind === "soft" ? "soft" : "hard";
    if (!runError) {
      try {
        pass = await c.assert(frame);
      } catch (e) {
        pass = false;
        note = `assert threw: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else {
      pass = false;
    }
    const toolsUsed = (log?.tool_calls ?? []).map((t) => t.name).join(",") || "-";
    if (pass) passCount += 1;
    else {
      failCount += 1;
      failures.push(`${c.id} [${kindTag}]${note ? " — " + note : ""}`);
    }
    rows.push({
      case: `${c.id} [${kindTag}]`,
      pass,
      note: `${pad(note || "ok", 34)} rounds=${log?.rounds ?? "-"} tools=[${toolsUsed}] ms=${
        Date.now() - t0
      }`,
      model: log?.model ?? model ?? "default",
    });
  }

  console.log("\n── AI eval results ─────────────────────────────────────────────\n");
  console.log(`${pad("case", 34)} status  details`);
  console.log("-".repeat(78));
  for (const r of rows) {
    console.log(`${pad(r.case, 34)} ${r.pass ? "PASS" : "FAIL"}   ${r.note}`);
  }
  const secs = ((Date.now() - start) / 1000).toFixed(1);
  console.log("-".repeat(78));
  console.log(
    `${selected.length} cases — ${passCount} passed, ${failCount} failed (${model || "default model"}, ${secs}s)`,
  );
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }

  // Pass-rate by model: lets you tell when a serving model is the bottleneck
  // vs. a system issue. Multi-model runs (e.g. a suite run with no --model)
  // can include rows from different models.
  const byModel = new Map<string, { pass: number; fail: number }>();
  for (const r of rows) {
    const slot = byModel.get(r.model) ?? { pass: 0, fail: 0 };
    if (r.pass) slot.pass += 1;
    else slot.fail += 1;
    byModel.set(r.model, slot);
  }
  if (byModel.size > 0) {
    console.log("\nPass rate by model:");
    for (const [m, slot] of byModel) {
      const total = slot.pass + slot.fail;
      const pct = total > 0 ? Math.round((slot.pass / total) * 100) : 0;
      console.log(`  ${pad(m, 32)} ${slot.pass}/${total} (${pct}%)`);
    }
  }

  process.exit(failCount === 0 ? 0 : 1);
}

await main();