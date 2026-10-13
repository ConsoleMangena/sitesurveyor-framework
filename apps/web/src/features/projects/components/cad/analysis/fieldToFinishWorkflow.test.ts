import { describe, expect, it } from "vitest";
import type { SurveyPoint } from "../cadModel.ts";
import { runProcessLinework } from "./fieldToFinishWorkflow";
import { fakeApi, fakeModel, fakeServices } from "./testHarness";

/** Coded-point fixture in the style of survey/featureCodes.test.ts. */
function codedPoint(id: string, pointNo: string, code: string, n: number, e: number): SurveyPoint {
  return { id, pointNo, n, e, z: null, code, layerId: "TOPO" };
}

describe("runProcessLinework", () => {
  it("strings coded FL points into one open polyline on the feature's TOPO layer", () => {
    const model = fakeModel({
      points: [
        codedPoint("p1", "1", "FL1", 0, 0),
        codedPoint("p2", "2", "FL1", 10, 0),
        codedPoint("p3", "3", "FL1", 20, 5),
      ],
    });
    const { api, calls } = fakeApi(model);
    const { services, log } = fakeServices();

    runProcessLinework(model, api, services);

    const adds = calls.filter((c) => c.op === "addLinework");
    expect(adds).toHaveLength(1);
    const arg = adds[0].args[0] as {
      kind: string;
      closed: boolean;
      layerId: string;
      vertices: { n: number; e: number }[];
    };
    expect(arg.closed).toBe(false);
    expect(arg.kind).toBe("polyline");
    // FL resolves to the TOPO layer in DEFAULT_FEATURE_CODES.
    expect(arg.layerId).toBe("TOPO");
    expect(arg.vertices).toEqual([
      { n: 0, e: 0 },
      { n: 10, e: 0 },
      { n: 20, e: 5 },
    ]);
    expect(calls.some((c) => c.op === "ensureLayer" && c.args[0] === "TOPO")).toBe(true);
    expect(services.fitExtents).toHaveBeenCalledTimes(1);
    const logText = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logText).toContain("drew 1 linework string(s) from 3 coded point(s)");
  });

  it("logs an info hint when there are zero stringable coded points", () => {
    const model = fakeModel({
      points: [codedPoint("t1", "1", "TREE", 0, 0)],
    });
    const { api, calls } = fakeApi(model);
    const { services, log } = fakeServices();

    runProcessLinework(model, api, services);

    expect(calls.filter((c) => c.op === "addLinework")).toHaveLength(0);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("no stringable coded points"),
      "info",
    );
    expect(services.fitExtents).not.toHaveBeenCalled();
  });
});
