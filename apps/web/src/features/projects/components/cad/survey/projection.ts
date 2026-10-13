/**
 * Map projection — exact Transverse Mercator (Karney series) and the
 * Zimbabwe / Southern-African Gauss Conform (Lo.) system.
 *
 * WHY A HAND-ROLLED PROJECTION (NOT proj4 / PROJ)
 * ------------------------------------------------
 * For *engineering* survey we need deterministic, unit-testable, sub-millimetre
 * projection math. proj4 is a GIS library: its WGS84 ↔ Cape/Arc1950 datum block
 * shifts are only metre-accurate and depend on NTv2 grids that do not exist
 * publicly for Zimbabwe. So we keep the projection math here (exact, closed
 * form) and treat datum shifts and local control fitting as separate, explicit
 * steps (see datum.ts and cogo.ts `calibrate`/`affineParameters`).
 *
 * KARNEY TRANSVERSE MERCATOR
 * --------------------------
 * Forward/inverse use the Krüger n-series as refined by C.F.F. Karney
 * ("Transverse Mercator with an accuracy of a few nanometers", J. Geodesy,
 * 2011). Accurate to nanometre level within a few degrees of the central
 * meridian — far beyond any survey tolerance.
 *
 * GAUSS CONFORM ("Lo.") CONVENTION  (Zimbabwe, South Africa, Namibia, …)
 * ----------------------------------------------------------------------
 * Southern-African surveyors use a SOUTH-oriented Transverse Mercator:
 *   - Y is positive WEST of the central meridian.
 *   - X is positive SOUTH of the equator.
 *   - There is NO false easting/northing: at the origin Y = 0, X = 0.
 *   - Belts ("Lo.") are 2° wide, centred on ODD meridians: 25,27,29,31,33 °E.
 *   - Scale factor on the central meridian is 1 (no UTM 0.9996 reduction).
 * This is the opposite handedness to UTM (which is +East/+North with a 500 km
 * false easting and k0 = 0.9996). We expose BOTH so a project can pick its
 * convention without changing the cogo engine.
 */

import { RAD, DEG } from "./cogo.ts";

// ── Ellipsoids ──────────────────────────────────────────────────────────────

export interface Ellipsoid {
  name: string;
  /** Semi-major axis (m). */
  a: number;
  /** Inverse flattening 1/f. */
  invF: number;
}

/** WGS84 — also a practical stand-in for Hartebeesthoek94 (geocentric, GNSS). */
export const WGS84: Ellipsoid = { name: "WGS84", a: 6378137.0, invF: 298.257223563 };

/** GRS80 — Hartebeesthoek94 / ITRF realisations. Differs from WGS84 sub-mm. */
export const GRS80: Ellipsoid = { name: "GRS80", a: 6378137.0, invF: 298.257222101 };

/**
 * Clarke 1880 (modified) — the ellipsoid of the Cape Datum / Arc 1950 used for
 * legacy Zimbabwean trig and title-deed coordinates.
 */
export const CLARKE1880: Ellipsoid = { name: "Clarke 1880 (Arc)", a: 6378249.145, invF: 293.465 };

/** Derived ellipsoid constants used by the TM series. */
interface EllipsoidConstants {
  a: number;
  f: number;
  e2: number; // first eccentricity squared
  n: number; // third flattening
}

function constants(ell: Ellipsoid): EllipsoidConstants {
  const f = 1 / ell.invF;
  const e2 = f * (2 - f);
  const n = f / (2 - f);
  return { a: ell.a, f, e2, n };
}

// ── Coordinate-system convention ─────────────────────────────────────────────

export type ProjectionConvention = "lo" | "utm";

