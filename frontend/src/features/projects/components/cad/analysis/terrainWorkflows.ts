import type { CadModelState } from "../cadModel.ts";
import { analyseTerrain, terrainStats, slopeColor, lastTerrainBackend } from "../survey/terrainBridge.ts";
import { fmtArea } from "../survey/format.ts";
import { buildTerrainReport } from "../io/report.ts";
import type { WorkflowApi, WorkflowServices } from "./workflowCtx.ts";

// ── Aspect shading palette (8-wind sector, conventional N…NW ramp) ──────────

export function aspectColor(aspectDeg: number | null): string {
  // Flat triangles (null aspect) render neutral grey.
  if (aspectDeg == null || !Number.isFinite(aspectDeg)) return "#64748b";
  const ASPECT_COLORS = [
    "#dc2626", // N
    "#f97316", // NE
    "#eab308", // E
    "#84cc16", // SE
    "#16a34a", // S
    "#0d9488", // SW
    "#3b82f6", // W
    "#8b5cf6", // NW
  ];
  const sector = Math.floor((((aspectDeg % 360) + 360) % 360 + 22.5) / 45) % 8;
  return ASPECT_COLORS[sector];
}

// ── Terrain analysis (slope / aspect / 3D area) ────────────────────────────

export async function runTerrainAnalysis(model: CadModelState, api: WorkflowApi, services: WorkflowServices): Promise<void> {
  const surface = model.surfaces.find((s) => !s.cutFill && !s.slopeShade)
    ?? model.surfaces[model.surfaces.length - 1];
  if (!surface) {
    services.log("Terrain: build a TIN surface first (Surface ▸ Build TIN).", "error");
    return;
  }
  const tin = { points: surface.points, triangles: surface.triangles };
  const mode = await services.dialog.select(
    "Terrain shading mode:",
    ["Slope shading (steepness ramp)", "Aspect shading (8-wind sector)"],
  );
  if (mode == null) return;
  const asAspect = mode.startsWith("Aspect");

  services.log("Analysing terrain…");
  const [tris, stats] = await Promise.all([analyseTerrain(tin), terrainStats(tin)]);
  if (!stats || tris.length === 0) {
    services.log("Terrain: analysis produced no triangles.", "error");
    return;
  }
  const maxSlope = stats.maxSlopeDeg > 0 ? stats.maxSlopeDeg : 1;
  const shadeTris = tris.map((t) => {
    const tri = surface.triangles[t.index];
    return {
      a: tri.a,
      b: tri.b,
      c: tri.c,
      slopeDeg: t.slopeDeg,
      color: asAspect ? aspectColor(t.aspectDeg) : slopeColor(t.slopeDeg, maxSlope),
    };
  });
  api.addSurface({
    name: `${asAspect ? "Aspect" : "Slope"} shade — ${surface.name}`,
    points: surface.points,
    triangles: surface.triangles,
    layerId: surface.layerId,
    slopeShade: { triangles: shadeTris, maxSlope },
  });
  services.show3d();
  services.fitExtents();
  services.log(
    `Terrain "${surface.name}" — mean slope ${stats.meanSlopeDeg.toFixed(2)}° ` +
      `(${stats.minSlopeDeg.toFixed(1)}–${stats.maxSlopeDeg.toFixed(1)}°), ` +
      `3D area ${fmtArea(stats.surfaceArea)} vs plan ${fmtArea(stats.planArea)} (${lastTerrainBackend()}). ` +
      `Slope shade shown in 3D.`,
  );
  const body = buildTerrainReport(services.projectName, services.projectId, surface.name, stats);
  services.openReport(`Terrain Analysis — ${services.projectName}`, body);
}
