import { describe, it, expect } from "vitest";
import { modelToDxf } from "./dxf.ts";
import { emptyModel, type CadModelState } from "../cadModel.ts";

function baseModel(): CadModelState {
  return emptyModel();
}

describe("modelToDxf", () => {
  it("produces a well-formed R2000 DXF skeleton", () => {
    const dxf = modelToDxf(baseModel());
    expect(dxf).toContain("SECTION");
    expect(dxf).toContain("$ACADVER");
    // AC1015 (AutoCAD 2000) — lowest version valid for LWPOLYLINE / 3DFACE.
    expect(dxf).toContain("AC1015");
    expect(dxf).toContain("TABLES");
    expect(dxf).toContain("ENTITIES");
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
  });

  it("emits a LAYER table entry per layer", () => {
    const model = baseModel();
    const dxf = modelToDxf(model);
    // One LAYER table header + one entry per default layer.
    const layerEntries = dxf.split("\n").filter((l) => l === "LAYER").length;
    // First "LAYER" is the table name (group 2), the rest are entries.
    expect(layerEntries).toBeGreaterThanOrEqual(model.layers.length);
  });

  it("maps Easting->X (code 10) and Northing->Y (code 20) for points", () => {
    const model = baseModel();
    model.points.push({ id: "p", pointNo: "1", n: 1000, e: 5000, z: 12, code: "", layerId: "TOPO" });
    const dxf = modelToDxf(model);
    expect(dxf).toContain("POINT");
    // X group (10) carries Easting, Y group (20) carries Northing.
    expect(dxf).toMatch(/10\n5000\n/);
    expect(dxf).toMatch(/20\n1000\n/);
    expect(dxf).toMatch(/30\n12\n/);
  });

  it("emits LINE for a 2-vertex line", () => {
    const model = baseModel();
    model.linework.push({
      id: "l", kind: "line", closed: false, layerId: "TOPO",
      vertices: [{ n: 0, e: 0 }, { n: 10, e: 10 }],
    });
    const dxf = modelToDxf(model);
    expect(dxf).toContain("LINE");
    expect(dxf).not.toContain("LWPOLYLINE");
  });

  it("emits a closed LWPOLYLINE for a boundary", () => {
    const model = baseModel();
    model.linework.push({
      id: "b", kind: "boundary", closed: true, layerId: "BOUNDARY",
      vertices: [{ n: 0, e: 0 }, { n: 0, e: 10 }, { n: 10, e: 10 }],
    });
    const dxf = modelToDxf(model);
    expect(dxf).toContain("LWPOLYLINE");
    // Closed flag group 70 = 1.
    expect(dxf).toMatch(/70\n1\n/);
  });

  it("emits ARC entities for arcs", () => {
    const model = baseModel();
    model.arcs.push({
      id: "a1",
      center: { n: 10, e: 20 },
      radius: 5,
      startAngle: 0,
      endAngle: 90,
      layerId: "0",
    });
    const dxf = modelToDxf(model);
    expect(dxf).toContain("ARC");
    expect(dxf).toMatch(/10\n20\n/);
    expect(dxf).toMatch(/40\n5\n/);
  });

  it("emits CIRCLE entities for circles", () => {
    const model = baseModel();
    model.circles.push({
      id: "c1",
      center: { n: 5, e: 5 },
      radius: 3,
      layerId: "0",
    });
    const dxf = modelToDxf(model);
    expect(dxf).toContain("CIRCLE");
    expect(dxf).toMatch(/10\n5\n/);
    expect(dxf).toMatch(/40\n3\n/);
  });

  it("emits ELLIPSE entities for ellipses", () => {
    const model = baseModel();
    model.ellipses.push({
      id: "e1",
      center: { n: 10, e: 20 },
      semiMajor: 6,
      semiMinor: 3,
      rotation: 30,
      layerId: "0",
    });
    const dxf = modelToDxf(model);
    expect(dxf).toContain("ELLIPSE");
    expect(dxf).toContain("AcDbEllipse");
    expect(dxf).toMatch(/40\n0\.5\n/);
    expect(dxf).toMatch(/42\n6\.283185/);
  });

  it("emits a native DIMENSION entity for linear dimensions", () => {
    const model = baseModel();
    model.dimensions.push({
      id: "d1",
      kind: "linear",
      text: "12.345",
      textPosition: { n: 5, e: 5 },
      defPoints: [{ n: 0, e: 0 }, { n: 10, e: 0 }],
      layerId: "0",
    });
    const dxf = modelToDxf(model);
    expect(dxf).toContain("DIMENSION");
    expect(dxf).toContain("12.345");
    expect(dxf).toMatch(/13\n0\n/);
    expect(dxf).toMatch(/14\n0\n/);
  });

  it("falls back to line + label for non-linear dimensions", () => {
    const model = baseModel();
    model.dimensions.push({
      id: "d1",
      kind: "angular",
      text: "45°",
      textPosition: { n: 5, e: 5 },
      defPoints: [{ n: 0, e: 0 }, { n: 10, e: 0 }, { n: 10, e: 10 }],
      layerId: "0",
    });
    const dxf = modelToDxf(model);
    expect(dxf).not.toContain("DIMENSION");
    expect(dxf).toContain("LINE");
    expect(dxf).toContain("45°");
  });

  it("emits native HATCH entities", () => {
    const model = baseModel();
    model.hatches.push({
      id: "h1",
      vertices: [{ n: 0, e: 0 }, { n: 10, e: 0 }, { n: 10, e: 10 }],
      holes: [],
      layerId: "0",
    });
    const dxf = modelToDxf(model);
    expect(dxf).toContain("HATCH");
    expect(dxf).toContain("AcDbHatch");
    expect(dxf).toMatch(/2\nSOLID\n/);
    expect(dxf).toMatch(/70\n1\n/);
    expect(dxf).toMatch(/91\n1\n/);
  });

  it("emits HATCH with holes as separate polyline loops", () => {
    const model = baseModel();
    model.hatches.push({
      id: "h1",
      vertices: [{ n: 0, e: 0 }, { n: 10, e: 0 }, { n: 10, e: 10 }, { n: 0, e: 10 }],
      holes: [[{ n: 3, e: 3 }, { n: 3, e: 7 }, { n: 7, e: 7 }]],
      layerId: "0",
    });
    const dxf = modelToDxf(model);
    expect(dxf).toContain("HATCH");
    expect(dxf).toMatch(/91\n2\n/);
  });
});


