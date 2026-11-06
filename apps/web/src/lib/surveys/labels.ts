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

/** AOI half-width choices, in degrees, with the km each implies. */
export const AOI_CHOICES = [
  { value: 0.05, label: "±5.5 km" },
  { value: 0.12, label: "±13.3 km (default)" },
  { value: 0.2, label: "±22 km" },
  { value: 0.35, label: "±39 km" },
];

/** The deliverable kinds the worker publishes, keyed as `survey_deliverables.kind`. */
export const DELIVERABLE_LABELS: Record<string, string> = {
  master_json_dossier: "Executive dossier (JSON)",
  boreholes_kmz: "Borehole targets (KMZ)",
  minerals_kmz: "Exploration targets (KMZ)",
  soil_kmz: "Land zones (KMZ)",
  safest_sites_kmz: "Safe build sites (KMZ)",
  groundwater_map: "Groundwater potential map",
  minerals_map: "Mineral prospectivity map",
  soil_map: "Soil capability map",
  hazard_map: "Hazard risk map",
};

export function deliverableGroup(
  key: string,
): "Dossier" | "Maps" | "Field navigation" | "Reports & viewers" {
  if (key.startsWith("master_json")) return "Dossier";
  if (key.endsWith("_kmz")) return "Field navigation";
  if (key.endsWith("_map")) return "Maps";
  return "Reports & viewers";
}

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
