import { describe, expect, it, vi } from "vitest";
import {
  emptyModel,
  type CadModelState,
  type SurveyLinework,
  type SurveySurface,
} from "../cadModel.ts";
import type { UseCadModel } from "../useCadModel.ts";
import { buildCommandRegistry, DEFAULT_COMMAND_ENTRIES, type RegistryHost } from "./commandRegistry.ts";

/** Every actionId emitted by CadRibbon PANELS (all five tabs). */
const RIBBON_IDS = [
  // Home / Navigate
  "tool:select", "tool:pan", "tool:zoom-window", "zoom:extents",
  // Home / Edit
  "edit:undo", "edit:redo", "edit:delete", "edit:explode",
  // Home / Modify
  "tool:move", "tool:copy", "tool:rotate", "tool:scale", "tool:mirror", "tool:offset",
  // Survey / Draw
  "tool:point", "tool:control-point", "tool:line", "tool:boundary", "tool:circle", "tool:arc", "cmd:hatch",
  // Survey / Data
  "project:points", "import:dxf",
  // Survey / Field to Finish
  "f2f:linework",
  // Survey / Geometry
  "geom:hull", "geom:simplify", "geom:reproject",
  // Surface / Terrain
  "surface:tin", "surface:tin-breaklines", "surface:boundary", "surface:contours",
  // Surface / Volumes
  "surface:volume-elevation", "surface:volume-between", "surface:cutfill-report",
  // Surface / Analysis
  "surface:terrain", "surface:profile",
  // Surface / Manage
  "surface:clear-contours", "surface:clear-surfaces",
  // Annotate
  "tool:text", "tool:spot-height", "tool:dim-linear", "annotate:label-coord",
  "annotate:label-boundary", "annotate:label-area", "tool:measure",
  // Output
  "plot:layout", "export:dxf", "export:csv", "export:geojson", "export:report",
];

/** Legacy switch ids never emitted by CadRibbon but handled by the old ribbon dispatch. */
const LEGACY_RIBBON_ONLY_IDS = ["cogo:intersection", "cogo:inverse", "cogo:area", "cogo:bearing-distance", "cogo:traverse"];

const MENU_ONLY_IDS = ["file:import-geojson", "view:grid", "view:snap", "view:osnap", "view:ortho", "view:3d"];

function linework(id: string, layerId: string): SurveyLinework {
  return { id, kind: "polyline", vertices: [{ n: 0, e: 0 }, { n: 10, e: 10 }], closed: false, layerId };
}

function surface(id: string): SurveySurface {
  return { id, name: id, points: [], triangles: [], layerId: "TOPO", visible: true };
}

function stubHost(modelPatch: Partial<CadModelState> = {}) {
  const model: CadModelState = { ...emptyModel(), ...modelPatch };
  const cad = {
    model,
    selection: { type: null, id: null, items: [] },
    undo: vi.fn(() => true),
    redo: vi.fn(() => true),
    beginTransaction: vi.fn(),
    endTransaction: vi.fn(),
    discardTransaction: vi.fn(),
    deleteLinework: vi.fn(),
    deleteSurface: vi.fn(),
  };
  const host: RegistryHost = {
    cad: cad as unknown as UseCadModel,
    bearingFormat: "azimuth",
    axisConvention: "yx",
    setTool: vi.fn(),
    log: vi.fn(),
    fitExtents: vi.fn(),
    layout: undefined,
    deleteSelection: vi.fn(),
    explodeSelection: vi.fn(),
    openProjectPoints: vi.fn(),
    openImportDxf: vi.fn(),
    importGeoJson: vi.fn(),
    exportDxf: vi.fn(),
    exportCsv: vi.fn(),
    exportReport: vi.fn(),
    exportGeoJson: vi.fn(async () => {}),
    exportCutFillReport: vi.fn(async () => {}),
    openLayout: vi.fn(),
    runIntersection: vi.fn(),
    runInverse: vi.fn(),
    runArea: vi.fn(),
    labelBoundarySegments: vi.fn(),
    labelArea: vi.fn(),
    labelCoordinates: vi.fn(),
    processLinework: vi.fn(),
    computeConvexHull: vi.fn(),
    simplifySelection: vi.fn(),
    reprojectDrawing: vi.fn(),
    buildSurface: vi.fn(),
    buildSurfaceWithBreaklines: vi.fn(),
    buildBoundarySurface: vi.fn(),
    buildContours: vi.fn(),
    computeVolumeToElevation: vi.fn(),
    computeVolumeBetween: vi.fn(),
    analyseSurfaceTerrain: vi.fn(),
    extractProfile: vi.fn(),
    toggleView: vi.fn(),
    toggle3d: vi.fn(),
  };
  return { host, cad };
}