export interface ProjectionDef {
  /** Internal id, e.g. "Lo27" or "UTM36S". */
  id: string;
  /** Human label. */
  label: string;
  convention: ProjectionConvention;
  ellipsoid: Ellipsoid;
  /** Central meridian (degrees east). */
  centralMeridianDeg: number;
  /** Scale factor on the central meridian (Lo. = 1, UTM = 0.9996). */
  k0: number;
  /** False easting (m). Lo. = 0, UTM = 500000. */
  falseEasting: number;
  /** False northing (m). Lo. = 0, UTM south = 10000000. */
  falseNorthing: number;
  /**
   * Authoritative CRS identifier for PROJ-backed datum transforms on the
   * desktop build. Either an EPSG code ("EPSG:32736") or a full proj4 string.
   * Optional: when absent, only the in-app Karney projection is available for
   * this CRS (no datum shift).
   */
  crs?: string;
}

/**
 * Zimbabwe Lo. belt presets (Gauss Conform, Hart94/WGS84 ellipsoid).
 * Central meridians are the odd degrees covering the country.
 */
export const ZIMBABWE_LO_BELTS: ProjectionDef[] = [25, 27, 29, 31, 33].map((cm) => ({
  id: `Lo${cm}`,
  label: `Lo. ${cm}° (Zimbabwe Gauss Conform)`,
  convention: "lo" as const,
  ellipsoid: WGS84,
  centralMeridianDeg: cm,
  k0: 1,
  falseEasting: 0,
  falseNorthing: 0,
  // South-oriented (Y west, X south) Gauss Conform on the Hartebeesthoek94 /
  // WGS84 datum. Zimbabwe Lo. belts have no single EPSG code, so a proj4 string
  // expresses the exact definition for PROJ. `axis=wsu` gives the +West/+South
  // ordering; PROJ then returns (Y_west, X_south) which matches our NE struct.
  crs: `+proj=tmerc +lat_0=0 +lon_0=${cm} +k=1 +x_0=0 +y_0=0 +axis=wsu +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`,
}));

/** UTM 36S — the geocentric/GIS alternative covering eastern Zimbabwe. */
export const UTM_36S: ProjectionDef = {
  id: "UTM36S",
  label: "UTM Zone 36S (WGS84)",
  convention: "utm",
  ellipsoid: WGS84,
  centralMeridianDeg: 33,
  k0: 0.9996,
  falseEasting: 500000,
  falseNorthing: 10000000,
  crs: "EPSG:32736",
};

/** UTM 35S — covers central/western Zimbabwe. */
export const UTM_35S: ProjectionDef = {
  id: "UTM35S",
  label: "UTM Zone 35S (WGS84)",
  convention: "utm",
  ellipsoid: WGS84,
  centralMeridianDeg: 27,
  k0: 0.9996,
  falseEasting: 500000,
  falseNorthing: 10000000,
  crs: "EPSG:32735",
};

/** WGS84 geographic (lat/lon) — the GNSS/source CRS for datum transforms. */
export const WGS84_GEOGRAPHIC = "EPSG:4326";

/** All presets, for populating a selector. */
export const PROJECTION_PRESETS: ProjectionDef[] = [...ZIMBABWE_LO_BELTS, UTM_35S, UTM_36S];

/** Look up the closest Zimbabwe Lo. belt for a given longitude (deg east). */
export function nearestLoBelt(lonDeg: number): ProjectionDef {
  let best = ZIMBABWE_LO_BELTS[0];
  let bestDiff = Infinity;
  for (const belt of ZIMBABWE_LO_BELTS) {
    const d = Math.abs(belt.centralMeridianDeg - lonDeg);
    if (d < bestDiff) {
      bestDiff = d;
      best = belt;
    }
  }
  return best;
}

// ── Geodetic ↔ projected ─────────────────────────────────────────────────────

export interface LatLon {
  /** Latitude in degrees (south negative). */
  lat: number;
  /** Longitude in degrees (west negative). */
  lon: number;
}

