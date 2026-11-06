import type { SurveyCategory } from "../repositories/satelliteSurveys.ts";

/** What the survey form offers, and the names the platform stores the answers under.
 *
 * `id` is the queue argument and the `survey_runs.categories` value; `dossier` is the key
 * the worker writes into `survey_targets.category` and the engine uses inside its result
 * blob. Two spellings for one thing is the engine's, not ours, so the pair lives here and
 * nowhere else.
 */
export const SURVEY_CATEGORY_OPTIONS: {
  id: SurveyCategory;
  dossier: DossierCategory;
}[] = [
  { id: "water", dossier: "water" },
  { id: "minerals", dossier: "minerals" },
  { id: "soil", dossier: "soil_land" },
  { id: "hazard", dossier: "hazard_safety" },
];

export type DossierCategory = "water" | "minerals" | "soil_land" | "hazard_safety";

export const CATEGORY_LABELS: Record<
  DossierCategory,
  { name: string; short: string; noun: string }
> = {
  water: { name: "Groundwater", short: "Water", noun: "borehole targets" },
  minerals: { name: "Mineral prospectivity", short: "Minerals", noun: "exploration targets" },
  soil_land: { name: "Soil & land capability", short: "Soil", noun: "land zones" },
  hazard_safety: { name: "Hazard & site safety", short: "Hazard", noun: "safe build sites" },
};

/**
 * Study area choices, in degrees each way from the target, with the ground distance each
 * one implies and what that size of area is typically surveyed for.
 *
 * These are the engine's own bands, kept because the worker's runtime scales with them:
 * a district is the same six coverages read across more pixels, so the label warns about
 * the wait rather than pretending every extent costs the same.
 */
export const AOI_CHOICES = [
  { value: 0.045, label: "≈ 5 km · single plot" },
  { value: 0.12, label: "≈ 13 km · farm or claim" },
  { value: 0.23, label: "≈ 25 km · district" },
  { value: 0.45, label: "≈ 50 km · regional (slow)" },
];

/**
 * The two files each category publishes, keyed as the worker keys them.
 *
 * The engine's export panel offered a row per domain, and the row was only live when that
 * category's files existed. Same here, but spelled against `SURVEY_DELIVERABLES` in
 * `apps/engine/worker.py`: a category the survey skipped simply has no file to open,
 * which is a truer answer than a link that 404s.
 */
export const CATEGORY_EXPORTS: Record<
  DossierCategory,
  { map: string; kmz: string; geojson: string }
> = {
  water: { map: "groundwater_map", kmz: "boreholes_kmz", geojson: "boreholes_geojson" },
  minerals: { map: "minerals_map", kmz: "minerals_kmz", geojson: "minerals_geojson" },
  soil_land: { map: "soil_map", kmz: "soil_kmz", geojson: "soil_geojson" },
  hazard_safety: { map: "hazard_map", kmz: "safest_sites_kmz", geojson: "safest_sites_geojson" },
};

/**
 * The geographic envelope the survey worker can actually read.
 *
 * The coverages sit on Digital Earth Africa's catchment, so a point outside this box has
 * nothing to score rather than a score of zero. Checking it here turns a minute of
 * downloads and a refused job into a message about the coordinate that was typed.
 */
export const COVERAGE = { lonMin: -30, lonMax: 66, latMin: -56, latMax: 41 };

export function outsideCoverage(latitude: number, longitude: number): boolean {
  return !(
    latitude >= COVERAGE.latMin &&
    latitude <= COVERAGE.latMax &&
    longitude >= COVERAGE.lonMin &&
    longitude <= COVERAGE.lonMax
  );
}

/** The live warning under the coordinate fields, worded as the engine's own page words it.
 *  A reader needs the reason the point is refused, not just the fact. */
export const COVERAGE_LEAD = "Outside satellite coverage. ";
export const COVERAGE_NOTE =
  "Digital Earth Africa serves roughly 30°W–66°E and 56°S–41°N. A survey here would screen " +
  "empty rasters, so it cannot run.";

export function coverageNoteFor(latitude: number, longitude: number): string {
  return outsideCoverage(latitude, longitude) ? COVERAGE_LEAD + COVERAGE_NOTE : "";
}

export function scoreText(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "—";
}

export function distanceText(km: number | null | undefined): string {
  return typeof km === "number" && Number.isFinite(km) ? `${km.toFixed(2)} km` : "—";
}

export function coordText(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(5) : "—";
}

export function parseCoordinate(text: string): number | null {
  const trimmed = text.trim();
  // Number("") is 0, which would send every blank field to the Gulf of Guinea.
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}


export function toDossierCategory(cat: SurveyCategory): DossierCategory {
  switch (cat) {
    case "water":
      return "water";
    case "minerals":
      return "minerals";
    case "soil":
      return "soil_land";
    case "hazard":
      return "hazard_safety";
    default:
      return "water";
  }
}

export function fromDossierCategory(dossier: DossierCategory): SurveyCategory {
  switch (dossier) {
    case "water":
      return "water";
    case "minerals":
      return "minerals";
    case "soil_land":
      return "soil";
    case "hazard_safety":
      return "hazard";
    default:
      return "water";
  }
}

export function getJobCategory(job: { job_type?: string | null; description?: string | null } | null | undefined): SurveyCategory {
  if (!job) return "water";
  if (job.description) {
    try {
      const parsed = JSON.parse(job.description);
      if (parsed?.category && ["water", "minerals", "soil", "hazard"].includes(parsed.category)) {
        return parsed.category as SurveyCategory;
      }
    } catch {
      if (["water", "minerals", "soil", "hazard"].includes(job.description)) {
        return job.description as SurveyCategory;
      }
    }
  }
  const typeStr = (job.job_type ?? "").toLowerCase();
  if (typeStr.includes("mineral") || typeStr.includes("gold")) return "minerals";
  if (typeStr.includes("soil") || typeStr.includes("land")) return "soil";
  if (typeStr.includes("hazard") || typeStr.includes("safety")) return "hazard";
  return "water";
}
