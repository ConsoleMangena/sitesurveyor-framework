import { describe, expect, it } from "vitest";
import type { SurveySurface } from "../cadModel.ts";
import { runBuildContours } from "./contourWorkflows";
import { fakeApi, fakeModel, fakeServices } from "./testHarness";

/**
 * Two flat benches (z=12 and z=28) joined by a sloped band, with a low west
 * ramp (down to z=0) so the 10 m / 20 m contour levels are strictly interior
 * to the surface. Hand-written points/triangles: two rows of points (n=0 and
 * n=5) stepping along e, each quad split into two triangles.
 */
function benchSurface(): SurveySurface {
  const points = [
    { n: 0, e: 0, z: 0 },
    { n: 5, e: 0, z: 0 },
    { n: 0, e: 10, z: 12 },
    { n: 5, e: 10, z: 12 },
    { n: 0, e: 20, z: 12 }, // flat bench z=12 (e 10..20)
    { n: 5, e: 20, z: 12 },
    { n: 0, e: 30, z: 28 }, // slope z=12 -> 28 (e 20..30)
    { n: 5, e: 30, z: 28 },
    { n: 0, e: 40, z: 28 }, // flat bench z=28 (e 30..40)
    { n: 5, e: 40, z: 28 },
  ];
  const quad = (i: number) => [
    { a: 2 * i, b: 2 * i + 1, c: 2 * i + 3 },
    { a: 2 * i, b: 2 * i + 3, c: 2 * i + 2 },
  ];
  return {
    id: "sf-bench",
    name: "Bench",
    layerId: "TOPO",
    visible: true,
    points,
    triangles: [...quad(0), ...quad(1), ...quad(2), ...quad(3)],
  };
}

const scriptedDialogs = {
  select: async () => "0",
  prompt: async (_msg: string, def?: string) => def ?? "1",
};

describe("runBuildContours", () => {
  it("draws labelled contours on the CONTOURS layers using the dialog defaults", async () => {
    const model = fakeModel({ surfaces: [benchSurface()] });
    const { api, calls } = fakeApi(model);
    const { services, log } = fakeServices(scriptedDialogs);
    await runBuildContours(model, api, services);

    const adds = calls.filter((c) => c.op === "addLinework");
    expect(adds.length).toBeGreaterThan(0);
    // Interval default = autoContourInterval(range 28) = 5; base = floor(0/5)*5 = 0;
    // index-every default "5" → only the 25 m level (step 5 from base 0) is an index contour.
    const expectedLabels = new Set(["5.00", "10.00", "15.00", "20.00", "25.00"]);
    const seenLabels = new Set<string>();
    for (const c of adds) {
      const lw = c.args[0] as { layerId: string; label?: string };
      expect(["CONTOURS", "CONTOURS_INDEX"]).toContain(lw.layerId);
      expect(lw.label).toMatch(/^\d+\.\d{2}$/);
      expect(expectedLabels.has(lw.label!)).toBe(true);
      seenLabels.add(lw.label!);
    }
    expect(seenLabels).toEqual(expectedLabels);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("contour(s) at 5 m"));
    expect(log).toHaveBeenCalledWith(expect.stringContaining("(every 5)"));
  });

  it("marks only whole multiples of indexEvery above the base as index contours", async () => {
    const model = fakeModel({ surfaces: [benchSurface()] });
    const { api, calls } = fakeApi(model);
    const { services } = fakeServices({
      ...scriptedDialogs,
      prompt: async (msg, def) => {
        if (msg.startsWith("Contour interval")) return "10";
        if (msg.startsWith("Lowest contour elevation")) return "10"; // base
        return def ?? "1";
      },
    });
    await runBuildContours(model, api, services);

    // interval=10, base=10, indexEvery=5 → levels 10 & 20; steps (el-10)/10 are
    // 0 and 1 → only el=10 is an index contour.
    const adds = calls.filter((c) => c.op === "addLinework");
    const indexAdds = adds.filter(
      (c) => (c.args[0] as { layerId: string }).layerId === "CONTOURS_INDEX",
    );
    expect(indexAdds).toHaveLength(1);
    expect((indexAdds[0].args[0] as { label?: string }).label).toBe("10.00");
    expect(
      adds.some(
        (c) =>
          (c.args[0] as { layerId: string }).layerId === "CONTOURS" &&
          (c.args[0] as { label?: string }).label === "20.00",
      ),
    ).toBe(true);
  });

  it("wraps all addLinework calls in one transaction", async () => {
    const model = fakeModel({ surfaces: [benchSurface()] });
    const { api, calls } = fakeApi(model);
    const { services } = fakeServices(scriptedDialogs);
    await runBuildContours(model, api, services);

    const ops = calls.map((c) => c.op);
    const beginIdx = ops.indexOf("beginTx");
    const endIdx = ops.indexOf("endTx");
    const firstAdd = ops.indexOf("addLinework");
    const lastAdd = ops.lastIndexOf("addLinework");
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(firstAdd).toBeGreaterThan(beginIdx);
    expect(endIdx).toBeGreaterThan(lastAdd);
    expect(ops.indexOf("addLinework", endIdx)).toBe(-1);
  });

  it("logs an error when no TIN surface exists yet", async () => {
    const model = fakeModel();
    const { api, calls } = fakeApi(model);
    const { services, log } = fakeServices(scriptedDialogs);
    await runBuildContours(model, api, services);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("build a TIN surface first"),
      "error",
    );
    expect(calls.some((c) => c.op === "addLinework")).toBe(false);
  });
});
