/**
 * The coverages a survey can be run on, exactly as the engine declares them.
 *
 * The source of truth is `OPTICAL_PRODUCTS`, `DATA_SOURCES`, `COMPOSITE_WINDOWS` and
 * `FIXED_SOURCES` in [apps/engine/src/config.py](file:///C:/Users/BizIntel/Documents/sitesurveyor-framework/apps/engine/src/config.py).
 * The sandbox page used to fetch these over HTTP from the engine process itself; that
 * process no longer answers a port, so the registry is compiled in and the worker applies
 * whatever the form sends (`cfg.set_data_sources` / `cfg.set_composite`).
 *
 * Drift here is not harmless: an option the coverage does not answer for is a 404 in the
 * middle of a paid survey. So the year and window controls below are *derived* from the
 * product entries rather than typed out beside them, which is the same trick that keeps
 * the table honest in Python.
 */

import type { SurveyProvenance } from "../repositories/satelliteSurveys.ts";

export type WindowId = "annual" | "dry" | "wet";

export interface OpticalProduct {
  id: string;
  label: string;
  family: string;
  credit: string;
  years: [number, number];
  windows: WindowId[];
}

export const OPTICAL_PRODUCTS: OpticalProduct[] = [
  {
    id: "gm_s2_annual",
    label: "Sentinel-2 Annual GeoMAD (median composite)",
    family: "Sentinel-2",
    credit: "Copernicus Sentinel-2",
    years: [2019, 2025],
    windows: ["annual"],
  },
  {
    // Not a mosaic: the fetch pulls the clearest scenes in the window and medians them,
    // which is the only reason a season can be chosen at all.
    id: "s2_l2a",
    label: "Sentinel-2 L2A (clear-scene composite)",
    family: "Sentinel-2",
    credit: "Copernicus Sentinel-2",
    years: [2019, 2025],
    windows: ["annual", "dry", "wet"],
  },
  {
    id: "gm_ls8_ls9_annual",
    label: "Landsat 8-9 Annual GeoMAD (median composite)",
    family: "Landsat",
    credit: "USGS/NASA Landsat",
    years: [2021, 2025],
    windows: ["annual"],
  },
  {
    id: "gm_ls8_annual",
    label: "Landsat 8 Annual GeoMAD (median composite)",
    family: "Landsat",
    credit: "USGS/NASA Landsat",
    years: [2013, 2020],
    windows: ["annual"],
  },
  {
    id: "gm_ls5_ls7_annual",
    label: "Landsat 5-7 Annual GeoMAD (median composite)",
    family: "Landsat",
    credit: "USGS/NASA Landsat",
    years: [1984, 2012],
    windows: ["annual"],
  },
];

export const WINDOW_LABELS: Record<WindowId, string> = {
  annual: "Full year",
  dry: "Dry season",
  wet: "Wet season",
};

export const DEFAULT_OPTICAL = "gm_s2_annual";
export const DEFAULT_COMPOSITE: { year: number; window: WindowId } = {
  year: 2023,
  window: "annual",
};

export interface SourceField {
  id: "dem" | "landcover" | "optical";
  label: string;
  default: string;
  options: { value: string; label: string }[];
  /** Optical owns the composite controls, so it takes the full row. */
  wide?: boolean;
}

export const DATA_SOURCES: SourceField[] = [
  {
    id: "dem",
    label: "Elevation model",
    default: "dem_cop_30",
    options: [
      { value: "dem_cop_30", label: "Copernicus DEM 30 m" },
      { value: "dem_srtm", label: "SRTM 30 m" },
      { value: "nasadem", label: "NASA DEM 30 m" },
    ],
  },
  {
    id: "landcover",
    label: "Land cover map",
    default: "esa_worldcover_2021",
    options: [
      { value: "esa_worldcover_2021", label: "ESA WorldCover 2021" },
      { value: "esa_worldcover_2020", label: "ESA WorldCover 2020" },
    ],
  },
  {
    id: "optical",
    label: "Optical source",
    default: DEFAULT_OPTICAL,
    wide: true,
    options: OPTICAL_PRODUCTS.map((product) => ({
      value: product.id,
      label: product.label,
    })),
  },
];

/** Inputs a caller cannot choose — one coverage each, pinned in `fetch_data.fetch_all`. */
export const FIXED_SOURCES = [
  "ALOS PALSAR 2007 L-band mosaic",
  "Water Observations from Space, Landsat all-time summary",
  "CHIRPS monthly rainfall, 24-month mean",
  "Digital Earth Africa cropland extent",
  "Digital Earth Africa Landsat fractional-cover annual summary",
];

export function productById(id: string): OpticalProduct {
  return OPTICAL_PRODUCTS.find((product) => product.id === id) ?? OPTICAL_PRODUCTS[0];
}

export function yearOptions(id: string): number[] {
  const [first, last] = productById(id).years;
  const years: number[] = [];
  for (let year = first; year <= last; year += 1) years.push(year);
  return years;
}

export interface WindowOption {
  id: WindowId;
  label: string;
  available: boolean;
  /** Why a control is offered but dead, in the reader's terms rather than the model's. */
  reason?: string;
}

/**
 * Every window, with the ones this coverage does not publish switched off.
 *
 * A GeoMAD mosaic is one median per year, so asking it for a dry season is not a shorter
 * survey — it is a request for a product that does not exist. Listing the unavailable
 * options anyway is deliberate: a control that silently disappears looks like a feature
 * that was removed, and a disabled one with a sentence attached explains the coverage.
 */
export function windowOptions(id: string): WindowOption[] {
  const product = productById(id);
  return (Object.keys(WINDOW_LABELS) as WindowId[]).map((window) => ({
    id: window,
    label: WINDOW_LABELS[window],
    available: product.windows.includes(window),
    reason:
      product.windows.includes(window)
        ? undefined
        : `${product.family} ships no ${WINDOW_LABELS[window].toLowerCase()}; the full-year median is all it publishes.`,
  }));
}

/** What the map chip says the imagery was, e.g. `Sentinel-2 · Dry season 2022`. */
export function imageryChip(sources: Record<string, string>, composite: { year: number | string; window: string }): string {
  const product = productById(sources.optical ?? DEFAULT_OPTICAL);
  const window = product.windows.includes(composite.window as WindowId)
    ? (composite.window as WindowId)
    : "annual";
  const stamp = window === "annual" ? `${composite.year}` : `${WINDOW_LABELS[window]} ${composite.year}`;
  return `${product.family} · ${stamp}`;
}

/** The coverages a finished run names in its provenance, joined for the snapshot line.
 *
 * A result only ever carries what the worker proved fed the numbers, so an absent layer
 * reads as a dash rather than as the coverage the form happened to be showing — the two
 * differ whenever a cached raster predates a switch, and the snapshot is where that shows.
 */
export function inputsText(provenance: SurveyProvenance | null | undefined): string {
  const labels = ["dem", "landcover"]
    .map((layer) => provenance?.selectable[layer]?.label)
    .filter((label): label is string => Boolean(label));
  return labels.length ? labels.join(" · ") : "—";
}

/** One layer's provenance label, for the places that name a single coverage. */
export function coverageLabel(
  provenance: SurveyProvenance | null | undefined,
  layer: string,
): string | null {
  return provenance?.selectable[layer]?.label ?? null;
}
