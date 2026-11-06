import type {
  StartSurveyInput,
  SurveyCategory,
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

export const DEFAULT_HALF_DEG = 0.12;

export interface SurveyFormValues {
  latitude: string;
  longitude: string;
  clientName: string;
  address: string;
  halfDeg: number;
  categories: SurveyCategory[];
}

/** Everything the platform needs to queue a survey, except which workspace asked. */
export type SurveyDraft = Omit<StartSurveyInput, "workspaceId" | "projectId">;

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
  if (!form.categories.length) {
    problems.push("Pick at least one category — an empty survey answers nothing.");
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
      latitude: latitude as number,
      longitude: longitude as number,
      categories: form.categories,
      clientName: form.clientName.trim() || "Unnamed site",
      address: form.address.trim(),
      halfDeg: form.halfDeg,
    },
    problems,
  };
}
