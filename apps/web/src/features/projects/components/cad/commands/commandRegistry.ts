import type { CommandContext } from "../useCadCommands.ts";
import { runCommand } from "../useCadCommands.ts";
import type { CadToolId } from "../cadModel.ts";

/**
 * Workspace-level callbacks the registry needs beyond CommandContext.
 *
 * Beyond the planned members (deleteSelection … toggle3d) the following were
 * required to port every ribbon branch verbatim without re-importing model
 * state: openLayout, exportCutFillReport, processLinework, computeConvexHull,
 * simplifySelection, reprojectDrawing, buildSurface, buildSurfaceWithBreaklines,
 * buildBoundarySurface, buildContours, computeVolumeToElevation,
 * computeVolumeBetween, analyseSurfaceTerrain, extractProfile.
 */
export interface RegistryHost extends CommandContext {
  cad: CommandContext["cad"];
  deleteSelection(): void;
  explodeSelection(): void;
  openProjectPoints(): void;
  openImportDxf(): void;
  importGeoJson(): void;
  exportDxf(): void;
  exportCsv(): void;
  exportReport(): void;
  exportGeoJson(): Promise<void>;
  exportCutFillReport(): Promise<void>;
  openLayout(): void;
  runIntersection(): void;
  runInverse(): void;
  runArea(): void;
  labelBoundarySegments(): void;
  labelArea(): void;
  labelCoordinates(): void;
  processLinework(): void;
  computeConvexHull(): void;
  simplifySelection(): void;
  reprojectDrawing(): void;
  buildSurface(): void;
  buildSurfaceWithBreaklines(): void;
  buildBoundarySurface(): void;
  buildContours(): void;
  computeVolumeToElevation(): void;
  computeVolumeBetween(): void;
  analyseSurfaceTerrain(): void;
  extractProfile(): void;
  toggleView(key: "snap" | "ortho" | "grid" | "osnap"): void;
  toggle3d(): void;
}

export interface CommandEntry {
  id: string;                 // canonical: ribbon group:sub, e.g. "surface:tin"
  menuAliases?: string[];     // menu action ids mapping here, e.g. ["file:export-dxf"]
  run(host: RegistryHost): void;
}

/**
 * Legacy switch semantics: unknown subs inside these groups fell through the
 * old handleRibbonAction switch WITHOUT logging; every other unknown id logged
 * "Unhandled action: X" (error). The "tool" group dispatched any sub to
 * changeTool. Both behaviours are replicated by runRibbon's miss path.
 */
const SILENT_GROUPS = new Set(["zoom", "edit", "project", "import", "plot", "export"]);

export function buildCommandRegistry(entries: CommandEntry[]): {
  runRibbon(actionId: string, host: RegistryHost): void;
  runMenu(action: string, host: RegistryHost): void;
} {
  const byId = new Map<string, CommandEntry>();
  const byAlias = new Map<string, CommandEntry>();
  for (const entry of entries) {
    byId.set(entry.id, entry);
    for (const alias of entry.menuAliases ?? []) byAlias.set(alias, entry);
  }

  return {
    runRibbon(actionId: string, host: RegistryHost): void {
      const entry = byId.get(actionId);
      if (entry) {
        entry.run(host);
        return;
      }
      const [group, sub] = actionId.split(":");
      if (group === "tool") {
        host.setTool(sub as CadToolId);
        return;
      }
      if (SILENT_GROUPS.has(group)) return;
      host.log(`Unhandled action: ${actionId}`, "error");
    },
    runMenu(action: string, host: RegistryHost): void {
      const entry = byId.get(action) ?? byAlias.get(action);
      entry?.run(host);
    },
  };
}

