import { describe, expect, it } from "vitest";
import type { CadModelState } from "../cadModel.ts";
import { emptyModel } from "../cadModel.ts";
import { PICK_TOL_PX, boxSelect, pickEntityAt } from "./hitTesting.ts";

/** Trivial projector: 10 px per survey unit, north up. */
const project = (w: { n: number; e: number }) => ({ x: w.e * 10, y: -w.n * 10 });

function modelWith(patch: Partial<CadModelState>): CadModelState {
  return { ...emptyModel(), ...patch };
}

function layerPredicates(model: CadModelState) {
  const isVisibleLayer = (layerId: string) => {
    const l = model.layers.find((x) => x.id === layerId);
    return !l || l.visible;
  };
  const isSelectableLayer = (layerId: string) => {
    const l = model.layers.find((x) => x.id === layerId);
    return !l || (l.visible && !l.locked);
  };
  return { isVisibleLayer, isSelectableLayer };
}

const pt = (id: string, n: number, e: number, layerId = "0") => ({
  id,
  pointNo: id,
  n,
  e,
  z: null as number | null,
  code: "",
  layerId,
});

/**
 * One fixture entity of every type, spread far apart in screen space:
 * point (0,0), linework (10..30,0), text ~(50,0), surface triangle
 * around (120,-13), arc ~(210,0), circle rim (310,0), ellipse (410,0),
 * dimension segment (500..520,0) + label at (510,-20), hatch square
 * centred on (620,-20).
 */
function kitchenSink(): CadModelState {
  return modelWith({
    points: [pt("pt1", 0, 0)],
    linework: [
      { id: "lw1", kind: "polyline", vertices: [{ n: 0, e: 1 }, { n: 0, e: 3 }], closed: false, layerId: "0" },
    ],
    texts: [{ id: "tx1", n: 0, e: 5, text: "AB", layerId: "0" }],
    surfaces: [
      {
        id: "sf1",
        name: "S",
        points: [
          { n: 0, e: 10, z: 0 },
          { n: 0, e: 14, z: 0 },
          { n: 4, e: 12, z: 0 },
        ],
        triangles: [{ a: 0, b: 1, c: 2 }],
        layerId: "0",
        visible: true,
      },
    ],
    arcs: [{ id: "ar1", center: { n: 0, e: 20 }, radius: 1, startAngle: 0, endAngle: 90, layerId: "0" }],
    circles: [{ id: "ci1", center: { n: 0, e: 30 }, radius: 1, layerId: "0" }],
    ellipses: [
      { id: "el1", center: { n: 0, e: 40 }, semiMajor: 1, semiMinor: 0.5, rotation: 0, layerId: "0" },
    ],
    dimensions: [
      {
        id: "dm1",
        kind: "linear",
        text: "2 m",
        textPosition: { n: 2, e: 51 },
        defPoints: [{ n: 0, e: 50 }, { n: 0, e: 52 }],
        layerId: "0",
      },
    ],
    hatches: [
      {
        id: "ha1",
        vertices: [{ n: 0, e: 60 }, { n: 0, e: 64 }, { n: 4, e: 64 }, { n: 4, e: 60 }],
        holes: [],
        layerId: "0",
      },
    ],
  });
}

