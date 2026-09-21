// Deterministic unit checks for the model allowlist + task-complexity router.
// No model required — pure logic. Run: `npm run ai:models-check`.

import {
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  STRONG_MODEL,
  isAllowedModel,
  resolveModel,
  scoreComplexity,
} from "../../backend/supabase/functions/_shared/models.ts";

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
check("allowlist-size", ALLOWED_MODELS.size >= 4);

// isAllowedModel + resolveModel: explicit allowed value wins.
check(
  "resolve-explicit-allowed-simple",
  resolveModel("nvidia/llama-3.1-nemotron-70b-instruct", "simple") === "nvidia/llama-3.1-nemotron-70b-instruct",
);
check(
  "resolve-explicit-allowed-complex",
  resolveModel("nvidia/llama-3.1-nemotron-ultra-253b-v1", "complex") === "nvidia/llama-3.1-nemotron-ultra-253b-v1",
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

// isAllowedModel: blanks are allowed (no model == default), unknowns are not.
check("is-allowed-blank", isAllowedModel(undefined));
check("is-allowed-empty", isAllowedModel(""));
check("is-allowed-known", isAllowedModel("nvidia/llama-3.1-nemotron-70b-instruct"));
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
const { runAgent } = await import("../../backend/supabase/functions/_shared/ai-agent.ts");
async function firstEvent(model: string) {
  const gen = runAgent({
    history: [],
    userMessage: "hi",
    nvidiaKey: "test-key",
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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
