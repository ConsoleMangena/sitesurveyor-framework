import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CadSelection, SurveyLinework, SurveyPoint, SurveyText } from "../cadModel.ts";
import { runConvexHull, runReproject, runSimplifySelection } from "./geomWorkflows";
import { fakeApi, fakeModel, fakeServices } from "./testHarness";

// lastReprojectBackend() reads module state inside the real bridge; mocking the
// whole bridge module is the faithful way to drive that label deterministically.
const bridge = vi.hoisted(() => ({
  reproject: vi.fn(),
  lastReprojectBackend: vi.fn<() => "proj" | "karney">(),
}));

vi.mock("../survey/reprojectBridge.ts", () => ({
  reproject: bridge.reproject,
  lastReprojectBackend: bridge.lastReprojectBackend,
}));

function pt(id: string, n: number, e: number): SurveyPoint {
  return { id, pointNo: id, n, e, z: null, code: "", layerId: "0" };
}

describe("runConvexHull", () => {
  it("draws one closed 5-vertex boundary on BOUNDARY and logs the backend", async () => {
    const model = fakeModel({
      points: [pt("p1", 0, 0), pt("p2", 10, 0), pt("p3", 15, 5), pt("p4", 8, 12), pt("p5", -2, 6)],
    });
    const { api, calls } = fakeApi(model);
    const { services, log } = fakeServices();

    await runConvexHull(model, api, services);

    const adds = calls.filter((c) => c.op === "addLinework");
    expect(adds).toHaveLength(1);
    const arg = adds[0].args[0] as {
      kind: string;
      closed: boolean;
      layerId: string;
      vertices: { n: number; e: number }[];
    };
    expect(arg.kind).toBe("boundary");
    expect(arg.closed).toBe(true);
    expect(arg.layerId).toBe("BOUNDARY");
    expect(arg.vertices).toHaveLength(5);
    expect(calls.some((c) => c.op === "ensureLayer" && c.args[0] === "BOUNDARY")).toBe(true);
    expect(log).toHaveBeenCalledWith(
      expect.stringMatching(/Convex hull: 5-vertex boundary on the Boundary layer \((ts|wasm)\)\./),
    );
  });

  it("logs a degenerate point set error for collinear input", async () => {
    const model = fakeModel({ points: [pt("p1", 0, 0), pt("p2", 5, 5), pt("p3", 10, 10)] });
    const { api, calls } = fakeApi(model);
    const { services, log } = fakeServices();

    await runConvexHull(model, api, services);

    expect(calls.filter((c) => c.op === "addLinework")).toHaveLength(0);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("degenerate point set"),
      "error",
    );
  });
});

describe("runSimplifySelection", () => {
  const polyline: SurveyLinework = {
    id: "lw-1",
    kind: "polyline",
    vertices: [{ n: 0, e: 0 }, { n: 1, e: 0 }, { n: 2, e: 0 }, { n: 3, e: 0 }, { n: 3, e: 5 }],
    closed: false,
    layerId: "0",
  };
  const selection: CadSelection = {
    type: "linework",
    id: "lw-1",
    items: [{ type: "linework", id: "lw-1" }],
  };

  it("reduces collinear interior vertices at the prompted tolerance", async () => {
    const model = fakeModel({ linework: [polyline] });
    const { api, calls } = fakeApi(model);
    const { services, log } = fakeServices({ prompt: async () => "0.5" });

    await runSimplifySelection(model, selection, api, services);

    const updates = calls.filter((c) => c.op === "updateLinework");
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0]).toBe("lw-1");
    const verts = (updates[0].args[1] as { vertices: unknown[] }).vertices;
    expect(verts.length).toBeLessThan(polyline.vertices.length);
    expect(verts).toEqual([{ n: 0, e: 0 }, { n: 3, e: 0 }, { n: 3, e: 5 }]);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Simplified 5 → 3 vertices at 0.5 m"),
    );
  });

  it("errors when no linework is selected", async () => {
    const model = fakeModel({ linework: [polyline] });
    const { api, calls } = fakeApi(model);
    const { services, log } = fakeServices();

    await runSimplifySelection(model, { type: null, id: null, items: [] }, api, services);

    expect(calls.filter((c) => c.op === "updateLinework")).toHaveLength(0);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("select a polyline/boundary first"),
      "error",
    );
  });

  it.each(["abc", "-1"])("rejects invalid tolerance %s with an error log", async (raw) => {
    const model = fakeModel({ linework: [polyline] });
    const { api, calls } = fakeApi(model);
    const { services, log } = fakeServices({ prompt: async () => raw });

    await runSimplifySelection(model, selection, api, services);

    expect(calls.filter((c) => c.op === "updateLinework")).toHaveLength(0);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("tolerance must be a positive number"),
      "error",
    );
  });
});

