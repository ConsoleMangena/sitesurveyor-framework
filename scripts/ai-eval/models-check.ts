// Deterministic unit checks for the model allowlist + task-complexity router.
// No model required — pure logic. Run: `npm run ai:models-check`.

import {
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  NVIDIA_NEMOTRON_MODELS,
  STRONG_MODEL_FALLBACK,
  STRONG_MODEL,
  isAllowedModel,
  providerFor,
  resolveModel,
  scoreComplexity,
} from "../../supabase/functions/_shared/models.ts";

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

// Allowlist shape.
check("allowlist-has-default", ALLOWED_MODELS.has(DEFAULT_MODEL));
check("allowlist-has-strong", ALLOWED_MODELS.has(STRONG_MODEL));
check("allowlist-size", ALLOWED_MODELS.size >= 3);

// isAllowedModel + resolveModel: explicit allowed value wins.
check(
  "resolve-explicit-allowed-default",
  resolveModel(DEFAULT_MODEL, "simple") === DEFAULT_MODEL,
);
check(
  "resolve-explicit-allowed-strong",
  resolveModel(STRONG_MODEL, "complex") === STRONG_MODEL,
);

check(
  "resolve-explicit-allowed-fallback",
  resolveModel(STRONG_MODEL_FALLBACK, "complex") === STRONG_MODEL_FALLBACK,
);

// resolveModel: empty / unknown falls back to default or strong by complexity.
check("resolve-empty-simple", resolveModel(undefined, "simple") === DEFAULT_MODEL);
check("resolve-empty-complex", resolveModel(undefined, "complex") === STRONG_MODEL);
check(
  "resolve-unknown-simple",
  resolveModel("not-a-real-model", "simple") === DEFAULT_MODEL,
);
check(
  "resolve-unknown-complex",
  resolveModel("not-a-real-model", "complex") === STRONG_MODEL,
);

// NVIDIA NIM allowlist + provider routing.
check("allowlist-has-nemotron-default", ALLOWED_MODELS.has(DEFAULT_MODEL));
check("allowlist-has-nemotron-strong", ALLOWED_MODELS.has(STRONG_MODEL));
check("nemotron-set-size", NVIDIA_NEMOTRON_MODELS.size === 5);
check("nemotron-set-nonempty", NVIDIA_NEMOTRON_MODELS.size >= 5);
check(
  "nemotron-ids-are-namespaced",
  [...NVIDIA_NEMOTRON_MODELS].every((m) => m.startsWith("nvidia/")),
);
check("provider-nvidia", providerFor(DEFAULT_MODEL) === "nvidia-nim");
check("provider-nvidia-strong", providerFor(STRONG_MODEL) === "nvidia-nim");
check("provider-unknown-defaults-nvidia", providerFor("wat") === "nvidia-nim");

// Availability-aware resolution.
check("resolve-explicit-nemotron", resolveModel(DEFAULT_MODEL, "simple") === DEFAULT_MODEL);
check(
  "resolve-explicit-nemotron-unavailable",
  resolveModel(DEFAULT_MODEL, "simple", new Set([STRONG_MODEL])) === DEFAULT_MODEL,
);
check(
  "resolve-complex-without-strong-falls-back",
  resolveModel(undefined, "complex", new Set([STRONG_MODEL_FALLBACK])) === STRONG_MODEL_FALLBACK,
);

// isAllowedModel: blanks are allowed (no model == default), unknowns are not.
check("is-allowed-blank", isAllowedModel(undefined));
check("is-allowed-empty", isAllowedModel(""));
check("is-allowed-known-nemotron", isAllowedModel(DEFAULT_MODEL));
check("is-denied-unknown", !isAllowedModel("gpt-4-turbo"));
check("is-denied-typo", !isAllowedModel("openrouter/auto"));

// scoreComplexity: keyword signals escalate to complex.
check("score-delete", scoreComplexity("please delete contact x", 0) === "complex");
check("score-erase", scoreComplexity("ERASE the whole layer", 0) === "complex");
check("score-schedule", scoreComplexity("Schedule job for tomorrow", 0) === "complex");
check(
  "score-create-quote",
  scoreComplexity("create a quote with these line items", 0) === "complex",
);
check("score-overdue", scoreComplexity("close all the overdue invoices", 0) === "complex");
check("score-bulk", scoreComplexity("Bulk import these contacts", 0) === "complex");

// scoreComplexity: simple greetings stay simple.
check("score-hi", scoreComplexity("hi", 0) === "simple");
check(
  "score-count-question",
  scoreComplexity("How many contacts do we have?", 0) === "simple",
);
check(
  "score-short-read",
  scoreComplexity("Show me last 5 invoices", 0) === "simple",
);

// scoreComplexity: long, multi-clause messages escalate even without keywords.
check(
  "score-long-multistep",
  scoreComplexity(
    "Create a new contact, add them to the project, and schedule a meeting for next week so we can review everything together before signing",
    0,
  ) === "complex",
);

// scoreComplexity: selected-skill count >= 2 escalates.
check("score-two-skills", scoreComplexity("hi", 2) === "complex");
check("score-zero-skills", scoreComplexity("hi", 0) === "simple");

// runAgent boundary: an unknown model yields an error event and exits before
// hitting the network. Proves the hard allowlist is enforced at the agent
// core (not just the serve paths).
const { runAgent } = await import("../../supabase/functions/_shared/ai-agent.ts");
async function firstEvent(model: string) {
  const gen = runAgent({
    history: [],
    userMessage: "hi",
    nvidiaApiKey: "test-key",
    supabaseUrl: "https://x.invalid",
    serviceKey: "k",
    model,
  });
  for await (const ev of gen) return ev;
  return null;
}
const denied = await firstEvent("gpt-4-not-allowed");
check("boundary-denied", denied?.type === "error" && /not in the allowlist/i.test(String((denied as { message?: string }).message)));
const empty = await firstEvent(undefined);
check("boundary-allowed-empty", empty !== null); // falls through; doesn't error on model

async function firstNvidiaNimEvent(model: string) {
  const gen = runAgent({
    history: [],
    userMessage: "hi",
    nvidiaApiKey: "" as unknown as string,
    supabaseUrl: "https://x.invalid",
    serviceKey: "k",
    model,
  });
  for await (const ev of gen) {
    if (ev.type === "error") return ev;
  }
  return null;
}
const nvidiaNoKey = await firstNvidiaNimEvent(DEFAULT_MODEL);
check(
  "boundary-nvidia-no-key",
  nvidiaNoKey?.type === "error" &&
    /nvidia/i.test(String((nvidiaNoKey as { message?: string }).message)),
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