describe("commandRegistry routing table", () => {
  const reg = buildCommandRegistry(DEFAULT_COMMAND_ENTRIES);

  it("contains exactly one entry per canonical id (ribbon + legacy + menu-only)", () => {
    const ids = DEFAULT_COMMAND_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [...RIBBON_IDS, ...LEGACY_RIBBON_ONLY_IDS, ...MENU_ONLY_IDS]) {
      expect(ids).toContain(id);
    }
    expect(ids).toHaveLength(RIBBON_IDS.length + LEGACY_RIBBON_ONLY_IDS.length + MENU_ONLY_IDS.length);
  });

  it("routes every legacy ribbon id without throwing", () => {
    for (const id of [...RIBBON_IDS, ...LEGACY_RIBBON_ONLY_IDS]) {
      const { host } = stubHost();
      expect(() => reg.runRibbon(id, host), id).not.toThrow();
    }
  });

  it("routes menu-only entries without throwing", () => {
    for (const id of MENU_ONLY_IDS) {
      const { host } = stubHost();
      expect(() => reg.runMenu(id, host), id).not.toThrow();
    }
  });

  it("routes tool:* ids to setTool with the exact tool id", () => {
    for (const id of RIBBON_IDS.filter((x) => x.startsWith("tool:"))) {
      const { host } = stubHost();
      reg.runRibbon(id, host);
      expect(host.setTool).toHaveBeenCalledWith(id.slice("tool:".length));
      expect(host.log).not.toHaveBeenCalled();
    }
  });

  it("logs 'Unhandled action:' for unknown ids like the old default branch", () => {
    const { host } = stubHost();
    reg.runRibbon("nonexistent:x", host);
    expect(host.log).toHaveBeenCalledWith("Unhandled action: nonexistent:x", "error");
    const other = stubHost();
    reg.runRibbon("bogus", other.host);
    expect(other.host.log).toHaveBeenCalledWith("Unhandled action: bogus", "error");
  });

  it("replicates legacy fallthrough: silent groups stay silent, unknown tools reach setTool", () => {
    const { host } = stubHost();
    reg.runRibbon("zoom:nope", host);
    reg.runRibbon("edit:nope", host);
    reg.runRibbon("project:nope", host);
    reg.runRibbon("import:nope", host);
    reg.runRibbon("plot:nope", host);
    reg.runRibbon("export:nope", host);
    expect(host.log).not.toHaveBeenCalled();

    reg.runRibbon("tool:mystery", host);
    expect(host.setTool).toHaveBeenCalledWith("mystery");
    expect(host.log).not.toHaveBeenCalled();

    reg.runRibbon("f2f:nope", host);
    reg.runRibbon("geom:nope", host);
    reg.runRibbon("cogo:nope", host);
    reg.runRibbon("surface:nope", host);
    reg.runRibbon("annotate:nope", host);
    reg.runRibbon("cmd:nope", host);
    expect(host.log).toHaveBeenNthCalledWith(1, "Unhandled action: f2f:nope", "error");
    expect(host.log).toHaveBeenNthCalledWith(2, "Unhandled action: geom:nope", "error");
    expect(host.log).toHaveBeenNthCalledWith(3, "Unhandled action: cogo:nope", "error");
    expect(host.log).toHaveBeenNthCalledWith(4, "Unhandled action: surface:nope", "error");
    expect(host.log).toHaveBeenNthCalledWith(5, "Unhandled action: annotate:nope", "error");
    expect(host.log).toHaveBeenNthCalledWith(6, "Unhandled action: cmd:nope", "error");
  });

  it("menu aliases hit the same handlers", () => {
    const del = stubHost();
    reg.runMenu("edit:delete", del.host);
    expect(del.host.deleteSelection).toHaveBeenCalledTimes(1);

    const pts = stubHost();
    reg.runMenu("file:project-points", pts.host);
    expect(pts.host.openProjectPoints).toHaveBeenCalledTimes(1);

    const dxfIn = stubHost();
    reg.runMenu("file:import-dxf", dxfIn.host);
    expect(dxfIn.host.openImportDxf).toHaveBeenCalledTimes(1);

    const dxfOut = stubHost();
    reg.runMenu("file:export-dxf", dxfOut.host);
    expect(dxfOut.host.exportDxf).toHaveBeenCalledTimes(1);

    const csv = stubHost();
    reg.runMenu("file:export-csv", csv.host);
    expect(csv.host.exportCsv).toHaveBeenCalledTimes(1);

    const gjOut = stubHost();
    reg.runMenu("file:export-geojson", gjOut.host);
    expect(gjOut.host.exportGeoJson).toHaveBeenCalledTimes(1);

    const ze = stubHost();
    reg.runMenu("view:zoom-extents", ze.host);
    expect(ze.host.fitExtents).toHaveBeenCalledTimes(1);
    expect(ze.host.log).toHaveBeenCalledWith("Zoom extents.");
  });

  it("view toggles and 3D route through their own entries", () => {
    const grid = stubHost();
    reg.runMenu("view:grid", grid.host);
    expect(grid.host.toggleView).toHaveBeenCalledWith("grid");

    const snap = stubHost();
    reg.runMenu("view:snap", snap.host);
    expect(snap.host.toggleView).toHaveBeenCalledWith("snap");

    const osnap = stubHost();
    reg.runMenu("view:osnap", osnap.host);
    expect(osnap.host.toggleView).toHaveBeenCalledWith("osnap");

    const ortho = stubHost();
    reg.runMenu("view:ortho", ortho.host);
    expect(ortho.host.toggleView).toHaveBeenCalledWith("ortho");

    const view3d = stubHost();
    reg.runMenu("view:3d", view3d.host);
    expect(view3d.host.toggle3d).toHaveBeenCalledTimes(1);

    const geojson = stubHost();
    reg.runMenu("file:import-geojson", geojson.host);
    expect(geojson.host.importGeoJson).toHaveBeenCalledTimes(1);
  });

  it("unknown menu actions are silent no-ops (old default: break)", () => {
    const { host } = stubHost();
    reg.runMenu("format:nope", host);
    expect(host.log).not.toHaveBeenCalled();
    expect(host.setTool).not.toHaveBeenCalled();
  });

  it("delegates workflow/IO branches to their host callbacks", () => {
    const cases: Array<[string, keyof RegistryHost]> = [
      ["f2f:linework", "processLinework"],
      ["geom:hull", "computeConvexHull"],
      ["geom:simplify", "simplifySelection"],
      ["geom:reproject", "reprojectDrawing"],
      ["surface:tin", "buildSurface"],
      ["surface:tin-breaklines", "buildSurfaceWithBreaklines"],
      ["surface:boundary", "buildBoundarySurface"],
      ["surface:contours", "buildContours"],
      ["surface:volume-elevation", "computeVolumeToElevation"],
      ["surface:volume-between", "computeVolumeBetween"],
      ["surface:terrain", "analyseSurfaceTerrain"],
      ["surface:profile", "extractProfile"],
      ["surface:cutfill-report", "exportCutFillReport"],
      ["annotate:label-boundary", "labelBoundarySegments"],
      ["annotate:label-area", "labelArea"],
      ["annotate:label-coord", "labelCoordinates"],
      ["cogo:intersection", "runIntersection"],
      ["cogo:inverse", "runInverse"],
      ["cogo:area", "runArea"],
      ["plot:layout", "openLayout"],
      ["export:report", "exportReport"],
    ];
    for (const [id, member] of cases) {
      const { host } = stubHost();
      reg.runRibbon(id, host);
      expect(host[member], id).toHaveBeenCalledTimes(1);
    }
  });

  it("keeps the COGO-panel info nudges verbatim", () => {
    const { host } = stubHost();
    reg.runRibbon("cogo:bearing-distance", host);
    reg.runRibbon("cogo:traverse", host);
    expect(host.log).toHaveBeenNthCalledWith(
      1,
      'Switch to the COGO panel (right) to run "bearing-distance".',
      "info",
    );
    expect(host.log).toHaveBeenNthCalledWith(
      2,
      'Switch to the COGO panel (right) to run "traverse".',
      "info",
    );
  });

  it("zoom:extents fits then logs exactly once", () => {
    const { host } = stubHost();
    reg.runRibbon("zoom:extents", host);
    expect(host.fitExtents).toHaveBeenCalledTimes(1);
    expect(host.log).toHaveBeenCalledTimes(1);
    expect(host.log).toHaveBeenCalledWith("Zoom extents.");
  });

  it("edit:undo/edit:redo log success and fallback strings", () => {
    const ok = stubHost();
    reg.runRibbon("edit:undo", ok.host);
    reg.runRibbon("edit:redo", ok.host);
    expect(ok.host.log).toHaveBeenNthCalledWith(1, "Undo.");
    expect(ok.host.log).toHaveBeenNthCalledWith(2, "Redo.");

    const spent = stubHost();
    spent.cad.undo.mockReturnValue(false);
    spent.cad.redo.mockReturnValue(false);
    reg.runRibbon("edit:undo", spent.host);
    reg.runRibbon("edit:redo", spent.host);
    expect(spent.host.log).toHaveBeenNthCalledWith(1, "Nothing to undo.", "info");
    expect(spent.host.log).toHaveBeenNthCalledWith(2, "Nothing to redo.", "info");
  });

  it("cmd:hatch goes through runCommand('HATCH') — empty selection logs its error", () => {
    const { host } = stubHost();
    reg.runRibbon("cmd:hatch", host);
    expect(host.log).toHaveBeenCalledWith("HATCH: select a single closed boundary first.", "error");
  });
});

