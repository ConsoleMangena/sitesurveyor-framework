// Deterministic unit checks for the agent's tool-round loop.
//
// The model is SCRIPTED, not called: each scenario feeds the exact SSE chunks a
// real provider is known to emit, so the round-exhaustion paths below are
// reproducible and free to run. Supabase traffic goes to the fixture transport.
//
// Run: `npm run ai:rounds-check`

import {
  FakePostgrest,
  FIXTURE_BASE,
  seed,
} from "./fixtures.ts";
import { runAgent, type AgentEvent } from "../../supabase/functions/_shared/ai-agent.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass += 1;
    console.log("PASS", name);
  } else {
    fail += 1;
    console.log("FAIL", name, detail);
  }
}

/** One streamed model reply, in the shape the agent parses. */
interface ScriptedReply {
  content?: string;
  toolCall?: { name: string; arguments: string };
  finishReason: string | null;
}

/** A reply per request: either a fixed script or a rule keyed on whether the
 *  request still advertised the tool schema (a looping model calls tools for as
 *  long as it is allowed to). */
type Script =
  | ScriptedReply[]
  | ((requestIndex: number, advertisesTools: boolean) => ScriptedReply);

interface CapturedRequest {
  /** True when the request body advertised the tool schema to the model. */
  advertisesTools: boolean;
  body: string;
}

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const realFetch = globalThis.fetch.bind(globalThis);

function sseResponse(reply: ScriptedReply): Response {
  const enc = new TextEncoder();
  const chunks: string[] = [];
  if (reply.content) {
    chunks.push(JSON.stringify({ choices: [{ delta: { content: reply.content } }] }));
  }
  if (reply.toolCall) {
    // Emit id/name and the arguments in separate deltas, the way streaming
    // OpenAI-compatible providers actually fragment them.
    chunks.push(
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_1",
                  function: { name: reply.toolCall.name, arguments: "" },
                },
              ],
            },
          },
        ],
      }),
    );
    chunks.push(
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: reply.toolCall.arguments },
                },
              ],
            },
          },
        ],
      }),
    );
  }
  chunks.push(JSON.stringify({ choices: [{ delta: {}, finish_reason: reply.finishReason }] }));
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      for (const data of chunks) c.enqueue(enc.encode(`data: ${data}\n`));
      c.enqueue(enc.encode("data: [DONE]\n"));
      c.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function drive(
  script: Script,
  opts: { maxToolRounds?: number } = {},
): Promise<{
  events: AgentEvent[];
  requests: CapturedRequest[];
  log: { rounds?: number; outcome?: string; error?: string | null; tool_calls?: { name: string }[] } | null;
}> {
  const fixture = new FakePostgrest(seed);
  const requests: CapturedRequest[] = [];
  let scripted = 0;

  globalThis.fetch = (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : String((input as { url?: unknown })?.url ?? input);

    if (url.startsWith(NVIDIA_URL)) {
      const body = String(init?.body ?? "{}");
      const advertisesTools = /"tools"\s*:/.test(body);
      requests.push({ advertisesTools, body });
      const reply =
        typeof script === "function"
          ? script(scripted, advertisesTools)
          : script[Math.min(scripted, script.length - 1)];
      scripted += 1;
      return sseResponse(reply);
    }
    if (url.startsWith(FIXTURE_BASE)) return fixture.handle(url, init ?? {});
    return realFetch(input as RequestInfo, init);
  }) as unknown as typeof fetch;

  const events: AgentEvent[] = [];
  try {
    const gen = runAgent({
      history: [],
      userMessage: "How many contacts do we have?",
      nvidiaApiKey: "test-key",
      supabaseUrl: FIXTURE_BASE,
      serviceKey: "test",
      conversationId: "conv-test",
      maxToolRounds: opts.maxToolRounds,
    });
    for await (const ev of gen) events.push(ev);
  } finally {
    globalThis.fetch = realFetch;
  }

  const logged = fixture.loggedRows;
  const log = logged.length ? (logged[logged.length - 1] as never as Record<string, unknown>) : null;
  return { events, requests, log: log as never };
}

const finalTextOf = (events: AgentEvent[]): string | undefined =>
  events.find((e) => e.type === "final")?.text;
const errorTextOf = (events: AgentEvent[]): string | undefined =>
  events.find((e) => e.type === "error")?.message;
const toolEventNames = (events: AgentEvent[]): string[] =>
  events.filter((e) => e.type === "tool").map((e) => String(e.name));

const TOOL_REPLY: ScriptedReply = {
  toolCall: { name: "count_site_data", arguments: '{"table":"contacts"}' },
  finishReason: "tool_calls",
};
const ANSWER: ScriptedReply = {
  content: "You have 3 contacts.",
  finishReason: "stop",
};

