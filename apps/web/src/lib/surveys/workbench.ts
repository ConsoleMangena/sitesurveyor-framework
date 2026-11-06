import type { SurveyRun, SurveyTarget } from "../repositories/satelliteSurveys.ts";
import type { DossierCategory } from "./labels.ts";

/**
 * The rules the survey workbench draws with: what an AOI rectangle is, which colour a
 * category is, how a score becomes a band, and how a coordinate becomes text.
 *
 * Everything here is arithmetic on values the platform already stores, so the workbench
 * can be tested without a map, a database or a browser. The engine's sandbox page did the
 * same job against its own HTTP API; these are those rules, kept.
 */

/** The engine's domain hues. They are identity, not decoration: a water marker and the
 *  water indicator card must be the same blue or the map stops being readable. */
export const CATEGORY_COLORS: Record<DossierCategory, string> = {
  water: "#38bdf8",
  minerals: "#f59e0b",
  soil_land: "#10b981",
  hazard_safety: "#f43f5e",
};

/** Rank letter in the marker, and the short name the table and popups call it. */
export const CATEGORY_MARKS: Record<
  DossierCategory,
  { letter: string; kind: string; legend: string }
> = {
  water: { letter: "B", kind: "Borehole", legend: "Borehole target" },
  minerals: { letter: "M", kind: "Mineral", legend: "Mineral target" },
  soil_land: { letter: "S", kind: "Land zone", legend: "Land zone" },
  hazard_safety: { letter: "H", kind: "Safe site", legend: "Safe building site" },
};

/** Table and map order, and the order the engine's dossier presents categories in. */
export const DOSSIER_ORDER: DossierCategory[] = [
  "water",
  "minerals",
  "soil_land",
  "hazard_safety",
];

/** The map shows the best-ranked few per category; more than that and the AOI becomes
 *  unreadable, and the table already lists every one. */
export const MAP_CANDIDATES_PER_CATEGORY = 4;

export type LatLngTuple = [number, number];

/**
 * The study area as Leaflet wants it: the two opposite corners of the box.
 *
 * The engine derives its bbox the same way — `[lon - half, lat - half, lon + half,
 * lat + half]` — so the rectangle drawn here is the area that was actually scored, not an
 * approximation of it. Degrees are not metres, which is why the form labels each extent
 * with the distance it implies near the equator rather than claiming one size.
 */
export function aoiBounds(
  latitude: number,
  longitude: number,
  halfDeg: number,
): [LatLngTuple, LatLngTuple] {
  return [
    [latitude - halfDeg, longitude - halfDeg],
    [latitude + halfDeg, longitude + halfDeg],
  ];
}

export type Band = "high" | "mid" | "low";

export const BAND_LABELS: Record<Band, string> = {
  high: "High",
  mid: "Moderate",
  low: "Low",
};

/** The legend's own words, so the band a reader sees on a card is the band on the map. */
export const BAND_RANGES: { band: Band; text: string }[] = [
  { band: "low", text: "0–49 Low" },
  { band: "mid", text: "50–74 Mid" },
  { band: "high", text: "75–100 High" },
];

export function bandFor(score: number | null | undefined): Band | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (score >= 75) return "high";
  if (score >= 50) return "mid";
  return "low";
}

/** A candidate as the map and the attribute table need it, in one shape. */
export interface MapCandidate {
  key: string;
  category: DossierCategory;
  letter: string;
  kind: string;
  color: string;
  rank: number;
  latitude: number;
  longitude: number;
  score: number | null;
  distanceKm: number | null;
  readout: string | null;
}

function isDossierCategory(value: string): value is DossierCategory {
  return (DOSSIER_ORDER as string[]).includes(value);
}

/**
 * Rank the targets for display: best-ranked first inside each category, categories in
 * dossier order, and the map's share of each category capped.
 *
 * `survey_targets` already arrives ordered by category and rank, so this is a grouping
 * and a slice rather than a sort — but it filters unknown categories, because a key the
 * engine adds later must not render as an unlabelled marker in someone's colour.
 */
export function mapCandidates(
  targets: SurveyTarget[],
  perCategory = MAP_CANDIDATES_PER_CATEGORY,
  allowedCategories?: DossierCategory[],
): MapCandidate[] {
  const rows: MapCandidate[] = [];
  const categoriesToScan = allowedCategories ?? DOSSIER_ORDER;
  for (const category of categoriesToScan) {
    const mark = CATEGORY_MARKS[category];
    for (const target of targets) {
      if (!isDossierCategory(target.category) || target.category !== category) continue;
      if (rows.some((row) => row.key === target.id)) continue;
      if (categoryCount(rows, category) >= perCategory) break;
      rows.push({
        key: target.id,
        category,
        letter: mark.letter,
        kind: mark.kind,
        color: CATEGORY_COLORS[category],
        rank: target.rank,
        latitude: target.latitude,
        longitude: target.longitude,
        score: target.score,
        distanceKm: target.distanceKm,
        readout: target.readout,
      });
    }
  }
  return rows;
}

