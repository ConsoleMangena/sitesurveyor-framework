import type { CadModelState, CadSelection } from "../cadModel.ts";
import {
  convexHull,
  simplify as simplifyLine,
  lastGeomBackend,
} from "../survey/geomBridge.ts";
import { reproject, lastReprojectBackend } from "../survey/reprojectBridge.ts";
import { PROJECTION_PRESETS } from "../survey/projection.ts";
import type { WorkflowApi, WorkflowServices } from "./workflowCtx.ts";

// ── Geometry (GeoRust geo) ─────────────────────────────────────────────────

export async function runConvexHull(model: CadModelState, api: WorkflowApi, services: WorkflowServices): Promise<void> {
  if (model.points.length < 3) {
    services.log("Convex hull: need at least 3 points.", "error");
    return;
  }
  const hull = await convexHull(model.points.map((p) => ({ n: p.n, e: p.e })));
  if (hull.length < 3) {
    services.log("Convex hull: degenerate point set.", "error");
    return;
  }
  api.ensureLayerById("BOUNDARY");
  api.addLinework({
    kind: "boundary",
    vertices: hull.map((v) => ({ n: v.n, e: v.e })),
    closed: true,
    layerId: "BOUNDARY",
  });
  services.log(`Convex hull: ${hull.length}-vertex boundary on the Boundary layer (${lastGeomBackend()}).`);
}

export async function runSimplifySelection(model: CadModelState, selection: CadSelection, api: WorkflowApi, services: WorkflowServices): Promise<void> {
  const id = selection.type === "linework" ? selection.id : null;
  const target = id ? model.linework.find((l) => l.id === id) : undefined;
  if (!target) {
    services.log("Simplify: select a polyline/boundary first.", "error");
    return;
  }
  const epsRaw = await services.dialog.prompt("Simplify tolerance (m):", "0.5");
  if (epsRaw == null) return;
  const eps = parseFloat(epsRaw);
  if (!Number.isFinite(eps) || eps <= 0) {
    services.log("Simplify: tolerance must be a positive number.", "error");
    return;
  }
  const simplified = await simplifyLine(target.vertices.map((v) => ({ n: v.n, e: v.e })), eps);
  api.updateLinework(target.id, { vertices: simplified.map((v) => ({ n: v.n, e: v.e })) });
  services.log(
    `Simplified ${target.vertices.length} → ${simplified.length} vertices at ${eps} m (${lastGeomBackend()}).`,
  );
}

// ── Reprojection (GeoRust proj on desktop, Karney fallback on web) ─────────

export async function runReproject(model: CadModelState, api: WorkflowApi, services: WorkflowServices): Promise<void> {
  if (!model.points.length && !model.linework.length && !model.texts.length && !model.surfaces.length) {
    services.log("Reproject: nothing to transform.", "error");
    return;
  }
  // Build a "from → to" selection from the available CRS presets. Keep the
  // prompt simple: a number for source and target from the preset list.
  const menu = PROJECTION_PRESETS.map((p, i) => `${i + 1}. ${p.label}`).join("\n");
  const fromRaw = await services.dialog.prompt(`Source CRS:\n${menu}`, "1");
  if (fromRaw == null) return;
  const toRaw = await services.dialog.prompt(`Target CRS:\n${menu}`, "6");
  if (toRaw == null) return;
  const fromIdx = parseInt(fromRaw, 10) - 1;
  const toIdx = parseInt(toRaw, 10) - 1;
  const from = PROJECTION_PRESETS[fromIdx];
  const to = PROJECTION_PRESETS[toIdx];
  if (!from || !to) {
    services.log("Reproject: invalid CRS selection.", "error");
    return;
  }
  if (from.id === to.id) {
    services.log("Reproject: source and target CRS are the same.", "info");
    return;
  }

  type ReprojTarget =
    | { type: "point"; id: string }
    | { type: "linework"; id: string; index: number }
    | { type: "text"; id: string }
    | { type: "surface"; id: string; index: number };

  const input: { n: number; e: number; target: ReprojTarget }[] = [];
  for (const p of model.points) input.push({ n: p.n, e: p.e, target: { type: "point", id: p.id } });
  for (const lw of model.linework) {
    lw.vertices.forEach((v, i) => input.push({ n: v.n, e: v.e, target: { type: "linework", id: lw.id, index: i } }));
  }
  for (const t of model.texts) input.push({ n: t.n, e: t.e, target: { type: "text", id: t.id } });
  for (const s of model.surfaces) {
    s.points.forEach((p, i) => input.push({ n: p.n, e: p.e, target: { type: "surface", id: s.id, index: i } }));
  }

  try {
    const coords = input.map((x) => ({ n: x.n, e: x.e }));
    const out = await reproject(from, to, coords);
    // Buffer updates so each entity is written once.
    const lineworkPatches = new Map<string, { n: number; e: number }[]>();
    const surfacePatches = new Map<string, { n: number; e: number; z: number }[]>();
    let count = 0;
    out.forEach((v, i) => {
      const t = input[i].target;
      count += 1;
      if (t.type === "point") {
        api.updatePoint(t.id, { n: v.n, e: v.e });
      } else if (t.type === "linework") {
        const verts = lineworkPatches.get(t.id) ?? [...model.linework.find((l) => l.id === t.id)!.vertices];
        verts[t.index] = { n: v.n, e: v.e };
        lineworkPatches.set(t.id, verts);
      } else if (t.type === "text") {
        api.updateText(t.id, { n: v.n, e: v.e });
      } else {
        const pts = surfacePatches.get(t.id) ?? [...model.surfaces.find((s) => s.id === t.id)!.points];
        pts[t.index] = { ...pts[t.index], n: v.n, e: v.e };
        surfacePatches.set(t.id, pts);
      }
    });
    for (const [id, vertices] of lineworkPatches) api.updateLinework(id, { vertices });
    for (const [id, points] of surfacePatches) api.updateSurface(id, { points });
    services.log(
      `Reprojected ${count} vertex/entity(ies): ${from.label} → ${to.label} (${lastReprojectBackend()}).`,
    );
    if (lastReprojectBackend() === "karney") {
      services.log(
        "Used the in-app projection (no datum shift). Build the desktop app with PROJ for full datum transforms.",
        "info",
      );
    }
    services.fitExtents();
  } catch (err) {
    services.log(`Reproject failed: ${err instanceof Error ? err.message : String(err)}`, "error");
  }
}
