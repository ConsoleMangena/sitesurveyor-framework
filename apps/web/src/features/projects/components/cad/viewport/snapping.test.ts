import { describe, expect, it } from "vitest";
import type { CadModelState, SurveyPoint } from "../cadModel.ts";
import { emptyModel } from "../cadModel.ts";
import { OSNAP_TOL_PX, applyGridSnap, findOsnapHit, orthoConstraint } from "./snapping.ts";

/** Trivial projector: 10 px per survey unit, north up. */
const project = (w: { n: number; e: number }) => ({ x: w.e * 10, y: -w.n * 10 });

function modelWith(patch: Partial<CadModelState>): CadModelState {
  return { ...emptyModel(), ...patch };
}

const pt = (id: string, n: number, e: number, layerId = "0"): SurveyPoint => ({
  id,
  pointNo: id,
  n,
  e,
  z: null,
  code: "",
  layerId,
});

describe("applyGridSnap", () => {
  it("rounds to the given spacing", () => {
    expect(applyGridSnap({ n: 3.2, e: 4.7 }, 1, true)).toEqual({ n: 3, e: 5 });
  });

  it("handles arbitrary fractional spacings and negative coordinates", () => {
    expect(applyGridSnap({ n: 0.3, e: -0.7 }, 0.5, true)).toEqual({ n: 0.5, e: -0.5 });
    expect(applyGridSnap({ n: -3.4, e: -2.6 }, 1, true)).toEqual({ n: -3, e: -3 });
    expect(applyGridSnap({ n: 10, e: 11 }, 7, true)).toEqual({ n: 7, e: 14 });
  });

  it("returns the input unchanged when disabled", () => {
    const world = { n: 3.2, e: 4.7 };
    expect(applyGridSnap(world, 1, false)).toBe(world);
  });
});

describe("orthoConstraint", () => {
  it("locks to the dominant axis of the movement", () => {
    expect(orthoConstraint({ n: 5, e: 1 }, { n: 0, e: 0 })).toEqual({ n: 5, e: 0 });
    expect(orthoConstraint({ n: 1, e: 5 }, { n: 0, e: 0 })).toEqual({ n: 0, e: 5 });
  });

  it("breaks ties in favour of the northing axis", () => {
    expect(orthoConstraint({ n: 3, e: 3 }, { n: 0, e: 0 })).toEqual({ n: 3, e: 0 });
  });

  it("returns the input unchanged with no previous vertex", () => {
    const world = { n: 1, e: 2 };
    expect(orthoConstraint(world, null)).toBe(world);
  });
});

describe("findOsnapHit", () => {
  it("exports the production tolerance of 12 px", () => {
    expect(OSNAP_TOL_PX).toBe(12);
  });

  it("prefers a closer midpoint over a farther endpoint within tolerance", () => {
    // Segment (0,0)->(0,2): screens A=(0,0), B=(20,0), midpoint=(10,0).
    const model = modelWith({
      linework: [
        { id: "lw", kind: "line", vertices: [{ n: 0, e: 0 }, { n: 0, e: 2 }], closed: false, layerId: "0" },
      ],
    });
    // Query (11,0): endpoint A is 11 px away, endpoint B 9 px, midpoint 1 px.
    const hit = findOsnapHit(model, project, 11, 0);
    expect(hit?.kind).toBe("midpoint");
    expect(hit?.world).toEqual({ n: 0, e: 1 });
    expect(hit?.screen.x).toBe(10);
    expect(hit?.screen.y).toBeCloseTo(0);
  });

  it("snaps survey points as nodes", () => {
    const model = modelWith({ points: [pt("p1", 1, 2)] }); // screen (20,-10)
    const hit = findOsnapHit(model, project, 18, -10);
    expect(hit?.kind).toBe("node");
    expect(hit?.world).toEqual({ n: 1, e: 2 });
  });

  it("offers the closing-segment midpoint of closed linework", () => {
    const model = modelWith({
      linework: [
        {
          id: "tri",
          kind: "boundary",
          vertices: [{ n: 0, e: 0 }, { n: 0, e: 4 }, { n: 4, e: 4 }],
          closed: true,
          layerId: "0",
        },
      ],
    });
    // Closing segment (n:4,e:4)->(n:0,e:0); midpoint (n:2,e:2) -> screen (20,-20).
    const hit = findOsnapHit(model, project, 20, -20);
    expect(hit?.kind).toBe("midpoint");
    expect(hit?.world).toEqual({ n: 2, e: 2 });
  });

  it("offers arc endpoints/midpoints, circle centres and dimension def points", () => {
    const model = modelWith({
      arcs: [{ id: "a1", center: { n: 0, e: 0 }, radius: 2, startAngle: 0, endAngle: 90, layerId: "0" }],
      circles: [{ id: "c1", center: { n: 10, e: 0 }, radius: 5, layerId: "0" }],
      dimensions: [
        {
          id: "d1",
          kind: "linear",
          text: "2",
          textPosition: { n: 99, e: 99 },
          defPoints: [{ n: 0, e: 30 }, { n: 0, e: 32 }],
          layerId: "0",
        },
      ],
    });
    // Arc start angle 0 deg -> world (n:0,e:2) -> screen (20,0).
    expect(findOsnapHit(model, project, 20, 0)?.kind).toBe("endpoint");
    // Arc mid-angle 45 deg -> screen (14.14..., -14.14...).
    const mid = findOsnapHit(model, project, 14.142135623730951, -14.142135623730951);
    expect(mid?.kind).toBe("midpoint");
    // Circle centre -> node.
    expect(findOsnapHit(model, project, 0, -100)?.kind).toBe("node");
    // Dimension definition point -> endpoint.
    expect(findOsnapHit(model, project, 300, 0)?.kind).toBe("endpoint");
  });

  it("resolves exact distance ties in favour of the later candidate", () => {
    const model = modelWith({ points: [pt("p1", 0, 0), pt("p2", 0, 2)] });
    // Screens (0,0) and (20,0); query (10,0) is exactly 10 px from both.
    const hit = findOsnapHit(model, project, 10, 0);
    expect(hit?.world).toEqual({ n: 0, e: 2 });
  });

  it("ignores entities on hidden layers", () => {
    const model = modelWith({
      layers: [
        ...emptyModel().layers,
        { id: "HID", name: "Hidden", color: "#000000", visible: false, locked: false },
      ],
      linework: [
        { id: "lw", kind: "line", vertices: [{ n: 0, e: 0 }, { n: 0, e: 2 }], closed: false, layerId: "HID" },
      ],
      points: [pt("far-away", 30, 0)],
    });
    // Cursor sits exactly on the hidden line's vertex; nothing else nearby.
    expect(findOsnapHit(model, project, 0, 0)).toBeNull();
  });

  it("returns null beyond the tolerance", () => {
    const model = modelWith({ points: [pt("p1", 1, 2)] });
    expect(findOsnapHit(model, project, 100, 100)).toBeNull();
  });

  it("honours a custom tolerance in screen pixels", () => {
    const model = modelWith({ points: [pt("p1", 0, 0)] });
    expect(findOsnapHit(model, project, 15, 0)).toBeNull();
    expect(findOsnapHit(model, project, 15, 0, 15)?.kind).toBe("node");
    expect(findOsnapHit(model, project, 16, 0, 15)).toBeNull();
  });
});
