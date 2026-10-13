/**
 * Pure snapping helpers for the CAD viewport: grid snap, ortho constraint
 * and object-snap (osnap) search. All geometry is projected to screen space
 * by a caller-supplied projector so these helpers stay independent of any
 * viewport state.
 */
import type { CadModelState } from "../cadModel.ts";

export type OsnapKind = "endpoint" | "midpoint" | "node";

export interface OsnapHit {
  world: { n: number; e: number };
  screen: { x: number; y: number };
  kind: OsnapKind;
}

export interface ScreenProjector {
  (w: { n: number; e: number }): { x: number; y: number };
}

/** Osnap search radius in screen pixels (moved verbatim from CadViewport). */
export const OSNAP_TOL_PX = 12;

/** Round a world coordinate onto the grid when snapping is enabled. */
export function applyGridSnap(
  world: { n: number; e: number },
  spacing: number,
  enabled: boolean,
): { n: number; e: number } {
  if (!enabled) return world;
  return {
    n: Math.round(world.n / spacing) * spacing,
    e: Math.round(world.e / spacing) * spacing,
  };
}

/**
 * Constrain `world` to the horizontal/vertical line through the previous
 * vertex (whichever axis dominates the movement). With no previous vertex
 * the input is returned unchanged.
 */
export function orthoConstraint(
  world: { n: number; e: number },
  last: { n: number; e: number } | null,
): { n: number; e: number } {
  if (!last) return world;
  const dn = Math.abs(world.n - last.n);
  const de = Math.abs(world.e - last.e);
  return dn >= de ? { n: world.n, e: last.e } : { n: last.n, e: world.e };
}

/**
 * Find the strongest osnap candidate within `tolPx` screen pixels of (x, y).
 *
 * Candidates, in scan order: survey points (nodes), linework vertices and
 * segment midpoints (plus the closing midpoint of closed rings), arc
 * endpoints and mid-angle point, circle/ellipse centres, dimension
 * definition points and hatch vertices. Entities on hidden layers are
 * skipped. Ties at equal distance go to the later candidate (`<=` compare).
 */
export function findOsnapHit(
  model: CadModelState,
  project: ScreenProjector,
  x: number,
  y: number,
  tolPx: number = OSNAP_TOL_PX,
): OsnapHit | null {
  let best: OsnapHit | null = null;
  let bestDist = tolPx;

  const consider = (w: { n: number; e: number }, kind: OsnapKind) => {
    const s = project(w);
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= bestDist) {
      bestDist = d;
      best = { world: w, screen: s, kind };
    }
  };

  for (const p of model.points) {
    if (!isLayerVisible(model, p.layerId)) continue;
    consider({ n: p.n, e: p.e }, "node");
  }
  for (const lw of model.linework) {
    if (!isLayerVisible(model, lw.layerId)) continue;
    for (let i = 0; i < lw.vertices.length; i++) {
      consider(lw.vertices[i], "endpoint");
      if (i > 0) {
        const a = lw.vertices[i - 1];
        const b = lw.vertices[i];
        consider({ n: (a.n + b.n) / 2, e: (a.e + b.e) / 2 }, "midpoint");
      }
    }
    if (lw.closed && lw.vertices.length > 2) {
      const a = lw.vertices[lw.vertices.length - 1];
      const b = lw.vertices[0];
      consider({ n: (a.n + b.n) / 2, e: (a.e + b.e) / 2 }, "midpoint");
    }
  }
  for (const a of model.arcs) {
    if (!isLayerVisible(model, a.layerId)) continue;
    const r = a.radius;
    const toWorld = (deg: number) => {
      const rad = deg * (Math.PI / 180);
      return { n: a.center.n + Math.sin(rad) * r, e: a.center.e + Math.cos(rad) * r };
    };
    consider(toWorld(a.startAngle), "endpoint");
    consider(toWorld(a.endAngle), "endpoint");
    consider(toWorld((a.startAngle + a.endAngle) / 2), "midpoint");
  }
  for (const c of model.circles) {
    if (!isLayerVisible(model, c.layerId)) continue;
    consider(c.center, "node");
  }
  for (const el of model.ellipses) {
    if (!isLayerVisible(model, el.layerId)) continue;
    consider(el.center, "node");
  }
  for (const d of model.dimensions) {
    if (!isLayerVisible(model, d.layerId)) continue;
    for (const v of d.defPoints) consider(v, "endpoint");
  }
  for (const h of model.hatches) {
    if (!isLayerVisible(model, h.layerId)) continue;
    for (const v of h.vertices) consider(v, "endpoint");
  }
  return best;
}

/** True when the layer exists and is visible (unknown layers count as visible). */
function isLayerVisible(model: CadModelState, layerId: string): boolean {
  const l = model.layers.find((x) => x.id === layerId);
  return !l || l.visible;
}