describe("pickEntityAt", () => {
  it("exports the production pick tolerance of 8 px", () => {
    expect(PICK_TOL_PX).toBe(8);
  });

  it("hits every entity type at representative screen locations", () => {
    const model = kitchenSink();
    const { isVisibleLayer, isSelectableLayer } = layerPredicates(model);
    const cases: [number, number, string][] = [
      [0, 0, "point"],
      [20, 0, "linework"], // mid-segment
      [55, 0, "text"], // inside the label bbox
      [120, -13, "surface"], // inside the TIN triangle
      [210, 0, "arc"], // sampled arc endpoint (angle 0 deg)
      [310, 0, "circle"], // east rim of the circle
      [410, 0, "ellipse"], // extremity of the major axis
      [510, 0, "dimension"], // along the defpoint segment
      [620, -20, "hatch"], // inside the hatch area
    ];
    for (const [x, y, expectedType] of cases) {
      const hit = pickEntityAt(model, isVisibleLayer, isSelectableLayer, project, x, y);
      expect(hit?.type, `${expectedType} at (${x},${y})`).toBe(expectedType);
      expect(hit?.id).toBeDefined();
    }
  });

  it("a survey point wins over linework at comparable distance", () => {
    const model = modelWith({
      points: [pt("pt", 0, 0)],
      linework: [
        { id: "lw", kind: "line", vertices: [{ n: 0, e: 1 }, { n: 0, e: 3 }], closed: false, layerId: "0" },
      ],
    });
    const { isVisibleLayer, isSelectableLayer } = layerPredicates(model);
    // (8,0) sits exactly on the pick tolerance from the point but only 2 px
    // from the segment — the point still wins by priority.
    expect(pickEntityAt(model, isVisibleLayer, isSelectableLayer, project, 8, 0)).toEqual({
      type: "point",
      id: "pt",
    });
  });

  it("hits a dimension via its text label too", () => {
    const model = kitchenSink();
    const { isVisibleLayer, isSelectableLayer } = layerPredicates(model);
    // Label anchored at (510,-20); the defpoint segment lies at y=0.
    expect(pickEntityAt(model, isVisibleLayer, isSelectableLayer, project, 520, -24)?.type).toBe("dimension");
  });

  it("skips entities on locked layers but picks unlocked neighbours", () => {
    const model = modelWith({
      layers: [
        ...emptyModel().layers,
        { id: "LK", name: "Locked", color: "#000000", visible: true, locked: true },
      ],
      points: [pt("locked-pt", 0, 0, "LK")],
      linework: [
        { id: "lw", kind: "line", vertices: [{ n: 0, e: 1 }, { n: 0, e: 3 }], closed: false, layerId: "0" },
      ],
    });
    const { isVisibleLayer, isSelectableLayer } = layerPredicates(model);
    expect(pickEntityAt(model, isVisibleLayer, isSelectableLayer, project, 0, 0)).toBeNull();
    expect(pickEntityAt(model, isVisibleLayer, isSelectableLayer, project, 20, 0)?.id).toBe("lw");
  });

  it("skips entities on hidden layers", () => {
    const model = modelWith({
      layers: [
        ...emptyModel().layers,
        { id: "HD", name: "Hidden", color: "#000000", visible: false, locked: false },
      ],
      points: [pt("hidden-pt", 0, 0, "HD")],
    });
    const { isVisibleLayer, isSelectableLayer } = layerPredicates(model);
    expect(pickEntityAt(model, isVisibleLayer, isSelectableLayer, project, 0, 0)).toBeNull();
  });

  it("ignores surfaces whose wireframe is toggled off", () => {
    const model = kitchenSink();
    model.surfaces[0].visible = false;
    const { isVisibleLayer, isSelectableLayer } = layerPredicates(model);
    expect(pickEntityAt(model, isVisibleLayer, isSelectableLayer, project, 120, -13)).toBeNull();
  });

  it("returns null when nothing is within the pick tolerance", () => {
    const model = kitchenSink();
    const { isVisibleLayer, isSelectableLayer } = layerPredicates(model);
    expect(pickEntityAt(model, isVisibleLayer, isSelectableLayer, project, 200, 200)).toBeNull();
  });

  it("accepts a custom tolerance", () => {
    const model = modelWith({ points: [pt("pt", 0, 0)] });
    const { isVisibleLayer, isSelectableLayer } = layerPredicates(model);
    expect(pickEntityAt(model, isVisibleLayer, isSelectableLayer, project, 20, 0)).toBeNull();
    expect(pickEntityAt(model, isVisibleLayer, isSelectableLayer, project, 20, 0, 20)?.type).toBe("point");
  });
});

