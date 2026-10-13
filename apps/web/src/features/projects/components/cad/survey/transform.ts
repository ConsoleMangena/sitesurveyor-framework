/**
 * Local 2-D coordinate transformations for engineering survey.
 *
 * Helmert (similarity) is the standard 4-parameter fit; affine adds independent
 * scale/skew for local grid distortions. All angles are decimal degrees.
 */

import { type NE, DEG } from "./cogo.ts";

const DEG_RAD = Math.PI / 180;
const EPS = 1e-24;

export interface HelmertTransform {
  scale: number;
  rotationDeg: number;
  translationN: number;
  translationE: number;
}

export interface AffineTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface Residual {
  n: number;
  e: number;
}

export interface TransformDiagnostics {
  residuals: Residual[];
  rmse: number;
  maxOffset: number;
  maxIndex: number;
}

function centroid(points: NE[]): NE {
  const k = points.length;
  const n = points.reduce((s, p) => s + p.n, 0) / k;
  const e = points.reduce((s, p) => s + p.e, 0) / k;
  return { n, e };
}

/** Apply a Helmert transform to a point. */
export function applyHelmert(p: NE, t: HelmertTransform): NE {
  const r = t.rotationDeg * DEG_RAD;
  const sn = Math.sin(r);
  const cs = Math.cos(r);
  return {
    n: t.translationN + t.scale * (cs * p.n - sn * p.e),
    e: t.translationE + t.scale * (sn * p.n + cs * p.e),
  };
}

/** Return the inverse Helmert transform. */
export function inverseHelmert(t: HelmertTransform): HelmertTransform {
  const r = -t.rotationDeg * DEG_RAD;
  const sn = Math.sin(r);
  const cs = Math.cos(r);
  const s = 1 / t.scale;
  return {
    scale: s,
    rotationDeg: -t.rotationDeg,
    translationN: -(cs * t.translationN - sn * t.translationE) * s,
    translationE: -(sn * t.translationN + cs * t.translationE) * s,
  };
}

/** Fit a 4-parameter Helmert transform from matching control pairs. */
export function fitHelmert(source: NE[], target: NE[]): HelmertTransform | null {
  if (source.length !== target.length || source.length < 2) return null;
  const cs = centroid(source);
  const ct = centroid(target);
  let sumA2 = 0;
  let re = 0;
  let im = 0;
  for (let i = 0; i < source.length; i++) {
    const a = source[i];
    const b = target[i];
    const an = a.n - cs.n;
    const ae = a.e - cs.e;
    const bn = b.n - ct.n;
    const be = b.e - ct.e;
    sumA2 += an * an + ae * ae;
    re += ae * be + an * bn;
    im += ae * bn - an * be;
  }
  if (sumA2 < EPS) return null;
  const sRe = re / sumA2;
  const sIm = im / sumA2;
  const scale = Math.hypot(sRe, sIm);
  const rotationDeg = -Math.atan2(sIm, sRe) * DEG;
  if (!Number.isFinite(scale) || !Number.isFinite(rotationDeg)) return null;
  const r = rotationDeg * DEG_RAD;
  const sn = Math.sin(r);
  const csRot = Math.cos(r);
  return {
    scale,
    rotationDeg,
    translationN: ct.n - scale * (csRot * cs.n - sn * cs.e),
    translationE: ct.e - scale * (sn * cs.n + csRot * cs.e),
  };
}

/** Residuals for a Helmert transform. */
export function helmertResiduals(
  transform: HelmertTransform,
  source: NE[],
  target: NE[],
): Residual[] | null {
  if (source.length !== target.length) return null;
  return source.map((s, i) => {
    const p = applyHelmert(s, transform);
    return { n: target[i].n - p.n, e: target[i].e - p.e };
  });
}

function residualMagnitude(r: Residual): number {
  return Math.hypot(r.n, r.e);
}

function computeDiagnostics(
  residuals: Residual[],
): TransformDiagnostics {
  let sumSq = 0;
  let maxOffset = 0;
  let maxIndex = 0;
  residuals.forEach((r, i) => {
    const m = residualMagnitude(r);
    sumSq += m * m;
    if (m > maxOffset) {
      maxOffset = m;
      maxIndex = i;
    }
  });
  const rmse = residuals.length ? Math.sqrt(sumSq / residuals.length) : 0;
  return { residuals, rmse, maxOffset, maxIndex };
}

/** Diagnostics for a Helmert transform. */
export function helmertDiagnostics(
  transform: HelmertTransform,
  source: NE[],
  target: NE[],
): TransformDiagnostics | null {
  const residuals = helmertResiduals(transform, source, target);
  if (!residuals) return null;
  return computeDiagnostics(residuals);
}

