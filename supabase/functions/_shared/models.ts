// Centralized model allowlist + task-complexity routing for the AI agent.
// Single source of truth shared by both serve paths (ai-chat Edge Function
// and ai-gateway-server Node host). The allowlist is the hard boundary — any
// value not in it falls back to the default. NVIDIA NIM is the provider at
// https://integrate.api.nvidia.com/v1, authenticated with an `nvapi-` key.

/**
 * NVIDIA NIM Nemotron model ids, in the `nvidia/<model>` form the endpoint
 * expects. Every id here is live-verified against the account's catalog: the
 * free tier exposes only a subset of build.nvidia.com, and an unentitled model
 * fails at call time with a 404 "Function not found for account" rather than
 * at key-validation time, so the list is deliberately narrow.
 */
export const NVIDIA_NEMOTRON_MODELS: ReadonlySet<string> = new Set([
  "nvidia/nemotron-3.5-bolt-e4b",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nemotron-3.5-super-vl-120b-a12b",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  "nvidia/nemotron-3-ultra-550b-a55b",
]);

/** Default model. */
export const DEFAULT_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";

/** Strong model for complex tasks. */
export const STRONG_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";

/** Escalation fallback used when STRONG_MODEL is not available in configured models. */
export const STRONG_MODEL_FALLBACK = "nvidia/nemotron-3.5-super-vl-120b-a12b";

/** Models users may select. Anything outside silently falls back to DEFAULT_MODEL. */
export const ALLOWED_MODELS: ReadonlySet<string> = new Set([
  ...NVIDIA_NEMOTRON_MODELS,
]);

export type Complexity = "simple" | "complex";
export type Provider = "nvidia-nim";

export function providerFor(model?: string): Provider {
  return "nvidia-nim";
}

export function isAllowedModel(requested: string | undefined): boolean {
  if (!requested || !requested.trim()) return true;
  return ALLOWED_MODELS.has(requested.trim());
}

/**
 * Pick a model honouring the user's request, the allowlist, and (when the
 * task looks complex) escalating to STRONG_MODEL. `available` is the set of
 * models whose provider key is configured on this serve path (defaults to the
 * full allowlist). Escalation prefers STRONG_MODEL (nemotron-3-ultra), falls
 * back to STRONG_MODEL_FALLBACK (nemotron-3.5-super-vl), then DEFAULT_MODEL.
 * An explicit allowlisted request that is unavailable locally silently falls
 * back to DEFAULT_MODEL. Never returns an unknown value.
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
