/**
 * COGO (Coordinate Geometry) — pure survey math helpers.
 *
 * Conventions (engineering survey):
 * - Coordinates are Y/Northing (`n`) / X/Easting (`e`) / Z/Elevation (`z`).
 * - Azimuth is measured clockwise from North, in DECIMAL DEGREES (0..360).
 * - Distances are horizontal (plan) distances in project units (m).
 *
 * All functions are pure and side-effect free so they can be unit tested.
 */

export interface NE {
  n: number;
  e: number;
}

export const TWO_PI = Math.PI * 2;
export const DEG = 180 / Math.PI;
export const RAD = Math.PI / 180;

/** Normalise an azimuth (degrees) into the range [0, 360). */
export function normalizeAzimuth(azDeg: number): number {
  let a = azDeg % 360;
  if (a < 0) a += 360;
  return a;
}

/**
 * Forward computation: given a start point, azimuth (deg) and horizontal
 * distance, return the destination X/Y coordinate.
 */
export function forward(start: NE, azimuthDeg: number, distance: number): NE {
  const az = normalizeAzimuth(azimuthDeg) * RAD;
  return {
    n: start.n + distance * Math.cos(az),
    e: start.e + distance * Math.sin(az),
  };
}

/**
 * Inverse computation: given two points, return the azimuth (deg, 0..360)
 * and horizontal distance from `from` to `to`.
 */
export function inverse(from: NE, to: NE): { azimuth: number; distance: number } {
  const dn = to.n - from.n;
  const de = to.e - from.e;
  const distance = Math.hypot(dn, de);
  let azimuth = Math.atan2(de, dn) * DEG;
  azimuth = normalizeAzimuth(azimuth);
  return { azimuth, distance };
}

// ===========================================================================
// Stake-out (setting-out) — the core construction-survey computation.
// ===========================================================================
//
// A surveyor occupies a known station, orients the instrument by sighting a
// known backsight (this fixes the horizontal-circle "zero"), then turns to a
// design/target point. The stake-out result tells them:
//   - the azimuth (grid bearing) to turn to,
//   - the horizontal distance to measure/set,
//   - the angle to turn RIGHT from the backsight (0..360 clockwise), which is
//     what a total station actually displays, and
//   - the along-line / offset (perpendicular) breakdown of the target relative
//     to the occupied→backsight reference line, used for offset staking.

export interface StakeOutResult {
  /** Grid azimuth from the occupied station to the target, degrees (0..360). */
  azimuth: number;
  /** Horizontal (plan) distance from the occupied station to the target. */
  distance: number;
  /** Azimuth of the reference line occupied→backsight, degrees (0..360). */
  backsightAzimuth: number;
  /** Clockwise angle to turn from the backsight to the target, degrees (0..360). */
  angleRight: number;
  /** Distance along the occupied→backsight line (+ ahead, − behind). */
  along: number;
  /** Perpendicular offset from that line (+ right of line, − left). */
  offset: number;
  /** Elevation difference target − occupied, when both have levels. */
  deltaZ: number | null;
}

/**
 * Compute the stake-out (setting-out) elements to place `target` from an
 * occupied station, oriented on a known `backsight`. Angles are grid azimuths
 * in decimal degrees clockwise from North; the turned angle is measured
 * clockwise (right) from the backsight, matching a total station.
 */
export function stakeOut(
  occupied: NE,
  backsight: NE,
  target: NE,
  occupiedZ: number | null = null,
  targetZ: number | null = null,
): StakeOutResult {
  const toBs = inverse(occupied, backsight);
  const toTarget = inverse(occupied, target);
  const angleRight = normalizeAzimuth(toTarget.azimuth - toBs.azimuth);
  // Along / offset relative to the occupied→backsight reference line.
  const rel = angleRight * RAD;
  const along = toTarget.distance * Math.cos(rel);
  const offset = toTarget.distance * Math.sin(rel);
  return {
    azimuth: toTarget.azimuth,
    distance: toTarget.distance,
    backsightAzimuth: toBs.azimuth,
    angleRight,
    along,
    offset,
    deltaZ: occupiedZ != null && targetZ != null ? targetZ - occupiedZ : null,
  };
}

/** Grade/slope (rise/run) as a ratio and percentage between two elevations. */
export function grade(distance: number, dz: number): { ratio: number; percent: number } {
  if (distance === 0) return { ratio: 0, percent: 0 };
  const ratio = dz / distance;
  return { ratio, percent: ratio * 100 };
}

/**
 * Bearing-bearing intersection. Returns the point where a ray from p1 at
 * az1 meets a ray from p2 at az2, or null if the lines are (near) parallel
 * or the crossing point lies BEHIND either observing station (the rays never
 * meet — the line solution would be a false fix).
 */
export function intersectionBearingBearing(
  p1: NE,
  az1Deg: number,
  p2: NE,
  az2Deg: number,
): NE | null {
  const a1 = normalizeAzimuth(az1Deg) * RAD;
  const a2 = normalizeAzimuth(az2Deg) * RAD;
  // Direction vectors (N, E) -> use (e, n) parametric form.
  const d1n = Math.cos(a1);
  const d1e = Math.sin(a1);
  const d2n = Math.cos(a2);
  const d2e = Math.sin(a2);
  const denom = d1e * d2n - d1n * d2e;
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((p2.e - p1.e) * d2n - (p2.n - p1.n) * d2e) / denom;
  const u = ((p2.e - p1.e) * d1n - (p2.n - p1.n) * d1e) / denom;
  // Ray parameters along both sights must be non-negative (small tolerance
  // lets a fix exactly ON a station pass).
  if (t < -1e-9 || u < -1e-9) return null;
  return { n: p1.n + t * d1n, e: p1.e + t * d1e };
}

/**
 * Distance-distance intersection (two circles). Returns up to two solutions;
 * caller picks the relevant one. Returns [] when circles do not intersect.
 */
export function intersectionDistanceDistance(
  p1: NE,
  r1: number,
  p2: NE,
  r2: number,
): NE[] {
  if (!Number.isFinite(r1) || !Number.isFinite(r2) || r1 < 0 || r2 < 0) return [];
  const dn = p2.n - p1.n;
  const de = p2.e - p1.e;
  const d = Math.hypot(dn, de);
  if (d === 0) return [];
  if (d > r1 + r2 + 1e-9) return [];
  if (d < Math.abs(r1 - r2) - 1e-9) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSq = r1 * r1 - a * a;
  const h = hSq > 0 ? Math.sqrt(hSq) : 0;
  const mn = p1.n + (a * dn) / d;
  const me = p1.e + (a * de) / d;
  if (h === 0) return [{ n: mn, e: me }];
  const offN = (h * de) / d;
  const offE = (h * dn) / d;
  return [
    { n: mn + offN, e: me - offE },
    { n: mn - offN, e: me + offE },
  ];
}

/**
 * Polygon area via the Shoelace formula. Returns the absolute area.
 * Points should describe a closed ring (first != last is fine; it is closed
 * implicitly).
 */
export function polygonArea(points: NE[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.e * b.n - b.e * a.n;
  }
  return Math.abs(sum) / 2;
}

/** Perimeter of an open polyline (sum of segment lengths). */
export function polylineLength(points: NE[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].n - points[i - 1].n, points[i].e - points[i - 1].e);
  }
  return total;
}

export interface TraverseLeg {
  azimuth: number; // degrees
  distance: number;
}

