// Centralized model allowlist + task-complexity routing for the AI agent.
// Single source of truth shared by both serve paths (ai-chat Edge Function
// and ai-gateway-server Node host). The allowlist is the hard boundary — any
// value not in it falls back to the default. Thinking Machines AI (Inkling)
// is the provider at https://api.thinkingmachines.ai/v1.

/** Thinking Machines AI (Inkling) model ids. */
export const THINKING_MACHINES_AI_MODELS: ReadonlySet<string> = new Set([
  "inkling-flash",
  "inkling-pro",
  "inkling-turbo",
  "inkling-3.7-max",
  "inkling-3.7-plus",
  "inkling-3.7-flash",
]);

/** Default model. */
export const DEFAULT_MODEL = "inkling-flash";

/** Strong model for complex tasks. */
export const STRONG_MODEL = "inkling-pro";

/** Escalation fallback used when STRONG_MODEL is not available in configured models. */
export const STRONG_MODEL_FALLBACK = "inkling-3.7-max";

/** Models users may select. Anything outside silently falls back to DEFAULT_MODEL. */
export const ALLOWED_MODELS: ReadonlySet<string> = new Set([
  ...THINKING_MACHINES_AI_MODELS,
]);

export type Complexity = "simple" | "complex";
export type Provider = "thinking-machines-ai";

export function providerFor(model?: string): Provider {
  return "thinking-machines-ai";
}

export function isAllowedModel(requested: string | undefined): boolean {
  if (!requested || !requested.trim()) return true;
  return ALLOWED_MODELS.has(requested.trim());
}

/**
 * Pick a model honouring the user's request, the allowlist, and (when the
 * task looks complex) escalating to STRONG_MODEL. `available` is the set of
 * models whose provider key is configured on this serve path (defaults to the
 * full allowlist). Escalation prefers STRONG_MODEL (inkling-pro), falls back
 * to STRONG_MODEL_FALLBACK (inkling-3.7-max), then DEFAULT_MODEL. An explicit
 * allowlisted request that is unavailable locally silently falls back to
 * DEFAULT_MODEL. Never returns an unknown value.
 */
export function resolveModel(
  requested: string | undefined,
  complexity: Complexity = "simple",
  available: ReadonlySet<string> = ALLOWED_MODELS,
): string {
  const safe = typeof requested === "string" && ALLOWED_MODELS.has(requested.trim())
    ? requested.trim()
    : "";
  if (safe) return available.has(safe) ? safe : DEFAULT_MODEL;
  if (complexity === "complex") {
    if (available.has(STRONG_MODEL)) return STRONG_MODEL;
    if (available.has(STRONG_MODEL_FALLBACK)) return STRONG_MODEL_FALLBACK;
    return DEFAULT_MODEL;
  }
  return DEFAULT_MODEL;
}

/** Keyword signals that suggest a multi-step/complex task. */
const COMPLEX_KEYWORDS = [
  /\bdelete\b/i,
  /\berase\b/i,
  /\bschedule\b/i,
  /\bcreate\s+(a\s+)?quote\b/i,
  /\bbuild\s+(a\s+)?quote\b/i,
  /\boverdue\b/i,
  /\bclose\s+(all\s+)?the\s+overdue\b/i,
  /\bmulti[- ]step\b/i,
  /\bmigrate\b/i,
  /\bbulk\b/i,
  /\bimport\b/i,
];

const SIMPLE_MAX_LEN = 80;
const COMPLEX_MIN_SKILLS = 2;

/**
 * Deterministic, model-free complexity score using the Phase 2 router signal
 * (selected skills count) and cheap keyword heuristics. Anything ambiguous
 * stays "simple" so we don't waste the strong model.
 */
export function scoreComplexity(
  userMessage: string,
  selectedSkillCount: number = 0,
): Complexity {
  if (selectedSkillCount >= COMPLEX_MIN_SKILLS) return "complex";
  const msg = userMessage.trim();
  if (msg.length > 200) return "complex";
  for (const re of COMPLEX_KEYWORDS) {
    if (re.test(msg)) return "complex";
  }
  if (msg.length > SIMPLE_MAX_LEN && /[,;]/.test(msg)) return "complex";
  return "simple";
}
