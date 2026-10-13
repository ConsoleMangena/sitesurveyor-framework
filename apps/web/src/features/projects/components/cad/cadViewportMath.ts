/**
 * Viewport transforms between survey coordinates (N, E) and screen pixels.
 *
 * Screen convention: x increases right, y increases DOWN.
 * Survey convention: E increases right (→ x), N increases UP (→ -y).
 */
import type { Viewport } from "./cadModel.ts";

export interface ScreenSize {
  width: number;
  height: number;
}

/** Survey (N,E) -> screen pixel (x,y). */
export function worldToScreen(
  n: number,
  e: number,
  vp: Viewport,
  size: ScreenSize,
): { x: number; y: number } {
  const x = size.width / 2 + (e - vp.centerE) * vp.scale;
  const y = size.height / 2 - (n - vp.centerN) * vp.scale;
  return { x, y };
}

/** Screen pixel (x,y) -> survey (N,E). */
export function screenToWorld(
  x: number,
  y: number,
  vp: Viewport,
  size: ScreenSize,
): { n: number; e: number } {
  const e = vp.centerE + (x - size.width / 2) / vp.scale;
  const n = vp.centerN - (y - size.height / 2) / vp.scale;
  return { n, e };
}

/** Zoom around an anchor screen point, keeping that world point fixed. */
export function zoomAt(
  vp: Viewport,
  factor: number,
  anchorX: number,
  anchorY: number,
  size: ScreenSize,
  minScale = 1e-4,
  maxScale = 1e5,
): Viewport {
  const before = screenToWorld(anchorX, anchorY, vp, size);
  const scale = Math.min(maxScale, Math.max(minScale, vp.scale * factor));
  const next: Viewport = { ...vp, scale };
  const after = screenToWorld(anchorX, anchorY, next, size);
  return {
    scale,
    centerN: vp.centerN + (before.n - after.n),
    centerE: vp.centerE + (before.e - after.e),
  };
}

export interface BBox {
  minN: number;
  maxN: number;
  minE: number;
  maxE: number;
}

/** Fit a viewport to a bounding box with padding (fraction of size). */
export function fitToBox(box: BBox, size: ScreenSize, pad = 0.12): Viewport {
  const spanN = Math.max(box.maxN - box.minN, 1);
  const spanE = Math.max(box.maxE - box.minE, 1);
  const usableW = size.width * (1 - pad * 2);
  const usableH = size.height * (1 - pad * 2);
  const scale = Math.max(1e-4, Math.min(usableW / spanE, usableH / spanN));
  return {
    scale,
    centerN: (box.minN + box.maxN) / 2,
    centerE: (box.minE + box.maxE) / 2,
  };
}

/**
 * Choose a "nice" grid spacing (in survey units) so that the on-screen
 * spacing is roughly the target pixel size.
 */
export function niceGridSpacing(vp: Viewport, targetPx = 64): number {
  const worldPerTarget = targetPx / vp.scale;
  const pow = Math.pow(10, Math.floor(Math.log10(worldPerTarget)));
  const candidates = [1, 2, 5, 10].map((m) => m * pow);
  let best = candidates[0];
  let bestErr = Infinity;
  for (const c of candidates) {
    const err = Math.abs(c * vp.scale - targetPx);
    if (err < bestErr) {
      bestErr = err;
      best = c;
    }
  }
  return best;
}