/**
 * Detect outliers in matching point pairs. Fits a Helmert transform to all
 * points and returns indices whose residual magnitude exceeds
 * `thresholdMultiplier * rmse`.
 */
export function detectOutliers(
  source: NE[],
  target: NE[],
  thresholdMultiplier: number,
): number[] | null {
  if (source.length !== target.length || thresholdMultiplier <= 0) return null;
  const transform = fitHelmert(source, target);
  if (!transform) return null;
  const diag = helmertDiagnostics(transform, source, target);
  if (!diag) return null;
  if (diag.rmse < 1e-12) return [];
  const cutoff = thresholdMultiplier * diag.rmse;
  return diag.residuals
    .map((r, i) => ({ i, m: residualMagnitude(r) }))
    .filter(({ m }) => m > cutoff)
    .map(({ i }) => i);
}

/** Apply an affine transform to a point. */
export function applyAffine(p: NE, t: AffineTransform): NE {
  return {
    n: t.a * p.n + t.b * p.e + t.c,
    e: t.d * p.n + t.e * p.e + t.f,
  };
}

/** Inverse of an affine transform, or null if singular. */
export function inverseAffine(t: AffineTransform): AffineTransform | null {
  const det = t.a * t.e - t.b * t.d;
  if (Math.abs(det) < EPS) return null;
  const invDet = 1 / det;
  const aInv = t.e * invDet;
  const bInv = -t.b * invDet;
  const dInv = -t.d * invDet;
  const eInv = t.a * invDet;
  return {
    a: aInv,
    b: bInv,
    c: -(aInv * t.c + bInv * t.f),
    d: dInv,
    e: eInv,
    f: -(dInv * t.c + eInv * t.f),
  };
}

/** Fit a 6-parameter affine transform from matching control pairs. */
export function fitAffine(source: NE[], target: NE[]): AffineTransform | null {
  if (source.length !== target.length || source.length < 3) return null;
  const n = source.length;
  const ata: number[][] = Array.from({ length: 6 }, () => Array(6).fill(0));
  const aty: number[] = Array(6).fill(0);
  for (let i = 0; i < n; i++) {
    const sn = source[i].n;
    const se = source[i].e;
    const tn = target[i].n;
    const te = target[i].e;
    const rowN = [sn, se, 1, 0, 0, 0];
    const rowE = [0, 0, 0, sn, se, 1];
    for (let r = 0; r < 6; r++) {
      aty[r] += rowN[r] * tn + rowE[r] * te;
      for (let c = 0; c < 6; c++) {
        ata[r][c] += rowN[r] * rowN[c] + rowE[r] * rowE[c];
      }
    }
  }
  const x = solve6x6(ata, aty);
  if (!x) return null;
  return { a: x[0], b: x[1], c: x[2], d: x[3], e: x[4], f: x[5] };
}

/** Residuals for an affine transform. */
export function affineResiduals(
  transform: AffineTransform,
  source: NE[],
  target: NE[],
): Residual[] | null {
  if (source.length !== target.length) return null;
  return source.map((s, i) => {
    const p = applyAffine(s, transform);
    return { n: target[i].n - p.n, e: target[i].e - p.e };
  });
}

/** Diagnostics for an affine transform. */
export function affineDiagnostics(
  transform: AffineTransform,
  source: NE[],
  target: NE[],
): TransformDiagnostics | null {
  const residuals = affineResiduals(transform, source, target);
  if (!residuals) return null;
  return computeDiagnostics(residuals);
}

function solve6x6(a: number[][], b: number[]): number[] | null {
  const m = a.map((row) => [...row]);
  const y = [...b];
  for (let col = 0; col < 6; col++) {
    let pivotRow = col;
    let pivotVal = Math.abs(m[col][col]);
    for (let row = col + 1; row < 6; row++) {
      if (Math.abs(m[row][col]) > pivotVal) {
        pivotRow = row;
        pivotVal = Math.abs(m[row][col]);
      }
    }
    if (pivotVal < EPS) return null;
    if (pivotRow !== col) {
      [m[col], m[pivotRow]] = [m[pivotRow], m[col]];
      [y[col], y[pivotRow]] = [y[pivotRow], y[col]];
    }
    for (let row = col + 1; row < 6; row++) {
      const factor = m[row][col] / m[col][col];
      y[row] -= factor * y[col];
      for (let k = col; k < 6; k++) {
        m[row][k] -= factor * m[col][k];
      }
    }
  }
  const x = Array(6).fill(0);
  for (let i = 5; i >= 0; i--) {
    let sum = y[i];
    for (let j = i + 1; j < 6; j++) {
      sum -= m[i][j] * x[j];
    }
    x[i] = sum / m[i][i];
  }
  return x;
}