describe("commandRegistry clear-contours/clear-surfaces transactions", () => {
  const reg = buildCommandRegistry(DEFAULT_COMMAND_ENTRIES);

  it("clear-contours deletes CONTOURS* linework inside one transaction, others survive", () => {
    const { host, cad } = stubHost({
      linework: [
        linework("c1", "CONTOURS"),
        linework("ci1", "CONTOURS_INDEX"),
        linework("keep-me", "TOPO"),
      ],
    });
    const order: string[] = [];
    cad.beginTransaction.mockImplementation(() => void order.push("begin"));
    cad.endTransaction.mockImplementation(() => void order.push("end"));
    cad.deleteLinework.mockImplementation((id: string) => void order.push(`delete:${id}`));

    reg.runRibbon("surface:clear-contours", host);

    expect(order).toEqual(["begin", "delete:c1", "delete:ci1", "end"]);
    expect(cad.deleteLinework).toHaveBeenCalledTimes(2);
    expect(cad.endTransaction).toHaveBeenCalledAfter(cad.beginTransaction);
    expect(host.log).toHaveBeenCalledWith("Cleared 2 contour line(s).");
  });

  it("clear-contours without contours only logs the info nudge", () => {
    const { host, cad } = stubHost();
    reg.runRibbon("surface:clear-contours", host);
    expect(cad.beginTransaction).not.toHaveBeenCalled();
    expect(cad.deleteLinework).not.toHaveBeenCalled();
    expect(host.log).toHaveBeenCalledWith("No contours to clear.", "info");
  });

  it("clear-surfaces deletes each surface inside one transaction", () => {
    const { host, cad } = stubHost({ surfaces: [surface("s1"), surface("s2")] });
    const order: string[] = [];
    cad.beginTransaction.mockImplementation(() => void order.push("begin"));
    cad.endTransaction.mockImplementation(() => void order.push("end"));
    cad.deleteSurface.mockImplementation((id: string) => void order.push(`delete:${id}`));

    reg.runRibbon("surface:clear-surfaces", host);

    expect(order).toEqual(["begin", "delete:s1", "delete:s2", "end"]);
    expect(host.log).toHaveBeenCalledWith("Cleared 2 surface(s).");
  });

  it("clear-surfaces without surfaces only logs the info nudge", () => {
    const { host, cad } = stubHost();
    reg.runRibbon("surface:clear-surfaces", host);
    expect(cad.beginTransaction).not.toHaveBeenCalled();
    expect(host.log).toHaveBeenCalledWith("No surfaces to clear.", "info");
  });
});