/**
 * Traverse type:
 * - "closed-loop"  → a polygon that begins and ends on the SAME known point.
 *                    Misclosure = computed end − start.
 * - "closed-link"  → begins on one known point and ends on a DIFFERENT known
 *                    point. Misclosure = computed end − known closing point.
 *                    (Also called a connecting / link traverse.)
 * - "open"         → begins on a known point and ends on an UNKNOWN point.
 *                    No closure check or adjustment is possible.
 */
export type TraverseType = "closed-loop" | "closed-link" | "open";

export interface TraverseResult {
  type: TraverseType;
  computed: NE[]; // raw (unadjusted) coordinates including start
  misclosureN: number;
  misclosureE: number;
  linearMisclosure: number;
  perimeter: number;
  /** 1:X precision ratio; Infinity when misclosure is zero. Always Infinity for open traverses. */
  precision: number;
  adjusted: NE[]; // Bowditch (compass-rule) adjusted coordinates (= computed for open)
  /** True when the traverse can be checked/adjusted (loop or link). */
  hasClosure: boolean;
}

export interface TraverseOptions {
  /** Traverse type. Defaults to "closed-loop" for backward compatibility. */
  type?: TraverseType;
  /**
   * Known closing coordinate. Required for "closed-link"; ignored for
   * "closed-loop" (the start is reused) and "open" (no closure).
   */
  closingPoint?: NE;
}

/**
 * Compute a traverse from a start point and a set of legs, applying the
 * Bowditch (compass) rule to distribute misclosure when the traverse closes.
 *
 * Supports all three standard traverse types via `options.type`:
 *   - closed-loop: closes back on `start`.
 *   - closed-link: closes on `options.closingPoint` (a second known point).
 *   - open:        no closure; raw computed coordinates are returned unadjusted.
 *
 * Backward compatible: called with no options it behaves as a closed loop.
 */
export function computeTraverse(
  start: NE,
  legs: TraverseLeg[],
  options: TraverseOptions = {},
): TraverseResult {
  const type: TraverseType = options.type ?? "closed-loop";

  const computed: NE[] = [start];
  let perimeter = 0;
  for (const leg of legs) {
    const prev = computed[computed.length - 1];
    computed.push(forward(prev, leg.azimuth, leg.distance));
    perimeter += leg.distance;
  }
  const last = computed[computed.length - 1];

  // Determine the expected closing coordinate.
  // - loop: the start point itself.
  // - link: the supplied known closing point.
  // - open: none (no closure).
  let expectedClose: NE | null = null;
  if (type === "closed-loop") {
    expectedClose = start;
  } else if (type === "closed-link") {
    expectedClose = options.closingPoint ?? null;
  }
  const hasClosure = expectedClose != null;

  const misclosureN = hasClosure ? last.n - expectedClose!.n : 0;
  const misclosureE = hasClosure ? last.e - expectedClose!.e : 0;
  const linearMisclosure = hasClosure ? Math.hypot(misclosureN, misclosureE) : 0;

  // A perfectly closed traverse leaves only floating-point residuals (on the
  // order of 1e-12), not an exact zero. Treat anything below a sub-millimetre
  // tolerance as zero misclosure so precision reports as Infinity (1:∞).
  const MISCLOSURE_EPSILON = 1e-9;
  const precision =
    !hasClosure || linearMisclosure < MISCLOSURE_EPSILON
      ? Infinity
      : perimeter / linearMisclosure;

  // Bowditch adjustment: correction proportional to cumulative distance.
  // Open traverses cannot be adjusted, so adjusted = computed.
  const adjusted: NE[] = [start];
  let cumulative = 0;
  for (let i = 0; i < legs.length; i++) {
    cumulative += legs[i].distance;
    const ratio = !hasClosure || perimeter === 0 ? 0 : cumulative / perimeter;
    const raw = computed[i + 1];
    adjusted.push({
      n: raw.n - misclosureN * ratio,
      e: raw.e - misclosureE * ratio,
    });
  }

  return {
    type,
    computed,
    misclosureN,
    misclosureE,
    linearMisclosure,
    perimeter,
    precision,
    adjusted,
    hasClosure,
  };
}

// ===========================================================================
// Angular traverse reduction — observed angles → adjusted azimuths.
// ===========================================================================
//
// A field traverse is observed as a starting (orientation) azimuth plus a set
// of horizontal angles turned at each station. Before coordinates can be
// computed, the *angular* misclosure must be checked against the geometric
// condition and distributed. Only then are the balanced azimuths and distances
// fed into `computeTraverse` for the linear (Bowditch) adjustment.
//
// Angle conventions supported:
//   - "interior": interior angles of a closed polygon. Σ interior = (n−2)·180
//     for a loop of n angles. Azimuth advances by (angle − 180) each leg
//     (right-hand interior angles, traversing anticlockwise) — we use the
//     standard forward-azimuth recursion: next = prev + 180 − interior.
//   - "deflection": deflection angles (+right / −left). next = prev + defl.
//   - "angle-right": angle turned clockwise from the back station to the
//     foreward station. next = prev + angleRight − 180.
//
// Loop direction: field crews sometimes run the loop the other way than the
// convention assumes (angles then sum to the *other* theoretical value —
// e.g. exterior angles (n+2)·180 instead of interior (n−2)·180). When the
// observed sum is closer to the mirrored theoretical sum, the mirrored
// convention is used automatically and `mirrored` is set on the result, so a
// reverse loop still balances correctly instead of producing garbage
// corrections or a reflected polygon.

export type TraverseAngleMode = "interior" | "deflection" | "angle-right";

export interface AngularObservation {
  /** Observed horizontal angle at the station, degrees. */
  angle: number;
  /** Distance to the next station (the leg leaving this station). */
  distance: number;
}

export interface AngularTraverseResult {
  /** Balanced forward azimuth for each leg, degrees (0..360). */
  azimuths: number[];
  /** Legs (balanced azimuth + distance) ready for `computeTraverse`. */
  legs: TraverseLeg[];
  /** Sum of observed angles, degrees. */
  angleSum: number;
  /** Theoretical angle sum for the geometric condition, degrees. */
  theoreticalSum: number;
  /** Angular misclosure = observed − theoretical, degrees. */
  angularMisclosure: number;
  /** Correction applied per angle (misclosure distributed equally), degrees. */
  perAngleCorrection: number;
  /** Whether a closure condition applies (closed loop of angles). */
  hasAngularClosure: boolean;
  /**
   * True when the angular observations closed better against the mirrored
   * loop convention (angles observed on the opposite side / loop run in the
   * reverse direction) and the mirrored azimuth recursion was applied.
   */
  mirrored: boolean;
}

/**
 * Reduce observed traverse angles into balanced forward azimuths.
 *
 * @param startAzimuth  known orientation azimuth of the first leg (before any
 *                      angle is applied) OR, for interior/angle-right modes,
 *                      the back-azimuth into the first station — see mode notes.
 * @param observations  per-station angle + leg distance, in survey order.
 * @param mode          angle convention (see `TraverseAngleMode`).
 * @param closed        true for a closed polygon (enables angular misclosure
 *                      check and distribution). Default false.
 */