/**
 * Projected coordinate in the *engineering* NE convention used throughout the
 * cogo engine (`n`, `e`), plus the point scale factor `k` and meridian
 * convergence (grid bearing − true bearing) in degrees.
 *
 * For the Lo. convention the adapter maps the south-oriented (Y-West, X-South)
 * values onto this NE struct so downstream cogo math is unchanged:
 *   - n  = X (positive south)
 *   - e  = Y (positive west)
 * For UTM, n = northing (+north), e = easting (+east).
 */
export interface Projected {
  n: number;
  e: number;
  /** Point scale factor at this location. */
  k: number;
  /** Grid convergence (degrees). */
  convergenceDeg: number;
}

/**
 * Karney TM forward: geodetic → TM easting/northing in a NORTH/EAST oriented
 * frame relative to the central meridian, before any false offsets or the Lo.
 * sign flip. Returns metres east (x) and north (y) of the projection origin.
 */
function tmForwardRaw(
  ell: EllipsoidConstants,
  k0: number,
  cmRad: number,
  latRad: number,
  lonRad: number,
): { x: number; y: number; k: number; gamma: number } {
  const { a, n } = ell;
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n3 * n;

  // Rectifying radius A (Karney eq. for the meridian arc unit).
  const A = (a / (1 + n)) * (1 + n2 / 4 + n4 / 64);

  // Krüger α coefficients (forward), to 4th order in n.
  const alpha = [
    n / 2 - (2 / 3) * n2 + (5 / 16) * n3 + (41 / 180) * n4,
    (13 / 48) * n2 - (3 / 5) * n3 + (557 / 1440) * n4,
    (61 / 240) * n3 - (103 / 140) * n4,
    (49561 / 161280) * n4,
  ];

  const e = Math.sqrt(ell.e2);
  const dLon = lonRad - cmRad;

  // Conformal latitude.
  const sinLat = Math.sin(latRad);
  const t = Math.sinh(atanh(sinLat) - e * atanh(e * sinLat));
  const xiPrime = Math.atan2(t, Math.cos(dLon));
  const etaPrime = asinh(Math.sin(dLon) / Math.hypot(t, Math.cos(dLon)));

  let xi = xiPrime;
  let eta = etaPrime;
  for (let j = 1; j <= 4; j++) {
    xi += alpha[j - 1] * Math.sin(2 * j * xiPrime) * Math.cosh(2 * j * etaPrime);
    eta += alpha[j - 1] * Math.cos(2 * j * xiPrime) * Math.sinh(2 * j * etaPrime);
  }

  const x = k0 * A * eta; // easting of CM
  const y = k0 * A * xi; // northing from equator

  // Point scale factor and convergence (Karney series).
  let pSum = 0;
  let qSum = 0;
  for (let j = 1; j <= 4; j++) {
    pSum += 2 * j * alpha[j - 1] * Math.cos(2 * j * xiPrime) * Math.cosh(2 * j * etaPrime);
    qSum += 2 * j * alpha[j - 1] * Math.sin(2 * j * xiPrime) * Math.sinh(2 * j * etaPrime);
  }
  const p = 1 + pSum;
  const q = qSum;

  // Point scale factor and grid convergence (Karney, exact for the series).
  // gamma' and k' relate the conformal sphere to the ellipsoid.
  const sin2 = sinLat * sinLat;
  const tau = Math.tan(latRad);
  const sigma = Math.sqrt(t * t + Math.cos(dLon) * Math.cos(dLon));

  const gammaPrime = Math.atan2(t * Math.tan(dLon), sigma);
  const gamma = Math.atan2(q, p) + gammaPrime;

  const kPrime =
    Math.sqrt(1 - ell.e2 * sin2) *
    Math.sqrt(1 + tau * tau) /
    sigma;
  const k = (k0 * A * Math.sqrt(p * p + q * q) * kPrime) / a;

  return { x, y, k, gamma };
}

/**
 * Karney TM inverse: TM easting/northing (CM-relative, north/east oriented,
 * after removing false offsets and k0) → geodetic.
 */