// ── 1. A model that never stops calling tools must still answer. ───────────
// The old loop hard-failed once the budget ran out, throwing away every result
// the tools had already gathered. The scripted model wants another tool call
// for as long as one is allowed.
{
  const { events, requests, log } = await drive(
    (_requestIndex, advertisesTools) => (advertisesTools ? TOOL_REPLY : ANSWER),
    { maxToolRounds: 2 },
  );
  const err = errorTextOf(events);
  check(
    "exhaustion-recovers-with-final-answer",
    !err && finalTextOf(events) === "You have 3 contacts.",
    `error=${JSON.stringify(err)} final=${JSON.stringify(finalTextOf(events))}`,
  );
  // The wrap-up request must NOT advertise tools: with the schema still in the
  // request, a tool-happy model can loop again and the recovery is not a
  // recovery at all.
  const last = requests[requests.length - 1];
  check("wrap-up-omits-tool-schema", !!last && last.advertisesTools === false,
    `requests=${requests.length} lastAdvertisesTools=${last?.advertisesTools}`);
  check(
    "wrap-up-succeeds-in-log",
    log?.outcome === "success" && !log?.error,
    `outcome=${log?.outcome} error=${JSON.stringify(log?.error)}`,
  );
}

// ── 2. Tool calls arriving with finish_reason "stop" are still tool calls. ─
// Several NIM models report "stop" after emitting tool_calls. Requiring
// "tool_calls" exactly drops the call and answers "couldn't complete".
{
  const stopWithTools: ScriptedReply = {
    toolCall: { name: "count_site_data", arguments: '{"table":"contacts"}' },
    finishReason: "stop",
  };
  const { events } = await drive([stopWithTools, ANSWER]);
  check(
    "stop-finish-with-tool-calls-executes",
    toolEventNames(events).includes("count_site_data") && finalTextOf(events) === "You have 3 contacts.",
    `tools=[${toolEventNames(events)}] final=${JSON.stringify(finalTextOf(events))} error=${JSON.stringify(errorTextOf(events))}`,
  );
}

// ── 3. Truncated tool arguments must not be executed as garbage. ──────────
// Reasoning models spend the token budget on thinking and can cut a call off
// mid-JSON. Executing it returns "Invalid JSON arguments.", which the model
// retries — that retry loop is what actually burns the rounds.
{
  const truncated: ScriptedReply = {
    toolCall: { name: "count_site_data", arguments: '{"table":"cont' },
    finishReason: "length",
  };
  const { events } = await drive([truncated, ANSWER]);
  const results = JSON.stringify(events);
  check(
    "truncated-args-not-executed",
    !results.includes("Invalid JSON arguments"),
    "invalid-args result reached the model",
  );
  check(
    "truncated-args-still-answers",
    !errorTextOf(events) && finalTextOf(events) === "You have 3 contacts.",
    `error=${JSON.stringify(errorTextOf(events))} final=${JSON.stringify(finalTextOf(events))}`,
  );
}

// ── 4. An identical call stops the run only after it is clearly a loop. ───
// Two passes of the same call is a legitimate re-read (did that write land?);
// the third is the model spinning. Guarding at once would deny verification.
{
  const { events, requests } = await drive(
    (_requestIndex, advertisesTools) => (advertisesTools ? TOOL_REPLY : ANSWER),
  );
  const executed = toolEventNames(events).length;
  check(
    "identical-re-read-allowed-twice",
    executed === 2,
    `executed=${executed} expected=2`,
  );
  check(
    "loop-stops-before-budget",
    requests.length === 4 && !errorTextOf(events),
    `requests=${requests.length} error=${JSON.stringify(errorTextOf(events))}`,
  );
  check(
    "duplicate-call-still-answers",
    finalTextOf(events) === "You have 3 contacts.",
    `final=${JSON.stringify(finalTextOf(events))}`,
  );
}

// ── 5. Regression: the ordinary two-round path is untouched. ──────────────
{
  const { events, requests, log } = await drive([TOOL_REPLY, ANSWER]);
  check(
    "normal-path-still-two-requests",
    requests.length === 2 && finalTextOf(events) === "You have 3 contacts.",
    `requests=${requests.length} error=${JSON.stringify(errorTextOf(events))}`,
  );
  check("normal-path-logs-success", log?.outcome === "success", `outcome=${log?.outcome}`);
}

// ── 6. A plain answer with no tools never triggers a wrap-up request. ─────
{
  const { events, requests } = await drive([ANSWER]);
  check(
    "no-tools-single-request",
    requests.length === 1 && finalTextOf(events) === "You have 3 contacts.",
    `requests=${requests.length}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