export function reduceAngularTraverse(
  startAzimuth: number,
  observations: AngularObservation[],
  mode: TraverseAngleMode,
  closed = false,
): AngularTraverseResult {
  const n = observations.length;
  const angleSum = observations.reduce((s, o) => s + o.angle, 0);

  // Theoretical sum and misclosure only apply to a closed angular loop. The
  // loop direction is not assumed: pick the convention whose theoretical sum
  // is closest to the observed sum (see header notes on mirrored loops).
  let theoreticalSum = 0;
  let hasAngularClosure = false;
  let mirrored = false;
  if (closed && n >= 3) {
    hasAngularClosure = true;
    if (mode === "deflection") {
      // Signed deflections sum to ±360 on a loop; the recursion itself uses
      // the signed angle, so only the closure target depends on direction.
      const cw = 360;
      const ccw = -360;
      theoreticalSum =
        Math.abs(angleSum - ccw) < Math.abs(angleSum - cw) ? ccw : cw;
    } else {
      const standard = mode === "interior" ? (n - 2) * 180 : (n + 2) * 180;
      const reversed = mode === "interior" ? (n + 2) * 180 : (n - 2) * 180;
      if (Math.abs(angleSum - reversed) < Math.abs(angleSum - standard)) {
        theoreticalSum = reversed;
        mirrored = true;
      } else {
        theoreticalSum = standard;
      }
    }
  }

  const angularMisclosure = hasAngularClosure ? angleSum - theoreticalSum : 0;
  const perAngleCorrection = hasAngularClosure && n > 0 ? -angularMisclosure / n : 0;

  // Apply the per-angle correction and roll forward the azimuths. A mirrored
  // loop needs the mirrored recursion, otherwise the polygon closes to a
  // reflection of the truth.
  const azimuths: number[] = [];
  let az = normalizeAzimuth(startAzimuth);
  for (let i = 0; i < n; i++) {
    const corrected = observations[i].angle + perAngleCorrection;
    if (mode === "interior") {
      az = normalizeAzimuth(mirrored ? az - 180 + corrected : az + 180 - corrected);
    } else if (mode === "deflection") {
      az = normalizeAzimuth(az + corrected);
    } else {
      az = normalizeAzimuth(mirrored ? az - corrected + 180 : az + corrected - 180);
    }
    azimuths.push(az);
  }

  const legs: TraverseLeg[] = observations.map((o, i) => ({
    azimuth: azimuths[i],
    distance: o.distance,
  }));

  return {
    azimuths,
    legs,
    angleSum,
    theoreticalSum,
    angularMisclosure,
    perAngleCorrection,
    hasAngularClosure,
    mirrored,
  };
}

// ===========================================================================
// Levelling — Rise & Fall and Height of Plane of Collimation (HPC)
// ===========================================================================
//
// A levelling line is a sequence of staff readings. Each reading is one of:
//   - BS (backsight)      : first reading after setting up the level / on a TP
//   - IS (intermediate)   : sights on intermediate stations
//   - FS (foresight)      : last reading before moving the level (on a TP/final)
//
// Reduced Level (RL / Z) is the height of each point. The first point's RL is
// the known benchmark (BM). When a known closing RL is supplied the misclosure
// is distributed equally across the change points (BS/FS instrument setups).

export type StaffKind = "BS" | "IS" | "FS";

export interface LevellingReading {
  /** Station / point label (e.g. "BM1", "A", "TP1"). */
  label: string;
  kind: StaffKind;
  /** Staff reading in metres. */
  reading: number;
}

export interface LevellingRow {
  label: string;
  bs: number | null;
  is: number | null;
  fs: number | null;
  /** Height of plane of collimation (HPC method only). */
  hpc: number | null;
  rise: number | null;
  fall: number | null;
  /** Reduced level before any misclosure adjustment. */
  rl: number;
  /** Reduced level after distributing misclosure (= rl when no closing RL). */
  adjustedRl: number;
}

export interface LevellingResult {
  method: "rise-fall" | "hpc";
  rows: LevellingRow[];
  sumBS: number;
  sumFS: number;
  sumRise: number;
  sumFall: number;
  /** ΣBS − ΣFS. */
  bsMinusFs: number;
  /** ΣRise − ΣFall (rise/fall method). */
  riseMinusFall: number;
  /** Last RL − first RL. */
  lastMinusFirst: number;
  /** True when the three arithmetic-check totals agree (within tolerance). */
  checkOk: boolean;
  /** Closing misclosure (computed last RL − known closing RL); null if no known RL. */
  misclose: number | null;
}

const LEVEL_EPS = 1e-6;

/**
 * Reduce a levelling line.
 *
 * @param readings  ordered staff readings (first must be a BS on the BM).
 * @param startRL   reduced level (Z) of the first point (benchmark).
 * @param method    "rise-fall" or "hpc".
 * @param knownClosingRL  optional known RL of the final point, used to
 *                        distribute misclosure equally across instrument setups.
 */
export function reduceLevelling(
  readings: LevellingReading[],
  startRL: number,
  method: "rise-fall" | "hpc",
  knownClosingRL?: number | null,
): LevellingResult {
  const rows: LevellingRow[] = [];
  let sumBS = 0;
  let sumFS = 0;
  let sumRise = 0;
  let sumFall = 0;

  let prevReading: number | null = null; // previous staff reading for rise/fall diffs
  let prevRL = startRL; // RL used as base for the next rise/fall diff
  let hpc: number | null = null;
  let stationRL = startRL; // RL of the last established station (BM or TP)

  for (let i = 0; i < readings.length; i++) {
    const r = readings[i];
    const row: LevellingRow = {
      label: r.label,
      bs: null,
      is: null,
      fs: null,
      hpc: null,
      rise: null,
      fall: null,
      rl: prevRL,
      adjustedRl: prevRL,
    };

    if (i === 0) {
      // First point: the benchmark with its BS.
      row.bs = r.reading;
      row.rl = startRL;
      sumBS += r.reading;
      hpc = startRL + r.reading;
      row.hpc = hpc;
      prevReading = r.reading;
      prevRL = startRL;
      rows.push(row);
      continue;
    }

    let rl: number;
    if (r.kind === "BS") {
      // A BS does not create a new point: it is the second sight on the turning
      // point just established. Its RL is the turning-point RL, and it fixes
      // the HPC for the new setup.
      rl = stationRL;
      row.rl = rl;
      row.bs = r.reading;
      sumBS += r.reading;
      hpc = stationRL + r.reading;
      row.hpc = hpc;
      // The next rise/fall diff starts from this turning point, so make the
      // TP RL the base RL (not an invented RL for the BS sight).
      prevRL = stationRL;
    } else {
      // FS or IS: compute the new point's RL from the current setup.
      if (method === "rise-fall") {
        const diff = (prevReading ?? r.reading) - r.reading; // +ve = rise
        if (diff >= 0) {
          row.rise = diff;
          sumRise += diff;
        } else {
          row.fall = -diff;
          sumFall += -diff;
        }
        rl = prevRL + diff;
      } else {
        // HPC: RL = HPC - (IS or FS reading).
        rl = (hpc ?? startRL) - r.reading;
      }
      row.rl = rl;

      if (r.kind === "FS") {
        // FS closes the current setup and establishes a new turning/final point.
        row.fs = r.reading;
        sumFS += r.reading;
        stationRL = rl;
      } else {
        row.is = r.reading;
        if (method === "hpc") row.hpc = hpc;
      }
      prevRL = rl;
    }

    row.adjustedRl = rl;
    prevReading = r.reading;
    rows.push(row);
  }

  const firstRL = rows.length ? rows[0].rl : startRL;
  const lastRL = rows.length ? rows[rows.length - 1].rl : startRL;
  const bsMinusFs = sumBS - sumFS;
  const riseMinusFall = sumRise - sumFall;
  const lastMinusFirst = lastRL - firstRL;
  const checkOk =
    Math.abs(bsMinusFs - lastMinusFirst) < LEVEL_EPS &&
    (method === "hpc" || Math.abs(riseMinusFall - lastMinusFirst) < LEVEL_EPS);

  // Misclosure adjustment: distribute the closing misclosure equally over the
  // instrument setups (each setup is opened by a BS). A point observed during
  // setup k receives k increments of the per-setup correction, so the
  // correction grows cumulatively along the line and the final point absorbs
  // the full misclosure. The benchmark (first row, setup 1) carries zero
  // correction since it is the fixed datum.
  let misclose: number | null = null;
  if (knownClosingRL != null && Number.isFinite(knownClosingRL)) {
    misclose = lastRL - knownClosingRL;
    // A setup runs from a BS up to (and including) its closing FS. Each FS
    // completes one setup. The correction grows by one per-setup increment as
    // each setup is completed, so a point reached after k completed setups
    // carries k * perSetup. The final point completes every setup and so
    // absorbs the full misclosure.
    const setups = rows.filter((r) => r.fs != null).length || 1;
    const perSetup = misclose / setups;
    let completedSetups = 0;
    for (const row of rows) {
      // Apply the correction accrued by all setups completed *before* this
      // point is reached, then count this row's FS as completing its setup so
      // the closing reading and everything after it carry the increment.
      row.adjustedRl = row.rl - completedSetups * perSetup;
      if (row.fs != null) {
        completedSetups += 1;
        row.adjustedRl = row.rl - completedSetups * perSetup;
      }
    }
    // Guard against floating-point drift so the closing point lands exactly on
    // the known RL.
    if (rows.length) rows[rows.length - 1].adjustedRl = knownClosingRL;
  }

  return {
    method,
    rows,
    sumBS,
    sumFS,
    sumRise,
    sumFall,
    bsMinusFs,
    riseMinusFall,
    lastMinusFirst,
    checkOk,
    misclose,
  };
}