export const DEFAULT_COMMAND_ENTRIES: CommandEntry[] = [
  // ── Tools ────────────────────────────────────────────────────────────────
  { id: "tool:select", run: (host) => host.setTool("select") },
  { id: "tool:pan", run: (host) => host.setTool("pan") },
  { id: "tool:zoom-window", run: (host) => host.setTool("zoom-window") },
  { id: "tool:move", run: (host) => host.setTool("move") },
  { id: "tool:copy", run: (host) => host.setTool("copy") },
  { id: "tool:rotate", run: (host) => host.setTool("rotate") },
  { id: "tool:scale", run: (host) => host.setTool("scale") },
  { id: "tool:mirror", run: (host) => host.setTool("mirror") },
  { id: "tool:offset", run: (host) => host.setTool("offset") },
  { id: "tool:point", run: (host) => host.setTool("point") },
  { id: "tool:control-point", run: (host) => host.setTool("control-point") },
  { id: "tool:line", run: (host) => host.setTool("line") },
  { id: "tool:boundary", run: (host) => host.setTool("boundary") },
  { id: "tool:circle", run: (host) => host.setTool("circle") },
  { id: "tool:arc", run: (host) => host.setTool("arc") },
  { id: "tool:text", run: (host) => host.setTool("text") },
  { id: "tool:spot-height", run: (host) => host.setTool("spot-height") },
  { id: "tool:dim-linear", run: (host) => host.setTool("dim-linear") },
  { id: "tool:measure", run: (host) => host.setTool("measure") },

  // ── Navigate / Edit ──────────────────────────────────────────────────────
  {
    id: "zoom:extents",
    menuAliases: ["view:zoom-extents"],
    run: (host) => {
      host.fitExtents();
      host.log("Zoom extents.");
    },
  },
  {
    id: "edit:undo",
    run: (host) => {
      if (host.cad.undo()) host.log("Undo.");
      else host.log("Nothing to undo.", "info");
    },
  },
  {
    id: "edit:redo",
    run: (host) => {
      if (host.cad.redo()) host.log("Redo.");
      else host.log("Nothing to redo.", "info");
    },
  },
  { id: "edit:delete", run: (host) => host.deleteSelection() },
  { id: "edit:explode", run: (host) => host.explodeSelection() },

  // ── Data / IO ────────────────────────────────────────────────────────────
  {
    id: "project:points",
    menuAliases: ["file:project-points"],
    run: (host) => host.openProjectPoints(),
  },
  {
    id: "import:dxf",
    menuAliases: ["file:import-dxf"],
    run: (host) => host.openImportDxf(),
  },
  { id: "f2f:linework", run: (host) => host.processLinework() },
  { id: "plot:layout", run: (host) => host.openLayout() },
  {
    id: "export:dxf",
    menuAliases: ["file:export-dxf"],
    run: (host) => host.exportDxf(),
  },
  {
    id: "export:csv",
    menuAliases: ["file:export-csv"],
    run: (host) => host.exportCsv(),
  },
  { id: "export:report", run: (host) => host.exportReport() },
  {
    id: "export:geojson",
    menuAliases: ["file:export-geojson"],
    run: (host) => void host.exportGeoJson(),
  },
  { id: "file:import-geojson", run: (host) => host.importGeoJson() },

  // ── Geometry / COGO ──────────────────────────────────────────────────────
  { id: "geom:hull", run: (host) => void host.computeConvexHull() },
  { id: "geom:simplify", run: (host) => void host.simplifySelection() },
  { id: "geom:reproject", run: (host) => void host.reprojectDrawing() },
  { id: "cogo:intersection", run: (host) => host.runIntersection() },
  { id: "cogo:inverse", run: (host) => host.runInverse() },
  { id: "cogo:area", run: (host) => host.runArea() },
  {
    id: "cogo:bearing-distance",
    run: (host) => {
      host.log('Switch to the COGO panel (right) to run "bearing-distance".', "info");
    },
  },
  {
    id: "cogo:traverse",
    run: (host) => {
      host.log('Switch to the COGO panel (right) to run "traverse".', "info");
    },
  },

  // ── Surfaces ─────────────────────────────────────────────────────────────
  { id: "surface:tin", run: (host) => void host.buildSurface() },
  { id: "surface:tin-breaklines", run: (host) => void host.buildSurfaceWithBreaklines() },
  { id: "surface:boundary", run: (host) => void host.buildBoundarySurface() },
  { id: "surface:contours", run: (host) => void host.buildContours() },
  { id: "surface:volume-elevation", run: (host) => void host.computeVolumeToElevation() },
  { id: "surface:volume-between", run: (host) => void host.computeVolumeBetween() },
  { id: "surface:terrain", run: (host) => void host.analyseSurfaceTerrain() },
  { id: "surface:profile", run: (host) => void host.extractProfile() },
  { id: "surface:cutfill-report", run: (host) => void host.exportCutFillReport() },
  {
    id: "surface:clear-contours",
    run: (host) => {
      const contours = host.cad.model.linework.filter(
        (lw) => lw.layerId === "CONTOURS" || lw.layerId === "CONTOURS_INDEX",
      );
      if (contours.length === 0) {
        host.log("No contours to clear.", "info");
        return;
      }
      host.cad.beginTransaction();
      try {
        for (const lw of contours) host.cad.deleteLinework(lw.id);
      } finally {
        host.cad.endTransaction();
      }
      host.log(`Cleared ${contours.length} contour line(s).`);
    },
  },
  {
    id: "surface:clear-surfaces",
    run: (host) => {
      const surfaces = [...host.cad.model.surfaces];
      if (surfaces.length === 0) {
        host.log("No surfaces to clear.", "info");
        return;
      }
      host.cad.beginTransaction();
      try {
        for (const s of surfaces) host.cad.deleteSurface(s.id);
      } finally {
        host.cad.endTransaction();
      }
      host.log(`Cleared ${surfaces.length} surface(s).`);
    },
  },

  // ── Annotate / Commands ──────────────────────────────────────────────────
  { id: "annotate:label-boundary", run: (host) => host.labelBoundarySegments() },
  { id: "annotate:label-area", run: (host) => host.labelArea() },
  { id: "annotate:label-coord", run: (host) => host.labelCoordinates() },
  { id: "cmd:hatch", run: (host) => runCommand("HATCH", host) },

  // ── Menu-only views ──────────────────────────────────────────────────────
  { id: "view:grid", run: (host) => host.toggleView("grid") },
  { id: "view:snap", run: (host) => host.toggleView("snap") },
  { id: "view:osnap", run: (host) => host.toggleView("osnap") },
  { id: "view:ortho", run: (host) => host.toggleView("ortho") },
  { id: "view:3d", run: (host) => host.toggle3d() },
];
