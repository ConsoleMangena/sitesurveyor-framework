/**
 * The survey a job asks for.
 *
 * A job is not a label on a survey: it is the record of what is being looked at and how
 * much ground it covers, and those two facts plus the survey type are exactly what the
 * platform prices the job at. So the specification lives on the job, and the credit
 * quote follows from it rather than from whatever the form happens to hold later.
 *
 * The specification travels in the job's `description` field as JSON. That field was
 * already carrying the survey category the same way; this widens it rather than
 * inventing a second place for the same fact.
 */

import type { SurveyCategory } from "../repositories/satelliteSurveys.ts";
import {
  AOI_CHOICES,
  outsideCoverage,
  parseCoordinate,
} from "./labels.ts";

export interface JobSurveySpec {
  category: SurveyCategory;
  latitude: number;
  longitude: number;
  halfDeg: number;
}

/** The category of a job that carries no full specification. */
export const DEFAULT_JOB_CATEGORY: SurveyCategory = "water";

export function serializeJobSpec(spec: JobSurveySpec): string {
  return JSON.stringify({
    category: spec.category,
    latitude: spec.latitude,
    longitude: spec.longitude,
    halfDeg: spec.halfDeg,
  });
}

/**
 * Read a job's specification back.
 *
 * A job written before specifications existed carries only its category, so that is
 * returned as a specification with no ground rather than refused: the reader still
 * learns what type of survey the job is about.
 */
export function parseJobSpec(
  description: string | null | undefined,
): (JobSurveySpec & { hasGround: boolean }) | null {
  if (!description) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(description);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const record = parsed as Record<string, unknown>;
  const category = String(record.category ?? "");
  if (!["water", "minerals", "soil", "hazard"].includes(category)) return null;

  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  const halfDeg = Number(record.halfDeg);
  const hasGround =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Number.isFinite(halfDeg) &&
    halfDeg > 0;

  return {
    category: category as SurveyCategory,
    latitude: hasGround ? latitude : 0,
    longitude: hasGround ? longitude : 0,
    halfDeg: hasGround ? halfDeg : 0,
    hasGround,
  };
}

/**
 * The specification a job would carry, or null when the ground cannot be read.
 *
 * A job with no readable point has no price, so it cannot be created: this is the
 * check the creation form makes before it writes anything.
 */
export function jobSpecFrom(input: {
  category: SurveyCategory;
  latitude: string;
  longitude: string;
  halfDeg: number;
}): JobSurveySpec | null {
  const latitude = parseCoordinate(input.latitude);
  const longitude = parseCoordinate(input.longitude);
  if (latitude === null || longitude === null) return null;
  return { category: input.category, latitude, longitude, halfDeg: input.halfDeg };
}

/**
 * Everything wrong with a proposed job, in one pass.
 *
 * A job that cannot be priced is a job that cannot be created, so the checks here are
 * the ones the price depends on: a survey type, a point on the globe, and an extent.
 */
export function jobSpecProblems(input: {
  title: string;
  category: SurveyCategory;
  latitude: string;
  longitude: string;
  halfDeg: number;
}): string[] {
  const problems: string[] = [];

  if (!input.title.trim()) problems.push("A job title is required.");

  const latitude = parseCoordinate(input.latitude);
  const longitude = parseCoordinate(input.longitude);

  if (latitude === null) {
    problems.push("Latitude must be a decimal degree.");
  } else if (latitude < -90 || latitude > 90) {
    problems.push("Latitude must be a number between -90 and 90.");
  }

  if (longitude === null) {
    problems.push("Longitude must be a decimal degree.");
  } else if (longitude < -180 || longitude > 180) {
    problems.push("Longitude must be a number between -180 and 180.");
  }

  // Only a point that can be read is judged against the coverage box: a missing
  // longitude is not a longitude of zero, and reading it as one would report a
  // coverage problem the operator did not cause. The bounds themselves are explained
  // where the coordinate is typed, so this says only what is wrong.
  if (latitude !== null && longitude !== null && outsideCoverage(latitude, longitude)) {
    problems.push("This point is outside the coverage the engine can read.");
  }

  const known = AOI_CHOICES.some((choice) => choice.value === input.halfDeg);
  if (!known) {
    problems.push("Choose how much ground the survey covers.");
  }

  return problems;
}