describe("runReproject guards", () => {
  beforeEach(() => {
    bridge.reproject.mockReset();
    bridge.lastReprojectBackend.mockReset();
  });

  it("errors when the drawing has nothing to transform", async () => {
    const model = fakeModel();
    const { api } = fakeApi(model);
    const { services, log } = fakeServices();

    await runReproject(model, api, services);

    expect(log).toHaveBeenCalledWith(expect.stringContaining("nothing to transform"), "error");
    expect(log).toHaveBeenCalledTimes(1); // guard returns before any CRS prompting
  });

  it("logs info when source and target CRS are identical", async () => {
    const model = fakeModel({ points: [pt("p1", 1, 1)] });
    const { api, calls } = fakeApi(model);
    // Both prompts answer "1" → same preset on both sides.
    const { services: sameServices, log: sameLog } = fakeServices({
      prompt: async () => "1",
    });

    await runReproject(model, api, sameServices);

    expect(sameLog).toHaveBeenCalledWith(
      expect.stringContaining("source and target CRS are the same"),
      "info",
    );
    expect(calls.filter((c) => c.op.startsWith("update"))).toHaveLength(0);
  });
});

describe("runReproject happy path (mocked projection bridge)", () => {
  beforeEach(() => {
    bridge.reproject.mockReset();
    bridge.lastReprojectBackend.mockReset();
    bridge.reproject.mockImplementation(
      async (_from: unknown, _to: unknown, pts: { n: number; e: number }[]) =>
        pts.map((p) => ({ n: p.n + 7, e: p.e + 9 })),
    );
    bridge.lastReprojectBackend.mockReturnValue("karney");
  });

  it("batches linework into ONE update per entity and updates points/texts", async () => {
    const model = fakeModel({
      points: [pt("pt-1", 100, 200)],
      linework: [
        {
          id: "lw-r",
          kind: "polyline",
          vertices: [{ n: 0, e: 0 }, { n: 10, e: 0 }],
          closed: false,
          layerId: "0",
        },
      ],
      texts: [
        { id: "tx-1", n: 5, e: 5, text: "PK", layerId: "TEXT" } as SurveyText,
      ],
    });
    const { api, calls } = fakeApi(model);
    // Source default "1" (Lo. 25°) vs target default "6" (UTM35S): distinct CRS.
    const { services, log } = fakeServices({
      prompt: async (_msg, def) => def ?? "1",
    });

    await runReproject(model, api, services);

    // Batched: one updateLinework carrying BOTH shifted vertices, not one per vertex.
    const lwUpdates = calls.filter((c) => c.op === "updateLinework");
    expect(lwUpdates).toHaveLength(1);
    expect(lwUpdates[0].args[0]).toBe("lw-r");
    expect(lwUpdates[0].args[1]).toEqual({
      vertices: [{ n: 7, e: 9 }, { n: 17, e: 9 }],
    });
    expect(calls.some((c) => c.op === "updatePoint" && c.args[0] === "pt-1" &&
      (c.args[1] as { n: number; e: number }).n === 107)).toBe(true);
    expect(calls.some((c) => c.op === "updateText" && c.args[0] === "tx-1")).toBe(true);
    expect(calls.some((c) => c.op === "updateSurface")).toBe(false);

    const logText = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logText).toContain("→");
    expect(services.fitExtents).toHaveBeenCalledTimes(1);

    // karney backend label fires the extra hint info-log.
    expect(bridge.lastReprojectBackend).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Used the in-app projection"),
      "info",
    );
  });

  it("skips the karney hint when the backend label is proj", async () => {
    bridge.lastReprojectBackend.mockReturnValue("proj");
    const model = fakeModel({ points: [pt("pt-1", 100, 200)] });
    const { api } = fakeApi(model);
    const { services, log } = fakeServices({
      prompt: async (_msg, def) => def ?? "1",
    });

    await runReproject(model, api, services);

    expect(log).not.toHaveBeenCalledWith(
      expect.stringContaining("Used the in-app projection"),
      "info",
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("Reprojected 1 vertex/entity(ies):"),
    );
  });
});
