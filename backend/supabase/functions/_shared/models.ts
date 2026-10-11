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

/** Models users may select. */
export const ALLOWED_MODELS: ReadonlySet<string> = new Set([
  ...THINKING_MACHINES_AI_MODELS,
]);

export type Provider = "thinking-machines-ai";

export function providerFor(model: string): Provider {
  return "thinking-machines-ai";
}

export function isAllowedModel(model: string): boolean {
  return ALLOWED_MODELS.has(model);
}

export function resolveModel(model?: string): string {
  if (!model) return DEFAULT_MODEL;
  return isAllowedModel(model) ? model : DEFAULT_MODEL;
}

export function scoreComplexity(userMessage: string): number {
  const complexSignals = ["analyze", "compare", "plan", "design", "strategy", "complex", "multi-step"];
  const score = complexSignals.reduce((acc, s) => acc + (userMessage.toLowerCase().includes(s) ? 1 : 0), 0);
  return Math.min(score, 3);
}