// ===========================================================================
// Resection — Tienstra (three-point) method
// ===========================================================================
//
// Determine the observer's position P from horizontal angles subtended between
// three known stations A, B, C observed from P:
//   - alpha = angle BPC (between B and C)
//   - beta  = angle CPA (between C and A)
//   - gamma = angle APB (between A and B)   (alpha + beta + gamma = 360°)
//
// Tienstra's barycentric solution is robust for well-conditioned geometry.

/** Internal angle (deg) at a triangle vertex given the three station points. */
function triangleAngleAt(at: NE, p1: NE, p2: NE): number {
  const a1 = inverse(at, p1).azimuth;
  const a2 = inverse(at, p2).azimuth;
  let d = Math.abs(a1 - a2) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * Three-point resection (Tienstra). `alpha`, `beta`, `gamma` are the angles
 * (degrees) observed at P subtended by (B,C), (C,A) and (A,B) respectively.
 * Returns the resected position, or null for degenerate geometry.
 */
export function resectionTienstra(
  A: NE,
  B: NE,
  C: NE,
  alphaDeg: number,
  betaDeg: number,
  gammaDeg: number,
): NE | null {
  // Interior angles of the known triangle ABC.
  const angA = triangleAngleAt(A, B, C);
  const angB = triangleAngleAt(B, C, A);
  const angC = triangleAngleAt(C, A, B);

  const cot = (deg: number) => {
    const t = Math.tan(deg * RAD);
    if (Math.abs(t) < 1e-12) return null;
    return 1 / t;
  };

  const cotA = cot(angA);
  const cotB = cot(angB);
  const cotC = cot(angC);
  const cotAlpha = cot(alphaDeg);
  const cotBeta = cot(betaDeg);
  const cotGamma = cot(gammaDeg);
  if (
    cotA == null || cotB == null || cotC == null ||
    cotAlpha == null || cotBeta == null || cotGamma == null
  ) {
    return null;
  }

  const k1 = 1 / (cotA - cotAlpha);
  const k2 = 1 / (cotB - cotBeta);
  const k3 = 1 / (cotC - cotGamma);
  const sum = k1 + k2 + k3;
  if (!Number.isFinite(sum) || Math.abs(sum) < 1e-12) return null;

  const n = (k1 * A.n + k2 * B.n + k3 * C.n) / sum;
  const e = (k1 * A.e + k2 * B.e + k3 * C.e) / sum;
  if (!Number.isFinite(n) || !Number.isFinite(e)) return null;
  return { n, e };
}



// ===========================================================================
// Combined scale factor — the single most important reduction in engineering
// survey when relating GROUND distances to GRID distances.
// ===========================================================================
//
//   grid distance = ground distance × combined scale factor
//   combinedSF    = pointScaleFactor × heightScaleFactor
//   heightSF      = R / (R + H)            (reduction to the ellipsoid/MSL)
//
// On the Zimbabwe Highveld (H ≈ 1500 m) the height factor alone is ~235 ppm,
// i.e. 23.5 mm over 100 m — far above any setting-out tolerance. GIS tools
// ignore this; survey tools must not.

/** Mean radius of the Earth (m) used for the height reduction. */
export const EARTH_MEAN_RADIUS = 6371000;

/**
 * Height (sea-level) scale factor reducing a ground distance at height `H`
 * (metres above the ellipsoid/MSL) to the projection surface.
 */
export function heightScaleFactor(heightMeters: number, earthRadius = EARTH_MEAN_RADIUS): number {
  return earthRadius / (earthRadius + heightMeters);
}

/**
 * Combined scale factor = point (grid) scale factor × height scale factor.
 * Multiply a GROUND distance by this to obtain the GRID distance; divide a
 * grid distance by this to set out on the ground.
 */
export function combinedScaleFactor(
  pointScaleFactor: number,
  heightMeters: number,
  earthRadius = EARTH_MEAN_RADIUS,
): number {
  return pointScaleFactor * heightScaleFactor(heightMeters, earthRadius);
}

/** Reduce a ground distance to grid using the combined scale factor. */
export function groundToGrid(groundDistance: number, combinedSF: number): number {
  return groundDistance * combinedSF;
}

/** Expand a grid distance to ground using the combined scale factor. */
export function gridToGround(gridDistance: number, combinedSF: number): number {
  return combinedSF === 0 ? NaN : gridDistance / combinedSF;
}



// ===========================================================================
// Alignment setting-out — horizontal circular & vertical parabolic curves
// ===========================================================================
//
// These are the core centreline geometry computations for road / rail / drain
// setting-out, matching the robust Rust `survey-core::alignment` module so the
// numbers are identical whether the pure-TS or WASM path runs. Azimuths are in
// decimal degrees clockwise from North; distances/levels in project units (m).

export interface HorizontalCurve {
  /** Radius of the curve. */
  radius: number;
  /** Deflection (intersection) angle between the tangents, degrees (0..180). */
  deflection: number;
  /** Tangent length T = R·tan(Δ/2) (PI→PC and PI→PT). */
  tangent: number;
  /** Curve (arc) length L = R·Δ. */
  length: number;
  /** External distance E = R·(sec(Δ/2) − 1) (PI→mid-curve). */
  external: number;
  /** Middle ordinate M = R·(1 − cos(Δ/2)). */
  middleOrdinate: number;
  /** Long chord C = 2R·sin(Δ/2) (PC→PT straight line). */
  longChord: number;
  /** Point of curvature (tangent→curve), where the curve begins. */
  pc: NE;
  /** Point of tangency (curve→tangent), where the curve ends. */
  pt: NE;
  /** Centre of the circular arc. */
  centre: NE;
  /** True when the curve turns to the right (clockwise) from the back tangent. */
  turnsRight: boolean;
}

/**
 * Solve a simple horizontal circular curve from the point of intersection
 * (`pi`), the incoming (back) tangent azimuth, the outgoing (forward) tangent
 * azimuth and the radius. Returns null for a non-positive radius or a
 * degenerate (0° / 180°) deflection.
 */
export function horizontalCurve(
  pi: NE,
  backAzimuth: number,
  fwdAzimuth: number,
  radius: number,
): HorizontalCurve | null {
  if (radius <= 0) return null;

  let delta = normalizeAzimuth(fwdAzimuth) - normalizeAzimuth(backAzimuth);
  if (delta > 180) delta -= 360;
  else if (delta < -180) delta += 360;
  const turnsRight = delta > 0;
  const deltaAbs = Math.abs(delta);
  if (deltaAbs < 1e-9 || Math.abs(deltaAbs - 180) < 1e-9) return null;

  const half = (deltaAbs * RAD) / 2;
  const tangent = radius * Math.tan(half);
  const length = radius * deltaAbs * RAD;
  const external = radius * (1 / Math.cos(half) - 1);
  const middleOrdinate = radius * (1 - Math.cos(half));
  const longChord = 2 * radius * Math.sin(half);

  const pc = forward(pi, backAzimuth + 180, tangent);
  const pt = forward(pi, fwdAzimuth, tangent);
  const centreAz = turnsRight ? backAzimuth + 90 : backAzimuth - 90;
  const centre = forward(pc, centreAz, radius);

  return {
    radius,
    deflection: deltaAbs,
    tangent,
    length,
    external,
    middleOrdinate,
    longChord,
    pc,
    pt,
    centre,
    turnsRight,
  };
}

export interface CurveStation {
  /** Arc distance from the PC along the curve. */
  arcFromPc: number;
  /** Coordinate of the point on the curve. */
  point: NE;
  /** Deflection angle (deg) from the PC tangent to this point (theodolite on PC). */
  deflection: number;
}

/**
 * Stake out points along a horizontal curve at a fixed arc `interval`,
 * returning every station from the PC to the PT (inclusive). `backAzimuth`
 * must match the value used to solve the curve.
 */
export function stakeHorizontalCurve(
  curve: HorizontalCurve,
  backAzimuth: number,
  interval: number,
): CurveStation[] {
  const out: CurveStation[] = [];
  if (interval <= 0 || curve.length <= 0) return out;
  const sign = curve.turnsRight ? 1 : -1;

  let arc = 0;
  for (;;) {
    const capped = Math.min(arc, curve.length);
    const theta = capped / curve.radius; // central angle, radians
    const chord = 2 * curve.radius * Math.sin(theta / 2);
    const defl = (theta / 2) * DEG;
    const chordAz = backAzimuth + sign * defl;
    out.push({ arcFromPc: capped, point: forward(curve.pc, chordAz, chord), deflection: defl });
    if (capped >= curve.length) break;
    arc += interval;
  }
  return out;
}

export interface VerticalStation {
  /** Horizontal distance from the start of the curve (BVC). */
  chainage: number;
  /** Reduced level (elevation) at this chainage. */
  elevation: number;
}

export interface VerticalCurve {
  /** Elevation at the start of the curve (BVC). */
  bvcElevation: number;
  /** Elevation at the end of the curve (EVC). */
  evcElevation: number;
  /** Algebraic grade change A = g2 − g1, percent. */
  gradeChange: number;
  /** Chainage of the high/low point from the BVC, or null when outside the curve. */
  turningChainage: number | null;
  /** Elevation at the turning point, when it exists. */
  turningElevation: number | null;
  /** Staked stations along the curve at the requested interval (BVC..EVC). */
  stations: VerticalStation[];
}

/**
 * Design an equal-tangent vertical parabolic curve.
 * `g1`/`g2` are the incoming/outgoing grades in percent (e.g. +2.5, −1.0).
 * Pass `interval = 0` to skip station generation. Returns null for a
 * non-positive length.
 */
export function verticalCurve(
  bvcElevation: number,
  g1: number,
  g2: number,
  length: number,
  interval: number,
): VerticalCurve | null {
  if (length <= 0) return null;
  const m1 = g1 / 100;
  const m2 = g2 / 100;
  const gradeChange = g2 - g1;

  const a = (m2 - m1) / (2 * length);
  const elevAt = (x: number) => bvcElevation + m1 * x + a * x * x;
  const evcElevation = elevAt(length);

  let turningChainage: number | null = null;
  let turningElevation: number | null = null;
  if (Math.abs(m2 - m1) >= 1e-12) {
    const x = (-m1 * length) / (m2 - m1);
    if (x >= 0 && x <= length) {
      turningChainage = x;
      turningElevation = elevAt(x);
    }
  }

  const stations: VerticalStation[] = [];
  if (interval > 0) {
    let x = 0;
    for (;;) {
      const capped = Math.min(x, length);
      stations.push({ chainage: capped, elevation: elevAt(capped) });
      if (capped >= length) break;
      x += interval;
    }
  }

  return {
    bvcElevation,
    evcElevation,
    gradeChange,
    turningChainage,
    turningElevation,
    stations,
  };
}

// ===========================================================================
// Volumes
// ===========================================================================
//
// Volume computation in engineering survey is distinct from plan area: it
// requires elevations (Z) and a defined method. We implement the methods
// used by commercial packages (Leica Infinity, Trimble Business Center,
// GEOVIA Surpac, Carlson, Civil 3D):
//
//   1. Grid method            — regular grid of spot heights vs a datum level.
//      Volume per cell = cellArea·(meanCornerHeight − base).          [site grading]
//   2. TIN-to-plane           — triangulate (X,Y,Z) points, integrate each
//      triangular prism above/below a reference level.        [stockpile volume]
//   3. TIN-to-TIN             — difference an "existing" surface against a
//      "design"/base surface sampled on the same triangulation.   [cut & fill]
//
// Cut is material to be removed (surface above the reference/design);
// fill is material to be added (surface below). Net = fill − cut by convention
// here we report net = sumAbove − sumBelow as the signed volume above the datum.

/** A 3D survey point: Easting (e), Northing (n) and elevation Z (z). */
export interface NEZ extends NE {
  z: number;
}

// ── 1. Grid method ─────────────────────────────────────────────────────────

export interface GridVolumeResult {
  /** Volume of material above the base level (m³). */
  cut: number;
  /** Volume of "space" below the base level / fill required (m³). */
  fill: number;
  /** Net signed volume above the base (cut − fill). */
  net: number;
  /** Number of complete grid cells evaluated. */
  cells: number;
}

/**
 * Grid-method volume. `grid` is a row-major 2D array of spot elevations (Z)
 * on a regular grid; `cellSizeX`/`cellSizeY` are the ground spacings (m).
 * Volume is integrated cell-by-cell using the mean of the four corner heights
 * relative to `baseLevel`. Cells with any non-finite corner are skipped.
 */
export function volumeGrid(
  grid: number[][],
  cellSizeX: number,
  cellSizeY: number,
  baseLevel: number,
): GridVolumeResult {
  // A negative cell size would silently invert the cut/fill sign; a zero cell
  // would yield a meaningless zero volume. Reject both explicitly.
  if (!Number.isFinite(cellSizeX) || !Number.isFinite(cellSizeY) || cellSizeX <= 0 || cellSizeY <= 0) {
    throw new Error("Grid cell sizes must be positive, finite numbers.");
  }
  const cellArea = cellSizeX * cellSizeY;
  let cut = 0;
  let fill = 0;
  let cells = 0;
  for (let r = 0; r + 1 < grid.length; r++) {
    const row = grid[r];
    const next = grid[r + 1];
    if (!row || !next) continue;
    for (let c = 0; c + 1 < Math.min(row.length, next.length); c++) {
      const corners = [row[c], row[c + 1], next[c], next[c + 1]];
      if (!corners.every(Number.isFinite)) continue;
      const meanDepth = (corners[0] + corners[1] + corners[2] + corners[3]) / 4 - baseLevel;
      const vol = meanDepth * cellArea;
      if (vol >= 0) cut += vol;
      else fill += -vol;
      cells += 1;
    }
  }
  return { cut, fill, net: cut - fill, cells };
}

// ── 2 & 3. TIN-based volumes ───────────────────────────────────────────────

export interface TinVolumeResult {
  /** Volume above the reference (material to cut), m³. */
  cut: number;
  /** Volume below the reference (material to fill), m³. */
  fill: number;
  /** Net signed volume (cut − fill), m³. */
  net: number;
  /** Plan area covered by the triangulation, m². */
  planArea: number;
  /** Number of triangles in the TIN. */
  triangles: number;
}

/** Plan (2D) area of a triangle from its three NE vertices. */
function triPlanArea(a: NE, b: NE, c: NE): number {
  return Math.abs((b.e - a.e) * (c.n - a.n) - (c.e - a.e) * (b.n - a.n)) / 2;
}

interface DepthVertex {
  n: number;
  e: number;
  /** Signed depth relative to the reference surface. */
  d: number;
}

/** Plan (2D) area of a triangle from depth vertices. */
function triPlanAreaFromDepths(a: DepthVertex, b: DepthVertex, c: DepthVertex): number {
  return Math.abs((b.e - a.e) * (c.n - a.n) - (c.e - a.e) * (b.n - a.n)) / 2;
}

/** Signed prism volume = planArea · mean(depth) for a sub-triangle. */
function signedDepthVolume(a: DepthVertex, b: DepthVertex, c: DepthVertex): number {
  const area = triPlanAreaFromDepths(a, b, c);
  if (area === 0) return 0;
  return (area * (a.d + b.d + c.d)) / 3;
}

/** Linearly interpolate the point where depth crosses zero along p → q. */
function interpolateDepthEdge(p: DepthVertex, q: DepthVertex): DepthVertex {
  const denom = p.d - q.d;
  // Signs differ on a crossing edge, so denom cannot be zero.
  const t = p.d / denom;
  return {
    n: p.n + t * (q.n - p.n),
    e: p.e + t * (q.e - p.e),
    d: 0,
  };
}

/**
 * Add a single triangle's cut/fill contribution, splitting it by the zero-depth
 * plane when the triangle straddles the reference surface. This keeps cut and
 * fill volumes accurate at embankment boundaries and datum-level TIN edges.
 */
function accumulateCutFill(
  acc: { cut: number; fill: number },
  a: DepthVertex,
  b: DepthVertex,
  c: DepthVertex,
) {
  const pos = [a.d >= 0, b.d >= 0, c.d >= 0];
  const allPositive = pos.every(Boolean);
  const allNegative = !pos.some(Boolean);

  if (allPositive) {
    acc.cut += signedDepthVolume(a, b, c);
    return;
  }
  if (allNegative) {
    acc.fill += -signedDepthVolume(a, b, c);
    return;
  }

  // Mixed signs: split the triangle along the zero-depth contour.
  const verts = [a, b, c];
  const posIdx = pos.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  const negIdx = pos.map((p, i) => (!p ? i : -1)).filter((i) => i >= 0);

  if (posIdx.length === 1) {
    const i = posIdx[0];
    const j = negIdx[0];
    const k = negIdx[1];
    const pij = interpolateDepthEdge(verts[i], verts[j]);
    const pik = interpolateDepthEdge(verts[i], verts[k]);
    acc.cut += signedDepthVolume(verts[i], pij, pik);
    acc.fill += -signedDepthVolume(pij, verts[j], verts[k]);
    acc.fill += -signedDepthVolume(pij, verts[k], pik);
  } else {
    const i = negIdx[0];
    const j = posIdx[0];
    const k = posIdx[1];
    const pji = interpolateDepthEdge(verts[j], verts[i]);
    const pki = interpolateDepthEdge(verts[k], verts[i]);
    acc.fill += -signedDepthVolume(verts[i], pki, pji);
    acc.cut += signedDepthVolume(verts[j], pji, pki);
    acc.cut += signedDepthVolume(verts[j], pki, verts[k]);
  }
}

/**
 * Integrate the volume of the triangular prisms of a TIN above/below a
 * reference height supplied per-vertex.
 *
 * `triangles` is a flat index array (i0,i1,i2, i3,i4,i5, …) as produced by
 * Delaunay triangulation; `points` are the (X,Y,Z) vertices; `refZ(i)` returns
 * the reference elevation at vertex i (a constant plane, or a sampled design
 * surface). Each prism volume = planArea · meanDepth, where meanDepth is the
 * average of the three vertex (z − refZ) deltas.
 *
 * Triangles that cross the reference surface are split into cut and fill
 * sub-prisms so the reported cut and fill volumes are correct at boundaries.
 */
export function volumeFromTriangles(
  points: NEZ[],
  triangles: ArrayLike<number>,
  refZ: (vertexIndex: number) => number,
): TinVolumeResult {
  const acc = { cut: 0, fill: 0 };
  let planArea = 0;
  let triCount = 0;
  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const i0 = triangles[t];
    const i1 = triangles[t + 1];
    const i2 = triangles[t + 2];
    const a = points[i0];
    const b = points[i1];
    const c = points[i2];
    if (!a || !b || !c) continue;
    const d0 = a.z - refZ(i0);
    const d1 = b.z - refZ(i1);
    const d2 = c.z - refZ(i2);
    if (![d0, d1, d2].every(Number.isFinite)) continue;
    const area = triPlanArea(a, b, c);
    if (area === 0) continue;
    accumulateCutFill(
      acc,
      { n: a.n, e: a.e, d: d0 },
      { n: b.n, e: b.e, d: d1 },
      { n: c.n, e: c.e, d: d2 },
    );
    planArea += area;
    triCount += 1;
  }
  return { cut: acc.cut, fill: acc.fill, net: acc.cut - acc.fill, planArea, triangles: triCount };
}

