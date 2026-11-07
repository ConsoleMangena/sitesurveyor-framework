/**
 * What a survey costs, and the ground it costs it for.
 *
 * The numbers are priced by the platform, in `price_satellite_survey`, from the survey
 * types asked for and the ground they cover. This file only reads that quote: it never
 * computes a price of its own, because a price the browser can work out is a price the
 * browser can be wrong about. The one thing derived here is how the quote is written
 * down for a reader.
 */

import type { SurveyCategory } from "../repositories/satelliteSurveys.ts";

/** One survey type's share of the bill. */
export interface SurveyQuoteLine {
  category: SurveyCategory;
  label: string;
  /** What running this engine costs before any ground is scored. */
  baseCredits: number;
  /** What the ground covered adds. */
  areaCredits: number;
  /** What this type comes to, after the floor for small plots. */
  credits: number;
  /** The floor itself, so a line that hit it can say so. */
  minimumCredits: number;
}

export interface SurveyQuote {
  /** The whole job: every line added together. */
  credits: number;
  surfaceAreaKm2: number;
  surfaceAreaHa: number;
  halfDeg: number;
  latitude: number;
  categories: SurveyCategory[];
  lines: SurveyQuoteLine[];
}

const CATEGORY_IDS: readonly string[] = ["water", "minerals", "soil", "hazard"];

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Read the platform's quote.
 *
 * Defensive on purpose: the quote is a JSON document the database owns, and a renamed
 * key must cost the reader one missing line rather than a survey they cannot launch.
 * A quote with no usable total is refused outright -- showing "0 credits" for a survey
 * that costs eighteen would be worse than showing nothing.
 */
export function parseQuote(raw: unknown): SurveyQuote | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Record<string, unknown>;

  const credits = num(doc.credits);
  const surfaceAreaKm2 = num(doc.surface_area_km2);
  if (!Number.isFinite(credits) || credits <= 0) return null;
  if (!Number.isFinite(surfaceAreaKm2) || surfaceAreaKm2 <= 0) return null;

  const categories = Array.isArray(doc.categories)
    ? (doc.categories.map(String).filter((id) => CATEGORY_IDS.includes(id)) as SurveyCategory[])
    : [];

  const lines = Array.isArray(doc.lines)
    ? doc.lines
        .map((entry): SurveyQuoteLine | null => {
          if (!entry || typeof entry !== "object") return null;
          const line = entry as Record<string, unknown>;
          const category = String(line.category ?? "");
          if (!CATEGORY_IDS.includes(category)) return null;
          return {
            category: category as SurveyCategory,
            label: String(line.label ?? category),
            baseCredits: num(line.base_credits),
            areaCredits: num(line.area_credits),
            credits: num(line.credits),
            minimumCredits: num(line.minimum_credits),
          };
        })
        .filter((line): line is SurveyQuoteLine => line !== null)
    : [];

  return {
    credits,
    surfaceAreaKm2,
    surfaceAreaHa: num(doc.surface_area_ha) || surfaceAreaKm2 * 100,
    halfDeg: num(doc.half_deg),
    latitude: num(doc.latitude),
    categories,
    lines,
  };
}

/** The ground a survey covers, in the units a reader thinks in. */
export function areaText(quote: SurveyQuote | null): string {
  if (!quote) return "—";
  const km2 = quote.surfaceAreaKm2;
  if (km2 >= 100) {
    return `${Math.round(km2).toLocaleString()} km² (${Math.round(quote.surfaceAreaHa).toLocaleString()} ha)`;
  }
  return `${km2.toLocaleString(undefined, { maximumFractionDigits: 1 })} km² (${Math.round(quote.surfaceAreaHa).toLocaleString()} ha)`;
}

/** A credit count, pluralised the way a person would say it. */
export function creditText(credits: number | null | undefined): string {
  if (typeof credits !== "number" || !Number.isFinite(credits)) return "—";
  return `${credits.toLocaleString()} credit${credits === 1 ? "" : "s"}`;
}

/**
 * Whether the workspace can pay for this job.
 *
 * A balance the platform has not reported is not a balance of zero: refusing the launch
 * on an unknown balance would stop a survey that could have run.
 */
export function canAfford(quote: SurveyQuote | null, balance: number | null): boolean {
  if (!quote) return true;
  if (typeof balance !== "number" || !Number.isFinite(balance)) return true;
  return balance >= quote.credits;
}
