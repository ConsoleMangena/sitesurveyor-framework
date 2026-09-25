// Centralized model allowlist + task-complexity routing for the AI agent.
//
// Single source of truth shared by both serve paths (ai-chat Edge Function
// and ai-gateway-server Node host). The allowlist is the hard boundary — any
// value not in it falls back to the default. Two OpenAI-compatible providers
// are served: Alibaba Cloud Model Studio (DashScope, Singapore/ap-southeast-1)
// Qwen ids at https://dashscope-intl.aliyuncs.com/compatible-mode/v1, and
// Google Gemini ids at https://generativelanguage.googleapis.com/v1beta/openai.
// Both are selected for tool/function calling support. The router escalates to
// a larger model for tasks the keyword signal marks as complex multi-step
// work, keeping routine tasks on the default model.

/** Google Gemini model ids (OpenAI-compatible endpoint). */
export const GEMINI_MODELS: ReadonlySet<string> = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-pro",
]);

/** Alibaba Cloud Model Studio (DashScope) Qwen model ids. */
export const QWEN_MODELS: ReadonlySet<string> = new Set([
  "qwen-plus",
  "qwen-max",
  "qwen-turbo",
  "qwen3.7-max",
  "qwen3.7-plus",
  "qwen3.7-flash",
]);

/** Models users may select. Anything outside silently falls back to DEFAULT_MODEL. */
export const ALLOWED_MODELS: ReadonlySet<string> = new Set([
  ...QWEN_MODELS,
  ...GEMINI_MODELS,
]);

export const DEFAULT_MODEL = "qwen-plus";
/** A larger model used to escalate complex multi-step tasks (Gemini when configured). */
export const STRONG_MODEL = "gemini-2.5-pro";
/** Escalation fallback used when STRONG_MODEL's provider (Gemini) is not configured. */
export const STRONG_MODEL_FALLBACK = "qwen3.7-max";

export type Complexity = "simple" | "complex";
export type Provider = "qwen" | "gemini";

/** Which OpenAI-compatible provider serves a model id. Unknown ids default to qwen. */
export function providerFor(modelId: string): Provider {
  return GEMINI_MODELS.has(modelId) ? "gemini" : "qwen";
}

/**
 * Pick a model honouring the user's request, the allowlist, and (when the
 * task looks complex) escalating to STRONG_MODEL. `available` is the set of
 * models whose provider key is configured on this serve path (defaults to the
 * full allowlist). Escalation prefers STRONG_MODEL (gemini-2.5-pro), falls
 * back to STRONG_MODEL_FALLBACK (qwen3.7-max), then DEFAULT_MODEL. An explicit
 * allowlisted request that is unavailable locally silently falls back to
 * DEFAULT_MODEL. Never returns an unknown value.
 */
export function resolveModel(
  requested: string | undefined,
  complexity: Complexity,
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