/**
 * Volume of a triangulated surface above/below a flat reference plane.
 * `points` are (X,Y,Z); `triangles` is the Delaunay index array. Used for
 * stockpile volumes above a base level and excavation below a datum.
 */
export function volumeTinToPlane(
  points: NEZ[],
  triangles: ArrayLike<number>,
  baseLevel: number,
): TinVolumeResult {
  return volumeFromTriangles(points, triangles, () => baseLevel);
}

/**
 * Volume between an "existing" surface and a "design"/reference surface that
 * shares the same vertices and triangulation. `designZ` supplies the design
 * elevation for each vertex (same index order as `points`).
 */
export function volumeTinToSurface(
  points: NEZ[],
  triangles: ArrayLike<number>,
  designZ: number[],
): TinVolumeResult {
  return volumeFromTriangles(points, triangles, (i) => designZ[i]);
}

// ===========================================================================
// Cross-section volumes (road / rail / drain earthworks)
// ===========================================================================

export interface CrossSection {
  /** Chainage / station along the alignment (m). */
  chainage: number;
  /** Cross-sectional area at that chainage (m²). */
  area: number;
}

/**
 * Volume between a series of cross-sections using the end-area (trapezoidal)
 * method: V = Σ ((Aᵢ + Aᵢ₊₁) / 2) · (chainageᵢ₊₁ − chainageᵢ).
 */
