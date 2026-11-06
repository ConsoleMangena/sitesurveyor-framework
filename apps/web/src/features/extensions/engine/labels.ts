import type {
  IntelligenceCategory,
  SurveyCategory,
  SurveyScoreKey,
} from "./client.ts";

/** Dossier category keys, which is what a survey result names its sections. */
export const CATEGORY_LABELS: Record<IntelligenceCategory, { name: string; short: string; noun: string }> = {
  water: { name: "Groundwater", short: "Water", noun: "borehole targets" },
  minerals: { name: "Mineral prospectivity", short: "Minerals", noun: "exploration targets" },
  soil_land: { name: "Soil & land capability", short: "Soil", noun: "land zones" },
  hazard_safety: { name: "Hazard & site safety", short: "Hazard", noun: "safe build sites" },
};

/** What the survey form offers, mapped to the engine's category arguments. */
export const SURVEY_CATEGORIES: {
  id: Exclude<SurveyCategory, "all" | "none">;
  category: IntelligenceCategory;
  scoreKey: SurveyScoreKey;
}[] = [
  { id: "water", category: "water", scoreKey: "groundwater" },
  { id: "minerals", category: "minerals", scoreKey: "minerals" },
  { id: "soil", category: "soil_land", scoreKey: "soil_land" },
  { id: "hazard", category: "hazard_safety", scoreKey: "hazard_safety" },
];

/** AOI half-width choices, in the engine's degrees, with the km each implies. */
export const AOI_CHOICES = [
  { value: 0.05, label: "±5.5 km" },
  { value: 0.12, label: "±13.3 km (default)" },
  { value: 0.2, label: "±22 km" },
  { value: 0.35, label: "±39 km" },
];

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
  groundwater_report: "Groundwater client report",
  minerals_report: "Minerals client report",
  soil_report: "Soil & land client report",
  hazard_report: "Hazard client report",
  groundwater_raster_viewer: "Groundwater raster viewer",
  minerals_raster_viewer: "Minerals raster viewer",
  soil_raster_viewer: "Soil raster viewer",
  hazard_raster_viewer: "Hazard raster viewer",
};

export function deliverableGroup(key: string): "Dossier" | "Maps" | "Field navigation" | "Reports & viewers" {
  if (key.startsWith("master_json")) return "Dossier";
  if (key.endsWith("_kmz")) return "Field navigation";
  if (key.endsWith("_map")) return "Maps";
  return "Reports & viewers";
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
  // Number("") is 0, which would silently send a survey to the Gulf of Guinea
  // every time a field was left blank.
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}