function categoryCount(rows: MapCandidate[], category: DossierCategory): number {
  let count = 0;
  for (const row of rows) if (row.category === category) count += 1;
  return count;
}

/** All targets, grouped for the attribute table. */
export function candidateRows(
  targets: SurveyTarget[],
  allowedCategories?: DossierCategory[],
): MapCandidate[] {
  return mapCandidates(targets, Number.POSITIVE_INFINITY, allowedCategories);
}

/**
 * Coordinate as the workbench prints it: value with the hemisphere, not a signed number.
 *
 * A signed latitude is a computation; `19.5049°S` is something a person can say to a
 * driller on the phone, which is what these numbers are for.
 */
export function coordWithHemisphere(value: number, axis: "lat" | "lon"): string {
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value).toFixed(4);
  if (axis === "lat") return `${magnitude}°${value < 0 ? "S" : "N"}`;
  return `${magnitude}°${value < 0 ? "W" : "E"}`;
}

export function dmsText(latitude: number, longitude: number): string {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "—";
  return `${coordWithHemisphere(latitude, "lat")}, ${coordWithHemisphere(longitude, "lon")}`;
}

export interface Basemap {
  id: "satellite" | "street";
  label: string;
  url: string;
  attribution: string;
  maxZoom: number;
  /** The swatch the Contents panel shows beside the name. */
  swatch: string;
}

export const BASEMAPS: Basemap[] = [
  {
    id: "satellite",
    label: "Satellite imagery",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery © Esri, Earthstar Geographics",
    maxZoom: 18,
    swatch: "linear-gradient(135deg,#1f4735,#2f6b4f)",
  },
  {
    id: "street",
    label: "Street map",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
    swatch: "linear-gradient(135deg,#2c3b52,#4a5c76)",
  },
];

export function basemapById(id: string): Basemap {
  return BASEMAPS.find((base) => base.id === id) ?? BASEMAPS[0];
}

/** Ground resolution at the equator for zoom 0, in metres per pixel. */
const EQUATOR_MPP = 156543.03392;

export function metersPerPixel(latitude: number, zoom: number): number {
  if (!Number.isFinite(latitude) || !Number.isFinite(zoom)) return Number.NaN;
  return (EQUATOR_MPP * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

export function scaleText(mpp: number): string {
  if (!Number.isFinite(mpp)) return "—";
  return mpp >= 1000 ? `${(mpp / 1000).toFixed(1)} km/px` : `${mpp.toFixed(1)} m/px`;
}

/** How long a survey has been running, the way the stage line says it. */
export function elapsedText(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/** One decimal, and never a number that would imply precision the engine does not have. */
export function scoreValueText(score: number | null): string {
  return score === null || !Number.isFinite(score) ? "—" : score.toFixed(1);
}

/** Meter fill: an unscored category must not read as a very small score. */
export function meterWidth(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return "0%";
  return `${Math.max(3, Math.min(100, score))}%`;
}

/**
 * The one line in the status strip that says what the workbench is doing.
 *
 * The page cannot see the worker process, only the row it writes, so every word here is
 * read off `survey_runs.status` and the stage the worker published — which is what keeps
 * it from reporting a survey as finished when the database has not been told so.
 */
export function jobText(run: SurveyRun | null, queueing: boolean): string {
  if (queueing) return "Submitting survey";
  if (!run) return "Idle";
  switch (run.status) {
    case "queued":
      return "Queued · waiting for a worker";
    case "acquiring":
    case "surveying":
    case "publishing":
      return `${run.stage ?? "Working"} · ${Math.round(run.progress)}%`;
    case "succeeded":
      return "Survey complete";
    case "failed":
      return "Survey failed";
    case "cancelled":
      return "Survey cancelled";
    default:
      return "Idle";
  }
}

/** What the engine says the score means, in the strip's own short form. */
export function basisText(scoreBasis: string | null): string {
  if (!scoreBasis) return "Nothing scored yet";
  if (scoreBasis === "relative_to_aoi_percentile") {
    return "Relative percentile scores · screening only";
  }
  return scoreBasis.replaceAll("_", " ");
}

/** The grid the engine scored, which only a published result can name. */
export function gridText(cellM: number | null | undefined): string {
  return cellM === null || cellM === undefined || !Number.isFinite(cellM)
    ? "—"
    : `${Math.round(cellM)} m · MCDA`;
}