export function volumeEndArea(sections: CrossSection[]): number {
  if (sections.length < 2) return 0;
  const sorted = [...sections].sort((a, b) => a.chainage - b.chainage);
  let total = 0;
  for (let i = 0; i + 1 < sorted.length; i++) {
    const h = sorted[i + 1].chainage - sorted[i].chainage;
    if (h <= 0) continue;
    total += ((sorted[i].area + sorted[i + 1].area) / 2) * h;
  }
  return total;
}

/**
 * Prismoidal volume using Simpson's 1/3 rule. Requires an odd number of
 * equally-spaced cross-sections; returns null when the sections do not fit.
 *
 * V = (h/3) · (A₀ + Aₙ + 4·Σ(odd) + 2·Σ(even)).
 */
export function volumePrismoidal(sections: CrossSection[]): number | null {
  if (sections.length < 3) return null;
  const sorted = [...sections].sort((a, b) => a.chainage - b.chainage);
  const n = sorted.length;
  if (n % 2 === 0) return null;
  const h = sorted[1].chainage - sorted[0].chainage;
  if (h <= 0) return null;
  const SPACING_TOL = 1e-6;
  for (let i = 1; i + 1 < n; i++) {
    if (Math.abs(sorted[i + 1].chainage - sorted[i].chainage - h) > SPACING_TOL) {
      return null;
    }
  }
  let sum = sorted[0].area + sorted[n - 1].area;
  for (let i = 1; i < n - 1; i++) {
    sum += (i % 2 === 1 ? 4 : 2) * sorted[i].area;
  }
  return (sum * h) / 3;
}

