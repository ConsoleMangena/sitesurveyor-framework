// Centralized model allowlist + task-complexity routing for the AI agent.
//
// Single source of truth shared by both serve paths (ai-chat Edge Function
// and ai-gateway-server Node host). The allowlist is the hard boundary — any
// value not in it falls back to the default. The router escalates to a
// larger (still free) model for tasks the keyword signal marks as complex
// multi-step work, keeping routine tasks on the default model.

/** Models users may select. Anything outside silently falls back to DEFAULT_MODEL. */
export const ALLOWED_MODELS: ReadonlySet<string> = new Set([
  "laguna-s-2.1",
  "agnes-2.5-flash",
  "agnes-3-flash",
  "stepfun-3.7-flash",
  "tencent-hy3-free",
]);

export const DEFAULT_MODEL = "laguna-s-2.1";
/** A larger model used to escalate complex multi-step tasks. */
export const STRONG_MODEL = "agnes-3-flash";

export type Complexity = "simple" | "complex";

/**
 * Pick a model honouring the user's request, the allowlist, and (when the
 * task looks complex) escalating to STRONG_MODEL. Never returns an unknown
 * value; unknown requested models fall back to DEFAULT_MODEL.
 */
export function resolveModel(requested: string | undefined, complexity: Complexity): string {
  const safe = typeof requested === "string" && ALLOWED_MODELS.has(requested.trim())
    ? requested.trim()
    : "";
  if (safe) return safe;
  return complexity === "complex" ? STRONG_MODEL : DEFAULT_MODEL;
}

/** True when the requested model is in the allowlist (or empty/undefined). */
export function isAllowedModel(requested: string | undefined): boolean {
  if (!requested || !requested.trim()) return true;
  return ALLOWED_MODELS.has(requested.trim());
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
  selectedSkillCount: number,
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
