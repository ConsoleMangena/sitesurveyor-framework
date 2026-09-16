/**
 * CAD drafting settings.
 *
 * These are user-/workstation-level preferences for the drawing session
 * (display precision, direction convention, snap behaviour, grid). They are
 * deliberately separate from the drawing `CadModelState` (geometry + layers),
 * which is team-shared, and persisted per-project in localStorage so each
 * surveyor keeps their own drafting preferences.
 */

import type { BearingFormat, AngleEntryMode } from "./survey/format.ts";

/**
 * Axis-label convention for coordinate readouts.
 *
 * - `"yx"` — Zimbabwe / South-African Gauss Conform (Lo.) survey convention.
 *   This is a *south-oriented* transverse-Mercator system: the **Y** axis is the
 *   East-West axis (Easting/westing, positive west of the belt's central
 *   meridian) and the **X** axis is the North-South axis (Southing — X grows
 *   towards the south). Coordinates are read and written **Y first, then X**.
 *   This is the SiteSurveyor default.
 * - `"xy"` — the mathematical / UTM / international convention used elsewhere:
 *   the **X** axis is Easting and the **Y** axis is Northing (Y grows north),
 *   with the readout listing **X first, then Y**.
 *
 * Note the two systems swap which letter names the East-West axis, which is why
 * mislabelling is dangerous: a Gauss "Y" value is a UTM "X" (Easting) value.
 *
 * This is a display-only preference. The underlying geometry always stores
 * Easting (`e`) and Northing (`n`) explicitly, so switching conventions only
 * relabels the readouts and never moves any points.
 */
export type AxisConvention = "yx" | "xy";

export interface CadSettings {
  /** Direction display convention (azimuth / quadrant / gon). */
  bearingFormat: BearingFormat;
  /**
   * Axis-label convention for coordinate readouts. Defaults to `"yx"`
   * (Zimbabwe). Surveyors in other countries can switch to `"xy"`.
   */
  axisConvention: AxisConvention;
  /** Angle entry convention used by COGO input fields. */
  angleEntry: AngleEntryMode;
  /** Decimal places used for coordinate / distance readouts. */
  coordDecimals: number;
  /** Snap to grid on/off. */
  snap: boolean;
  /**
   * Snap spacing in survey units. When `snapAuto` is true the spacing tracks
   * the on-screen grid (zoom-dependent); otherwise this fixed value is used.
   */
  snapSpacing: number;
  /** Use the automatic (zoom-dependent) snap spacing instead of `snapSpacing`. */
  snapAuto: boolean;
  /** Object snap (endpoint / midpoint / node) on/off. */
  osnap: boolean;
  /** Ortho (constrain to H/V) on/off. */
  ortho: boolean;
  /** Show the background grid. */
  showGrid: boolean;
  /** Show point-number / code labels next to survey points. */
  showPointLabels: boolean;
  /** Show spot elevations (RL) next to survey points (below the point number). */
  showPointElevations: boolean;
  /** Show bearing/distance labels along linework segments. */
  showSegmentLabels: boolean;
  /** Default drawing scale denominator (e.g. 500 → 1:500), for the scale box. */
  scaleDenominator: number;
  /** Show the true-3D orbit view instead of the 2D top-down plan view. */
  view3d: boolean;
  /** Elevation (Z/RL) exaggeration factor used by the 3D view (1 = true scale). */
  zScale: number;
}

export const DEFAULT_SETTINGS: CadSettings = {
  bearingFormat: "azimuth",
  axisConvention: "yx",
  angleEntry: "packed",
  coordDecimals: 3,
  snap: false,
  snapSpacing: 1,
  snapAuto: true,
  osnap: true,
  ortho: false,
  showGrid: true,
  showPointLabels: true,
  showPointElevations: false,
  showSegmentLabels: false,
  scaleDenominator: 500,
  view3d: false,
  zScale: 1,
};

/**
 * Resolve the display labels for the Easting and Northing axes for a given
 * convention, plus the order they should be read out in.
 *
 * In the `"yx"` (Zimbabwe / RSA Gauss Conform) convention Easting is labelled "Y"
 * and shown first; in the `"xy"` (UTM / international) convention Easting is
 * labelled "X" and shown first. Northing is always the other of the pair.
 * Callers should render `first` before `second`.
 */
export function axisLabels(convention: AxisConvention): {
  easting: string;
  northing: string;
  /** The two labels in reading order (Easting first). */
  first: string;
  second: string;
} {
  if (convention === "xy") {
    return { easting: "X", northing: "Y", first: "X", second: "Y" };
  }
  return { easting: "Y", northing: "X", first: "Y", second: "X" };
}

/**
 * Cardinal direction labels independent of the projection convention.
 */
export function axisDirections(): { easting: string; northing: string } {
  return { easting: "E", northing: "N" };
}

/**
 * Rich axis labels for UI badges: combines the projection axis letter with its
 * cardinal direction, e.g. `"Y (E)"` in the yx/Gauss convention.
 */
export function axisBadgeLabels(convention: AxisConvention): {
  easting: string;
  northing: string;
  first: string;
  second: string;
} {
  const ax = axisLabels(convention);
  return {
    easting: `${ax.easting} (E)`,
    northing: `${ax.northing} (N)`,
    first: `${ax.first} (E)`,
    second: `${ax.second} (N)`,
  };
}

/** Reasonable bounds so the UI and persistence can clamp user input. */
export const COORD_DECIMALS_MIN = 0;
export const COORD_DECIMALS_MAX = 6;
export const SNAP_SPACING_MIN = 1e-4;

export function settingsStorageKey(projectId: string): string {
  return `sitesurveyorCadSettings:${projectId}`;
}

/** Merge a partial (possibly stale) stored object onto the defaults. */
export function normalizeSettings(parsed: Partial<CadSettings> | null | undefined): CadSettings {
  const base = DEFAULT_SETTINGS;
  if (!parsed || typeof parsed !== "object") return { ...base };
  const clampDecimals = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(COORD_DECIMALS_MAX, Math.max(COORD_DECIMALS_MIN, Math.round(v)))
      : base.coordDecimals;
  const clampSpacing = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.max(SNAP_SPACING_MIN, v) : base.snapSpacing;
  const clampScale = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : base.scaleDenominator;
  const clampZScale = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(50, Math.max(0.1, v)) : base.zScale;
  const validAxis = (v: unknown): AxisConvention =>
    v === "yx" || v === "xy" ? v : base.axisConvention;
  return {
    bearingFormat: parsed.bearingFormat ?? base.bearingFormat,
    axisConvention: validAxis(parsed.axisConvention),
    angleEntry: parsed.angleEntry ?? base.angleEntry,
    coordDecimals: clampDecimals(parsed.coordDecimals),
    snap: parsed.snap ?? base.snap,
    snapSpacing: clampSpacing(parsed.snapSpacing),
    snapAuto: parsed.snapAuto ?? base.snapAuto,
    osnap: parsed.osnap ?? base.osnap,
    ortho: parsed.ortho ?? base.ortho,
    showGrid: parsed.showGrid ?? base.showGrid,
    showPointLabels: parsed.showPointLabels ?? base.showPointLabels,
    showPointElevations: parsed.showPointElevations ?? base.showPointElevations,
    showSegmentLabels: parsed.showSegmentLabels ?? base.showSegmentLabels,
    scaleDenominator: clampScale(parsed.scaleDenominator),
    view3d: parsed.view3d ?? base.view3d,
    zScale: clampZScale(parsed.zScale),
  };
}