// ===========================================================================
// Extended geometric intersections
// ===========================================================================

const INTERSECTION_EPS = 1e-12;

/**
 * True line-line intersection: returns the point where the infinite lines
 * through `(p1,q1)` and `(p2,q2)` meet, or null when they are parallel.
 * For bounded ray/ray intersection use `intersectionBearingBearing`.
 */
export function lineLine(p1: NE, q1: NE, p2: NE, q2: NE): NE | null {
  const d1n = q1.n - p1.n;
  const d1e = q1.e - p1.e;
  const d2n = q2.n - p2.n;
  const d2e = q2.e - p2.e;
  const denom = d1e * d2n - d1n * d2e;
  if (Math.abs(denom) < INTERSECTION_EPS) return null;
  const dn = p2.n - p1.n;
  const de = p2.e - p1.e;
  const t = (-dn * d2e + de * d2n) / denom;
  return { n: p1.n + t * d1n, e: p1.e + t * d1e };
}

/** Intersection of an infinite line (through a, b) with a circle. */
export function lineArc(a: NE, b: NE, centre: NE, radius: number): NE[] {
  if (!Number.isFinite(radius) || radius < 0) return [];
  if (radius < INTERSECTION_EPS) return [];
  const dn = b.n - a.n;
  const de = b.e - a.e;
  const len = Math.hypot(dn, de);
  if (len < INTERSECTION_EPS) return [];
  const un = dn / len;
  const ue = de / len;
  const vn = centre.n - a.n;
  const ve = centre.e - a.e;
  const t0 = vn * un + ve * ue;
  const cross = vn * ue - ve * un;
  const d = Math.abs(cross);
  if (d > radius + INTERSECTION_EPS) return [];
  const halfChord = Math.sqrt(radius * radius - cross * cross);
  const t1 = t0 - halfChord;
  const t2 = t0 + halfChord;
  if (halfChord < INTERSECTION_EPS) {
    return [{ n: a.n + t0 * un, e: a.e + t0 * ue }];
  }
  return [
    { n: a.n + t1 * un, e: a.e + t1 * ue },
    { n: a.n + t2 * un, e: a.e + t2 * ue },
  ];
}

/** Intersection of two circles. Returns 0, 1 or 2 points. */
export function arcArc(c1: NE, r1: number, c2: NE, r2: number): NE[] {
  return intersectionDistanceDistance(c1, r1, c2, r2);
}

// ===========================================================================
// Circle fitting — best-fit circle through 3+ points
// ===========================================================================

export interface CircleFit {
  centre: NE;
  radius: number;
  rmse: number;
}

/** Fit a circle to 3+ points using the Kåsa algebraic method. */
export function fitCircle(points: NE[]): CircleFit | null {
  if (points.length < 3) return null;
  const n = points.length;
  const xbar = points.reduce((s, p) => s + p.e, 0) / n;
  const ybar = points.reduce((s, p) => s + p.n, 0) / n;
  let su2 = 0;
  let sv2 = 0;
  let suv = 0;
  let rhsU = 0;
  let rhsV = 0;
  for (const p of points) {
    const u = p.e - xbar;
    const v = p.n - ybar;
    const sq = u * u + v * v;
    su2 += u * u;
    sv2 += v * v;
    suv += u * v;
    rhsU += u * sq;
    rhsV += v * sq;
  }
  const det = su2 * sv2 - suv * suv;
  if (Math.abs(det) < 1e-24) return null;
  const uc = (rhsU * sv2 - rhsV * suv) / (2 * det);
  const vc = (rhsV * su2 - rhsU * suv) / (2 * det);
  const centre = { n: ybar + vc, e: xbar + uc };
  const zbar = points.reduce((s, p) => {
    const u = p.e - xbar;
    const v = p.n - ybar;
    return s + u * u + v * v;
  }, 0) / n;
  const radius = Math.sqrt(uc * uc + vc * vc + zbar);
  if (!Number.isFinite(radius) || radius <= 0) return null;
  const rmse = Math.sqrt(
    points.reduce((s, p) => {
      const d = Math.hypot(p.n - centre.n, p.e - centre.e) - radius;
      return s + d * d;
    }, 0) / n,
  );
  return { centre, radius, rmse };
}

// ===========================================================================
// Free-station resection (mixed bearings / distances)
// ===========================================================================

export interface Observation {
  station: NE;
  azimuthDeg?: number;
  distance?: number;
  weight?: number;
}

export interface FreeStationResult {
  position: NE;
  iterations: number;
  sumSquaredResiduals: number;
  rmse: number;
}

/** Compute a free-station position from mixed bearing/distance observations. */
export function freeStation(
  observations: Observation[],
  initialGuess?: NE,
): FreeStationResult | null {
  if (observations.length < 2) return null;
  const estimate = initialGuess ?? initialEstimate(observations);
  if (!estimate) return null;
  let pos = estimate;
  const MAX_ITER = 50;
  const TOL = 1e-9;
  let lastSsr = Infinity;

  for (let iteration = 0; iteration < MAX_ITER; iteration++) {
    const { ata, atr, ssr, rmse } = buildNormals(observations, pos);
    lastSsr = ssr;
    const det = ata[0][0] * ata[1][1] - ata[0][1] * ata[1][0];
    if (Math.abs(det) < 1e-24) return null;
    const dN = (atr[0] * ata[1][1] - atr[1] * ata[0][1]) / det;
    const dE = (ata[0][0] * atr[1] - ata[1][0] * atr[0]) / det;
    pos = { n: pos.n + dN, e: pos.e + dE };
    if (Math.hypot(dN, dE) < TOL) {
      return { position: pos, iterations: iteration + 1, sumSquaredResiduals: ssr, rmse };
    }
  }
  return {
    position: pos,
    iterations: MAX_ITER,
    sumSquaredResiduals: lastSsr,
    // Same definition as the converged path: sqrt(SSR / n).
    rmse: Math.sqrt(lastSsr / observations.length),
  };
}

