import type {
  StartSurveyInput,
  SurveyCategory,
  SurveyResult,
  SurveyRun,
} from "../../../lib/repositories/satelliteSurveys.ts";
import {
  COVERAGE,
  outsideCoverage,
  parseCoordinate,
  type DossierCategory,
} from "../../../lib/surveys/labels.ts";
import {
  BAND_LABELS,
  bandFor,
  scoreValueText,
  type MapCandidate,
  type SheetSummaryRow,
} from "../../../lib/surveys/workbench.ts";
import type { SheetTable } from "../../../lib/surveys/mapExport.ts";

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

/** Status of the run behind the panel, in one line. Empty when a saved result stands on its own. */
export function resultsNote(run: SurveyRun | null, queued: string | null): string {
  if (!run) return "No survey has run in this workspace.";
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
  if (run.id === queued) return "";
  return `Saved result from ${stampOf(run)}.`;
}

function stampOf(run: SurveyRun): string {
  return new Date(run.completedAt ?? run.createdAt).toLocaleString();
}

function shortStamp(run: SurveyRun): string {
  return new Date(run.completedAt ?? run.createdAt).toLocaleDateString();
}

/** What each category's headline number is called on the sheet. */
const SCORE_LABELS: Record<DossierCategory, string> = {
  water: "SURVEY SCORE",
  minerals: "PROSPECTIVITY SCORE",
  soil_land: "LAND CAPABILITY",
  hazard_safety: "HAZARD SCORE",
};

/**
 * The figures a survey sheet states about itself.
 *
 * Each category measures something different, so each one says its own headline: water
 * its score and how many boreholes were picked, minerals the system that owns the
 * ground and how much of it, soil and hazard their score. The sheet is the only page
 * a reader takes away, so it has to carry the number the workbench shows.
 */
export function sheetSummaryRows(
  category: DossierCategory,
  result: SurveyResult | null,
  targets: MapCandidate[],
): SheetSummaryRow[] {
  if (!result) return [];
  const rows: SheetSummaryRow[] = [];

  const score = result.scores.find((entry) => entry.category === category);
  if (score && typeof score.score === "number" && Number.isFinite(score.score)) {
    const band = bandFor(score.score);
    rows.push({
      label: SCORE_LABELS[category],
      value: `${scoreValueText(score.score)} / 100 · ${
        score.klass ?? (band ? BAND_LABELS[band] : "Not run")
      }`,
    });
  }

  if (category === "water") {
    rows.push({ label: "BOREHOLE TARGETS", value: `${targets.length}` });
  }

  if (category === "minerals") {
    const commodities = result.commodities ?? [];
    const dominant = commodities.reduce<(typeof commodities)[number] | null>(
      (best, commodity) =>
        best === null || (commodity.mapSharePct ?? 0) > (best.mapSharePct ?? 0)
          ? commodity
          : best,
      null,
    );
    if (dominant) {
      const figures: string[] = [`${dominant.name} (${dominant.symbol})`];
      if (typeof dominant.mapAreaKm2 === "number" && Number.isFinite(dominant.mapAreaKm2)) {
        figures.push(`${dominant.mapAreaKm2.toFixed(1)} sq km`);
      }
      if (typeof dominant.mapSharePct === "number" && Number.isFinite(dominant.mapSharePct)) {
        figures.push(`${dominant.mapSharePct.toFixed(1)}% of area`);
      }
      rows.push({ label: "DOMINANT SYSTEM", value: figures.join(" · ") });
    }
    const indicated = commodities.filter((commodity) => commodity.indicated).length;
    rows.push({
      label: "SYSTEMS SCREENED",
      value: `${indicated} of ${commodities.length} indicated`,
    });
  }

  return rows;
}

/**
 * The one line a crew acts on, in the worker's own words.
 *
 * A drilling depth for water, a stripped-cover thickness for minerals and soil, the
 * hazard class as it stands: the engine words each one, and the sheet repeats them
 * rather than inventing a phrasing of its own.
 */
export function fieldTargetText(targets: MapCandidate[]): string {
  return targets[0]?.readout ?? "";
}

/**
 * The mineral systems the sheet's table prints.
 *
 * The legend says what each colour means; this says how much ground each system owns
 * and which of them the survey indicated, so a reader can act on the map without
 * measuring it. Indicated systems are marked with a bullet and printed in the strong
 * ink; the rest are the systems that were screened and did not carry the ground.
 */
export function sheetSystemTable(result: SurveyResult | null): SheetTable | null {
  const commodities = result?.commodities ?? [];
  if (commodities.length === 0) return null;

  const ordered = [
    ...commodities.filter((commodity) => commodity.indicated),
    ...commodities.filter((commodity) => !commodity.indicated),
  ];

  return {
    title: "System ground share · • indicated",
    columns: [
      { label: "SYSTEM", width: 104 },
      { label: "AREA sq km", width: 44, align: "right" },
      { label: "SHARE %", width: 40, align: "right" },
    ],
    rows: ordered.map((commodity) => [
      `${commodity.indicated ? "• " : ""}${commodity.name}`,
      numberText(commodity.mapAreaKm2, 1),
      numberText(commodity.mapSharePct, 1),
    ]),
    emphasis: ordered.map((commodity) => commodity.indicated),
  };
}

function numberText(value: number | null, digits: number): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "—";
}
