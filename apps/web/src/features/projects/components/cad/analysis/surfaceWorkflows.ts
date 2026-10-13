import type { CadModelState, CadSelection } from "../cadModel.ts";
import {
  buildTin,
  buildConstrainedTin,
  lastBackend,
  type SurfaceConstraint,
} from "../survey/tinBridge.ts";
import { buildCodeTable } from "../survey/featureCodes.ts";
import { buildFeatureStrings } from "../survey/fieldToFinish.ts";
import { surfacePointsOf, type WorkflowApi, type WorkflowServices } from "./workflowCtx.ts";

export async function runBuildSurface(model: CadModelState, api: WorkflowApi, services: WorkflowServices): Promise<void> {
  const pts = surfacePointsOf(model);
  if (pts.length < 3) {
    services.log("Build TIN: need at least 3 points with elevations (Z).", "error");
    return;
  }
  services.log("Building TIN surface…");
  const tin = await buildTin(pts);
  if (tin.triangles.length === 0) {
    services.log("Build TIN: triangulation produced no triangles (collinear points?).", "error");
    return;
  }
  // Replace any previous TOPO surface so repeated clicks do not pile triangles.
  model.surfaces.filter((s) => s.layerId === "TOPO").forEach((s) => api.deleteSurface(s.id));
  const nonTopoCount = model.surfaces.filter((s) => s.layerId !== "TOPO").length;
  const name = `Surface ${nonTopoCount + 1}`;
  api.ensureLayerById("TOPO");
  api.addSurface({ name, points: tin.points, triangles: tin.triangles, layerId: "TOPO" });
  services.log(`${name}: ${tin.triangles.length} triangles from ${tin.points.length} points (${lastBackend()}).`);
  services.fitExtents();
}

export async function runBuildSurfaceWithBreaklines(
  model: CadModelState,
  selection: CadSelection,
  api: WorkflowApi,
  services: WorkflowServices,
): Promise<void> {
  const pts = surfacePointsOf(model);
  if (pts.length < 3) {
    services.log("Build TIN + Breaklines: need at least 3 points with elevations (Z).", "error");
    return;
  }

  // Breaklines come from coded stringable points and from any selected linework.
  const table = buildCodeTable();
  const { strings } = buildFeatureStrings(model.points, table);
  const breaklines: SurfaceConstraint[] = strings
    .filter((s) => s.breakline)
    .map((s) => ({ vertices: s.vertices.map((v) => ({ n: v.n, e: v.e })) }));

  // Selected linework can act as manual breaklines (and one closed ring as the clip boundary).
  const sel = selection;
  const selectedLwIds = new Set(
    (sel.items ?? [])
      .filter((i) => i.type === "linework")
      .map((i) => i.id)
      .filter(Boolean) as string[],
  );
  if (sel.type === "linework" && sel.id) selectedLwIds.add(sel.id);
  const selectedLws = model.linework.filter((l) => selectedLwIds.has(l.id));

  // Prefer the first selected closed ring as the boundary; remaining selected linework becomes breaklines.
  const boundaryLw = selectedLws.find((l) => l.closed && l.vertices.length >= 3);
  const boundary: SurfaceConstraint | undefined = boundaryLw
    ? { vertices: boundaryLw.vertices.map((v) => ({ n: v.n, e: v.e })) }
    : undefined;
  selectedLws
    .filter((l) => l.id !== boundaryLw?.id)
    .forEach((l) => {
      if (l.vertices.length >= 2) {
        breaklines.push({ vertices: l.vertices.map((v) => ({ n: v.n, e: v.e })) });
      }
    });

  if (breaklines.length === 0 && !boundary) {
    services.log(
      "Build TIN + Breaklines: no breaklines selected and no coded breakline strings found. " +
        "Process linework from coded points or select breakline linework first.",
      "info",
    );
  }

  services.log("Building constrained TIN surface…");
  const tin = await buildConstrainedTin(pts, { breaklines, boundary });
  if (tin.triangles.length === 0) {
    services.log("Build TIN + Breaklines: no triangles produced (check points / boundary).", "error");
    return;
  }
  // Replace any previous TOPO surface so repeated clicks do not pile triangles.
  model.surfaces.filter((s) => s.layerId === "TOPO").forEach((s) => api.deleteSurface(s.id));
  const nonTopoCount = model.surfaces.filter((s) => s.layerId !== "TOPO").length;
  const name = `Surface ${nonTopoCount + 1} (constrained)`;
  api.ensureLayerById("TOPO");
  api.addSurface({ name, points: tin.points, triangles: tin.triangles, layerId: "TOPO" });
  services.log(
    `${name}: ${tin.triangles.length} triangles, ${breaklines.length} breakline(s)` +
      `${boundary ? ", clipped to selected boundary" : ""} (${lastBackend()}).`,
  );
  services.fitExtents();
}

/** TIN clipped to the currently selected closed boundary (no breaklines). */
export async function runBuildBoundarySurface(
  model: CadModelState,
  selection: CadSelection,
  api: WorkflowApi,
  services: WorkflowServices,
): Promise<void> {
  const pts = surfacePointsOf(model);
  if (pts.length < 3) {
    services.log("Boundary Surface: need at least 3 points with elevations (Z).", "error");
    return;
  }
  const sel = selection;
  const selLw = sel.type === "linework" && sel.id
    ? model.linework.find((l) => l.id === sel.id)
    : undefined;
  if (!selLw || !selLw.closed || selLw.vertices.length < 3) {
    services.log("Boundary Surface: select a closed boundary (polyline or boundary) to clip the TIN.", "error");
    return;
  }
  const boundary: SurfaceConstraint = { vertices: selLw.vertices.map((v) => ({ n: v.n, e: v.e })) };
  services.log("Building boundary-clipped TIN surface…");
  const tin = await buildConstrainedTin(pts, { breaklines: [], boundary });
  if (tin.triangles.length === 0) {
    services.log("Boundary Surface: no triangles produced (check points / boundary).", "error");
    return;
  }
  // Replace any previous TOPO surface so repeated clicks do not pile triangles.
  model.surfaces.filter((s) => s.layerId === "TOPO").forEach((s) => api.deleteSurface(s.id));
  const nonTopoCount = model.surfaces.filter((s) => s.layerId !== "TOPO").length;
  const name = `Surface ${nonTopoCount + 1} (boundary)`;
  api.ensureLayerById("TOPO");
  api.addSurface({ name, points: tin.points, triangles: tin.triangles, layerId: "TOPO" });
  services.log(`${name}: ${tin.triangles.length} triangles clipped to selected boundary (${lastBackend()}).`);
  services.fitExtents();
}