describe("boxSelect", () => {
  function selectAll(
    model: CadModelState,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    crossing: boolean,
  ) {
    const { isSelectableLayer } = layerPredicates(model);
    return boxSelect(model, isSelectableLayer, project, { x: ax, y: ay }, { x: bx, y: by }, crossing);
  }

  it("WINDOW requires full containment", () => {
    const model = modelWith({
      linework: [
        { id: "lw", kind: "line", vertices: [{ n: 0, e: 1 }, { n: 0, e: 5 }], closed: false, layerId: "0" },
      ],
    }); // screens (10,0) -> (50,0)
    expect(selectAll(model, 0, -5, 20, 5, false)).toEqual([]);
    expect(selectAll(model, 0, -5, 60, 5, false)).toEqual([{ type: "linework", id: "lw" }]);
  });

  it("CROSSING accepts a line that merely passes through the box", () => {
    const model = modelWith({
      linework: [
        { id: "lw", kind: "line", vertices: [{ n: 0, e: 1 }, { n: 0, e: 5 }], closed: false, layerId: "0" },
      ],
    });
    // Box x in [20,40]: both endpoints outside, the segment crosses two edges.
    expect(selectAll(model, 20, -5, 40, 5, true)).toEqual([{ type: "linework", id: "lw" }]);
    expect(selectAll(model, 20, -5, 40, 5, false)).toEqual([]);
  });

  it("CROSSING counts an endpoint landing exactly on the box edge", () => {
    const model = modelWith({
      linework: [
        { id: "lw", kind: "line", vertices: [{ n: 0, e: 1 }, { n: 0, e: 3 }], closed: false, layerId: "0" },
      ],
    }); // screens (10,0) and (30,0); box left edge at x=30
    expect(selectAll(model, 30, -5, 60, 5, true)).toHaveLength(1);
    expect(selectAll(model, 30, -5, 60, 5, false)).toEqual([]);
  });

  it("closed linework needs all vertices inside for WINDOW", () => {
    const model = modelWith({
      linework: [
        {
          id: "ring",
          kind: "boundary",
          vertices: [{ n: 0, e: 0 }, { n: 0, e: 4 }, { n: 4, e: 4 }],
          closed: true,
          layerId: "0",
        },
      ],
    }); // screens (0,0), (40,0), (40,-40)
    expect(selectAll(model, -10, -50, 30, 10, false)).toEqual([]);
    expect(selectAll(model, -10, -50, 30, 10, true)).toHaveLength(1);
    expect(selectAll(model, -10, -50, 50, 10, false)).toHaveLength(1);
  });

  it("points follow containment rules even in CROSSING mode", () => {
    const model = modelWith({
      points: [pt("in", 0, 2), pt("out", 0, 4)],
      linework: [
        { id: "lw", kind: "line", vertices: [{ n: 0, e: 1 }, { n: 0, e: 5 }], closed: false, layerId: "0" },
      ],
    });
    // Box covering x in [15,35]: crosses the line, contains only "in".
    expect(selectAll(model, 15, -5, 35, 5, true)).toEqual([
      { type: "point", id: "in" },
      { type: "linework", id: "lw" },
    ]);
  });

  it("returns items in collection order across all entity types", () => {
    const model = kitchenSink();
    // Giant window spanning every fixture entity.
    const items = selectAll(model, -50, -100, 700, 50, false);
    expect(items.map((i) => i.type)).toEqual([
      "point",
      "linework",
      "text",
      "surface",
      "arc",
      "circle",
      "ellipse",
      "dimension",
      "hatch",
    ]);
  });

  it("skips locked and hidden layers and invisible surfaces", () => {
    const model = kitchenSink();
    model.layers.push(
      { id: "LK", name: "L", color: "#000000", visible: true, locked: true },
      { id: "HD", name: "H", color: "#000000", visible: false, locked: false },
    );
    model.points.push(pt("lk-pt", 100, 100, "LK"), pt("hd-pt", 200, 200, "HD"));
    model.surfaces[0].visible = false;
    const items = selectAll(model, -50, -100, 700, 50, false);
    expect(items.map((i) => i.type)).toEqual([
      "point",
      "linework",
      "text",
      "arc",
      "circle",
      "ellipse",
      "dimension",
      "hatch",
    ]);
  });
});
