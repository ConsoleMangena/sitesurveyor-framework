import type {
  StartSurveyInput,
  SurveyCategory,
  SurveyRun,
} from "../../../lib/repositories/satelliteSurveys.ts";
import {
  COVERAGE,
  outsideCoverage,
  parseCoordinate,
} from "../../../lib/surveys/labels.ts";

export const DEFAULT_CATEGORY_IDS: SurveyCategory[] = [
  "water",
  "minerals",
  "soil",
  "hazard",
];

export const DEFAULT_CATEGORY: SurveyCategory = "water";

export const DEFAULT_HALF_DEG = 0.12;

/** Where the map opens before anyone has typed a coordinate or run a survey: the site
 *  the engine was calibrated on, and the point its defaults describe. */
export const DEFAULT_TARGET = { latitude: -19.50487, longitude: 29.84598 };

export interface SurveyFormValues {
  jobId?: string;
  latitude: string;
  longitude: string;
  clientName: string;
  address: string;
  halfDeg: number;
  categories: SurveyCategory[];
  /** Which coverage each layer is read from. Absent means the engine's own defaults,
   *  which is what a form that never opened the panel is asking for. */
  dataSources?: Record<string, string>;
  composite?: { year: number; window: string };
}

/** Everything the platform needs to queue a survey, except which workspace asked. */
export type SurveyDraft = Omit<StartSurveyInput, "workspaceId" | "projectId">;

/** The form as the workbench opens it: a real point, a real extent, one category at a time. */
export function initialForm(): SurveyFormValues {
  return {
    jobId: "",
    latitude: DEFAULT_TARGET.latitude.toFixed(5),
    longitude: DEFAULT_TARGET.longitude.toFixed(5),
    clientName: "Site Survey",
    address: "",
    halfDeg: DEFAULT_HALF_DEG,
    categories: [DEFAULT_CATEGORY],
  };
}

/**
 * Where the target pin stands, which is not simply the two input boxes.
 *
 * A half-typed coordinate is not a location, and a pin that jumped to (0, 0) would put a
 * reader's survey in the Gulf of Guinea. So the pin holds the last point it could state —
 * the survey on screen if one is open, otherwise the default — until the form says
 * otherwise.
 */
export function pinTarget(
  form: SurveyFormValues,
  open: { latitude: number; longitude: number } | null,
): { latitude: number; longitude: number } {
  const latitude = parseCoordinate(form.latitude);
  const longitude = parseCoordinate(form.longitude);
  if (latitude !== null && longitude !== null) return { latitude, longitude };
  return open ?? DEFAULT_TARGET;
}

/**
 * Turn the form's raw strings into what the survey queue accepts, or say what is wrong.
 *
 * The coordinate box is checked here rather than left to the edge function because a
 * refused survey costs a credit and a queue slot, while this check costs nothing and can
 * name the point the operator actually typed. The function still checks it again -- it is
 * the last place that sees the numbers before money moves.
 */
export function validateForm(form: SurveyFormValues): {
  draft: SurveyDraft | null;
  problems: string[];
} {
  const problems: string[] = [];
  const latitude = parseCoordinate(form.latitude);
  const longitude = parseCoordinate(form.longitude);

  if (latitude === null) problems.push("Latitude must be a decimal degree.");
  if (longitude === null) problems.push("Longitude must be a decimal degree.");
  if (form.categories.length === 0) {
    problems.push("Select a survey category — an empty survey answers nothing.");
  } else if (form.categories.length > 1) {
    problems.push("Please select only one category at a time.");
  }

  if (latitude !== null && longitude !== null) {
    if (latitude < -90 || latitude > 90) {
      problems.push("Latitude must be between -90 and 90.");
    } else if (longitude < -180 || longitude > 180) {
      problems.push("Longitude must be between -180 and 180.");
    } else if (outsideCoverage(latitude, longitude)) {
      problems.push(
        `(${latitude}, ${longitude}) is outside the satellite coverage this workspace can read — ` +
          `${COVERAGE.latMin}° to ${COVERAGE.latMax}° latitude, ${COVERAGE.lonMin}° to ${COVERAGE.lonMax}° longitude.`,
      );
    }
  }

  if (problems.length) return { draft: null, problems };

  return {
    draft: {
      jobId: form.jobId || null,
      latitude: latitude as number,
      longitude: longitude as number,
      categories: form.categories,
      clientName: form.clientName.trim() || "Unnamed site",
      address: form.address.trim(),
      halfDeg: form.halfDeg,
      dataSources: form.dataSources ?? {},
      composite: form.composite ? { ...form.composite } : {},
    },
    problems,
  };
}

/** Which survey the numbers on the right came from, said plainly. */
export function sourceText(run: SurveyRun | null, queued: string | null): string {
  if (!run) return "No survey yet";
  if (run.id === queued) return "This survey";
  if (run.active) return "Survey running";
  return `Saved survey · ${shortStamp(run)}`;
}

/** What a score is worth, in the engine's own words rather than a softer paraphrase. */
export function resultsNote(run: SurveyRun | null, queued: string | null): string {
  if (!run) return "No survey has run in this workspace. Indicators populate when one finishes.";
  if (run.active) return "The worker is still scoring this area.";
  if (run.status === "failed") {
    return (
      run.errorMessage ??
      "The worker stopped without recording a reason, and the credits were returned."
    );
  }
  if (run.status === "cancelled") {
    return "This survey was withdrawn before a worker started, and its credits went back to the workspace.";
  }
  if (run.id === queued) {
    return "Scores are percentile ranks within this AOI, not absolute measurements. Two surveys are not comparable.";
  }
  return `Saved result from ${stampOf(run)}. Run a survey for your own coordinate.`;
}

function stampOf(run: SurveyRun): string {
  return new Date(run.completedAt ?? run.createdAt).toLocaleString();
}

function shortStamp(run: SurveyRun): string {
  return new Date(run.completedAt ?? run.createdAt).toLocaleDateString();
}
