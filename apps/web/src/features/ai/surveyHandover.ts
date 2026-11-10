/** One-shot handover of the open survey from the Satellite Workbench to the
 * assistant. The workbench writes the run it is showing, the assistant consumes
 * it on mount and forwards it to the agent as survey context — the same seam
 * the CAD workspace uses for project_id, carried through session storage
 * because view navigation is in-app state, not a URL.
 */

export const AI_SURVEY_CONTEXT_KEY = "sitesurveyor:ai_survey_context";

export interface AiSurveyContext {
  runId: string;
  label: string;
}

type ContextStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function writeAiSurveyContext(
  storage: ContextStorage,
  context: AiSurveyContext,
): void {
  try {
    storage.setItem(AI_SURVEY_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // Handover is best-effort; a blocked storage must not trap the user here.
  }
}

export function readAiSurveyContext(storage: ContextStorage): AiSurveyContext | null {
  try {
    const raw = storage.getItem(AI_SURVEY_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { runId?: unknown; label?: unknown };
    if (typeof parsed.runId !== "string" || !parsed.runId.trim()) return null;
    return {
      runId: parsed.runId.trim(),
      label:
        typeof parsed.label === "string" && parsed.label.trim()
          ? parsed.label.trim()
          : "Satellite survey",
    };
  } catch {
    return null;
  }
}

export function clearAiSurveyContext(storage: ContextStorage): void {
  try {
    storage.removeItem(AI_SURVEY_CONTEXT_KEY);
  } catch {
    // Nothing to consume is a valid state.
  }
}