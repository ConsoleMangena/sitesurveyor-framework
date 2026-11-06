import {
  type SurveyCategory,
  type SurveyInput,
} from "../../../features/extensions/engine/client.ts";
import { outsideCoverage } from "../../../features/extensions/engine/coverage.ts";
import { parseCoordinate } from "../../../features/extensions/engine/labels.ts";

/** The four categories the survey form offers, in engine argument form. */
export type CategoryId = Exclude<SurveyCategory, "all" | "none">;

export const DEFAULT_CATEGORY_IDS: CategoryId[] = ["water", "minerals", "soil", "hazard"];

export const DEFAULT_HALF_DEG = 0.12;

export interface SurveyFormValues {
  latitude: string;
  longitude: string;
  clientName: string;
  address: string;
  halfDeg: number;
  categories: CategoryId[];
}

/**
 * Turn the form's raw strings into what the engine accepts, or say what is wrong.
 *
 * The coordinate box is checked here rather than left to the engine because a
 * refused survey costs a minute of waiting and a downloaded tile set, while this
 * check costs nothing and can name the point the operator actually typed.
 */
export function validateForm(form: SurveyFormValues): {
  input: SurveyInput | null;
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
        `(${latitude}, ${longitude}) is outside the satellite coverage this engine can read.`,
      );
    }
  }

  if (problems.length) return { input: null, problems };

  return {
    input: {
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