function tmInverseRaw(
  ell: EllipsoidConstants,
  k0: number,
  cmRad: number,
  x: number,
  y: number,
): LatLon {
  const { a, n } = ell;
  const n2 = n * n;
  const n3 = n2 * n;
  const n4 = n3 * n;
  const A = (a / (1 + n)) * (1 + n2 / 4 + n4 / 64);

  // Krüger β coefficients (inverse).
  const beta = [
    n / 2 - (2 / 3) * n2 + (37 / 96) * n3 - (1 / 360) * n4,
    (1 / 48) * n2 + (1 / 15) * n3 - (437 / 1440) * n4,
    (17 / 480) * n3 - (37 / 840) * n4,
    (4397 / 161280) * n4,
  ];
  // δ coefficients (rectifying → geodetic latitude).
  const delta = [
    2 * n - (2 / 3) * n2 - 2 * n3 + (116 / 45) * n4,
    (7 / 3) * n2 - (8 / 5) * n3 - (227 / 45) * n4,
    (56 / 15) * n3 - (136 / 35) * n4,
    (4279 / 630) * n4,
  ];

  const xi = y / (k0 * A);
  const eta = x / (k0 * A);

  let xiPrime = xi;
  let etaPrime = eta;
  for (let j = 1; j <= 4; j++) {
    xiPrime -= beta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    etaPrime -= beta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }

  const chi = Math.asin(Math.sin(xiPrime) / Math.cosh(etaPrime));
  let lat = chi;
  for (let j = 1; j <= 4; j++) {
    lat += delta[j - 1] * Math.sin(2 * j * chi);
  }

  const lon = cmRad + Math.atan2(Math.sinh(etaPrime), Math.cos(xiPrime));
  return { lat: lat * DEG, lon: lon * DEG };
}

/**
 * Project geodetic (lat/lon, degrees) onto the given projection, returning the
 * cogo NE coordinate plus scale factor and convergence.
 */
export function projectForward(p: ProjectionDef, ll: LatLon): Projected {
  const ell = constants(p.ellipsoid);
  const cmRad = p.centralMeridianDeg * RAD;
  const raw = tmForwardRaw(ell, p.k0, cmRad, ll.lat * RAD, ll.lon * RAD);

  if (p.convention === "lo") {
    // South-oriented: Y positive WEST, X positive SOUTH, no false offsets.
    // raw.x is metres east of CM → Y (west) = −x.  raw.y is metres north of
    // equator → X (south) = −y.
    return {
      e: -raw.x + p.falseEasting, // Y (positive west)
      n: -raw.y + p.falseNorthing, // X (positive south)
      k: raw.k,
      convergenceDeg: raw.gamma * DEG,
    };
  }
  // UTM / north-east oriented with false offsets.
  return {
    e: raw.x + p.falseEasting,
    n: raw.y + p.falseNorthing,
    k: raw.k,
    convergenceDeg: raw.gamma * DEG,
  };
}

/** Inverse: cogo NE coordinate → geodetic (lat/lon degrees). */
export function projectInverse(p: ProjectionDef, n: number, e: number): LatLon {
  const ell = constants(p.ellipsoid);
  const cmRad = p.centralMeridianDeg * RAD;
  let x: number;
  let y: number;
  if (p.convention === "lo") {
    x = -(e - p.falseEasting); // undo Y = −x
    y = -(n - p.falseNorthing); // undo X = −y
  } else {
    x = e - p.falseEasting;
    y = n - p.falseNorthing;
  }
  return tmInverseRaw(ell, p.k0, cmRad, x, y);
}

// ── Small hyperbolic helpers (older JS targets lack Math.asinh/atanh) ────────

function asinh(v: number): number {
  return Math.asinh ? Math.asinh(v) : Math.log(v + Math.sqrt(v * v + 1));
}
function atanh(v: number): number {
  return Math.atanh ? Math.atanh(v) : 0.5 * Math.log((1 + v) / (1 - v));
}