function initialEstimate(obs: Observation[]): NE | null {
  for (const o of obs) {
    if (o.azimuthDeg != null && o.distance != null) {
      const az = normalizeAzimuth(o.azimuthDeg) * RAD;
      return { n: o.station.n - o.distance * Math.cos(az), e: o.station.e - o.distance * Math.sin(az) };
    }
  }
  if (obs.length >= 2) {
    if (obs[0].distance != null && obs[1].distance != null) {
      const sols = intersectionDistanceDistance(
        obs[0].station,
        obs[0].distance,
        obs[1].station,
        obs[1].distance,
      );
      if (sols.length) return sols[0];
    }
    if (obs[0].azimuthDeg != null && obs[1].azimuthDeg != null) {
      const a = obs[0].station;
      const b = forward(obs[0].station, obs[0].azimuthDeg, 1);
      const c = obs[1].station;
      const d = forward(obs[1].station, obs[1].azimuthDeg, 1);
      return lineLine(a, b, c, d);
    }
  }
  return null;
}

function buildNormals(
  obs: Observation[],
  pos: NE,
): { ata: number[][]; atr: number[]; ssr: number; rmse: number } {
  const ata = [
    [0, 0],
    [0, 0],
  ];
  const atr = [0, 0];
  let ssr = 0;

  for (const o of obs) {
    const dn = o.station.n - pos.n;
    const de = o.station.e - pos.e;
    const dist2 = dn * dn + de * de;
    const dist = Math.sqrt(dist2);
    const w = o.weight ?? 1;

    if (o.azimuthDeg != null) {
      const computed = inverse(pos, o.station).azimuth;
      let r = (computed - o.azimuthDeg) * RAD;
      if (r > Math.PI) r -= 2 * Math.PI;
      else if (r < -Math.PI) r += 2 * Math.PI;
      if (dist2 > 1e-24) {
        const aN = de / dist2;
        const aE = -dn / dist2;
        const row = [aN, aE];
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            ata[i][j] += w * row[i] * row[j];
          }
          atr[i] -= w * row[i] * r;
        }
        ssr += w * r * r;
      }
    }

    if (o.distance != null) {
      const r = dist > 1e-12 ? dist - o.distance : -o.distance;
      if (dist > 1e-12) {
        const aN = -dn / dist;
        const aE = -de / dist;
        const row = [aN, aE];
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            ata[i][j] += w * row[i] * row[j];
          }
          atr[i] -= w * row[i] * r;
        }
        ssr += w * r * r;
      }
    }
  }

  const rmse = obs.length ? Math.sqrt(ssr / obs.length) : 0;
  return { ata, atr, ssr, rmse };
}

/**
 * Compute a circular arc through three planar points.
 * Returns vertices sampled along the shorter arc from `start` to `end` that
 * passes through `mid`. Returns null if the points are collinear or coincident.
 */
export function circularArc(start: NE, mid: NE, end: NE, segments = 16): NE[] | null {
  // Perpendicular bisector of start-mid and mid-end.
  const d1 = 2 * ((mid.e - start.e) * (end.n - start.n) - (mid.n - start.n) * (end.e - start.e));
  if (Math.abs(d1) < 1e-12) return null;

  const r1 = mid.e * mid.e + mid.n * mid.n;
  const r2 = start.e * start.e + start.n * start.n;
  const r3 = end.e * end.e + end.n * end.n;

  const cenE = ((r1 - r2) * (end.n - start.n) - (r3 - r2) * (mid.n - start.n)) / d1;
  const cenN = ((mid.e - start.e) * (r3 - r2) - (end.e - start.e) * (r1 - r2)) / d1;
  const radius = Math.hypot(start.e - cenE, start.n - cenN);
  if (radius < 1e-9) return null;

  const angle = (p: NE) => Math.atan2(p.e - cenE, p.n - cenN);
  const a0 = angle(start);
  const aMid = angle(mid);
  let aEnd = angle(end);

  // Choose the arc direction that passes through mid.
  let diff = aEnd - a0;
  while (diff <= -Math.PI) diff += TWO_PI;
  while (diff > Math.PI) diff -= TWO_PI;
  let midDiff = aMid - a0;
  while (midDiff <= -Math.PI) midDiff += TWO_PI;
  while (midDiff > Math.PI) midDiff -= TWO_PI;
  if ((diff > 0 && midDiff < 0) || (diff < 0 && midDiff > 0)) {
    aEnd += diff > 0 ? -TWO_PI : TWO_PI;
  }

  const points: NE[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const theta = a0 + (aEnd - a0) * t;
    points.push({ e: cenE + radius * Math.sin(theta), n: cenN + radius * Math.cos(theta) });
  }
  return points;
}

export interface CircularArcParams {
  center: NE;
  radius: number;
  startAngle: number;
  endAngle: number;
}

/**
 * Compute the centre, radius and start/end angles of the circular arc through
 * three planar points. Angles are degrees, **counter-clockwise from the
 * +E (Easting) axis** — the same convention the CAD model, renderer and DXF
 * exporter use — and sweeping counter-clockwise from `startAngle` to
 * `endAngle` always passes through `mid` (start/end are swapped when the
 * picked points run clockwise).
 * Returns null if the points are collinear or coincident.
 */
export function circularArcParams(start: NE, mid: NE, end: NE): CircularArcParams | null {
  const d1 = 2 * ((mid.e - start.e) * (end.n - start.n) - (mid.n - start.n) * (end.e - start.e));
  if (Math.abs(d1) < 1e-12) return null;

  const r1 = mid.e * mid.e + mid.n * mid.n;
  const r2 = start.e * start.e + start.n * start.n;
  const r3 = end.e * end.e + end.n * end.n;

  const cenE = ((r1 - r2) * (end.n - start.n) - (r3 - r2) * (mid.n - start.n)) / d1;
  const cenN = ((mid.e - start.e) * (r3 - r2) - (end.e - start.e) * (r1 - r2)) / d1;
  const radius = Math.hypot(start.e - cenE, start.n - cenN);
  if (radius < 1e-9) return null;

  // CCW-from-+E in the (e,n) plane: atan2(Δn, Δe).
  const angle = (p: NE) => Math.atan2(p.n - cenN, p.e - cenE);
  let a0 = angle(start);
  const aMid = angle(mid);
  let aEnd = angle(end);

  // Counter-clockwise separation b − a in [0, 2π).
  const ccwSep = (from: number, to: number) => {
    let d = (to - from) % TWO_PI;
    if (d < 0) d += TWO_PI;
    return d;
  };

  // The CCW sweep from start to end must contain the mid point; otherwise the
  // three points run clockwise and the true arc is expressed from `end`.
  if (ccwSep(a0, aMid) > ccwSep(a0, aEnd)) {
    const tmp = a0;
    a0 = aEnd;
    aEnd = tmp;
  }

  const toDeg = (rad: number) => rad * (180 / Math.PI);
  return {
    center: { n: cenN, e: cenE },
    radius,
    startAngle: toDeg(a0),
    endAngle: toDeg(aEnd),
  };
}
