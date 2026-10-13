import { describe, expect, it } from "vitest";
import type { SurveySurface } from "../cadModel.ts";
import { runVolumeBetween, runVolumeToElevation } from "./volumeWorkflows";
import { fakeApi, fakeModel, fakeServices } from "./testHarness";

/**
 * Flat rectangular slab (two triangles) at constant elevation `z`, spanning
 * n ∈ [nOffset, nOffset+20], e ∈ [0, eMax]. Hand-written geometry keeps the
 * volume math exactly predictable.
 */
function slabSurface(
  name: string,
  z: number,
  opts: { eMax?: number; nOffset?: number } = {},
): SurveySurface {
  const { eMax = 40, nOffset = 0 } = opts;
  return {
    id: `sf-${name}`,
    name,
    layerId: "TOPO",
    visible: true,
    points: [
      { n: nOffset, e: 0, z },
      { n: nOffset, e: eMax, z },
      { n: nOffset + 20, e: eMax, z },
      { n: nOffset + 20, e: 0, z },
    ],
    triangles: [
      { a: 0, b: 1, c: 2 },
      { a: 0, b: 2, c: 3 },
    ],
  };
}

describe("runVolumeToElevation", () => {
  it("adds a CUT_FILL elevation overlay, shows 3D, and logs cut/fill/net", async () => {
    const model = fakeModel({ surfaces: [slabSurface("Existing", 5)] });
    const { api, calls } = fakeApi(model);
    const selectedOptions: string[][] = [];
    const RL = 20; // above the whole surface ⇒ every triangle is fill
    const { services, log } = fakeServices({
      select: async (_msg, options) => {
        selectedOptions.push([...options]);
        return "Custom value…";
      },
      prompt: async () => String(RL),
    });
    await runVolumeToElevation(model, api, services);

    // One surface ⇒ pickSurface short-circuits, so the only select offers the
    // lowest/highest/mean levels derived from the fixture plus the custom entry.
    expect(selectedOptions).toHaveLength(1);
    expect(selectedOptions[0]).toEqual([
      "Lowest (5.000 m)",
      "Highest (5.000 m)",
      "Mean (5.000 m)",
      "Custom value…",
    ]);

    const adds = calls.filter((c) => c.op === "addSurface");
    expect(adds).toHaveLength(1);
    const srf = adds[0].args[0] as {
      layerId: string;
      cutFill?: { mode: string; reference?: number };
    };
    expect(srf.layerId).toBe("CUT_FILL");
    expect(srf.cutFill?.mode).toBe("elevation");
    expect(srf.cutFill?.reference).toBe(RL);
    expect(services.show3d).toHaveBeenCalled();

    const logText = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logText).toContain("cut ");
    expect(logText).toContain("fill ");
    expect(logText).toContain("net ");
    // Sign convention (SurfaceCutFill: +cut / −fill): RL above the surface
    // means the ground sits below the datum ⇒ fill dominates, net negative.
    expect(logText).toMatch(/net -[\d.]+ m³/);
  });

  it("logs an error when no TIN surface exists yet", async () => {
    const model = fakeModel();
    const { api, calls } = fakeApi(model);
    const { services, log } = fakeServices();
    await runVolumeToElevation(model, api, services);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("build a TIN surface first"),
      "error",
    );
    expect(calls.some((c) => c.op === "addSurface")).toBe(false);
  });
});

describe("runVolumeBetween", () => {
  it("overlap mode adds one CUT_FILL surface named after both inputs", async () => {
    const model = fakeModel({
      surfaces: [
        slabSurface("Design", 12), // e 0..40
        slabSurface("Existing", 8, { eMax: 10 }), // e 0..10 — partial overlap
      ],
    });
    const { api, calls } = fakeApi(model);
    const { services, log } = fakeServices({
      select: async (msg, options) => {
        if (msg.startsWith("Choose the TOP")) return options[0]; // "1. Design"
        return options.find((o) => o.startsWith("Overlap only"))!;
      },
    });
    await runVolumeBetween(model, api, services);

    const adds = calls.filter((c) => c.op === "addSurface");
    expect(adds).toHaveLength(1);
    const srf = adds[0].args[0] as {
      name: string;
      layerId: string;
      cutFill?: { mode: string };
    };
    expect(srf.name).toContain("Design");
    expect(srf.name).toContain("Existing");
    expect(srf.layerId).toBe("CUT_FILL");
    expect(srf.cutFill?.mode).toBe("between");
    expect(services.show3d).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Volume "Design" vs "Existing"'),
    );
  });

  it("strict mode logs footprint violations as errors and adds nothing", async () => {
    const model = fakeModel({
      surfaces: [
        slabSurface("Design", 12), // n 0..20, e 0..40
        slabSurface("Remote", 8, { eMax: 10, nOffset: 100 }), // fully disjoint
      ],
    });
    const { api, calls } = fakeApi(model);
    const { services, log } = fakeServices({
      select: async (msg, options) => {
        if (msg.startsWith("Choose the TOP")) return options[0];
        return options.find((o) => o.startsWith("Strict"))!;
      },
    });
    await runVolumeBetween(model, api, services);

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("outside the base footprint"),
      "error",
    );
    expect(calls.some((c) => c.op === "addSurface")).toBe(false);
  });

  it("logs an error when fewer than two surfaces exist", async () => {
    const model = fakeModel({ surfaces: [slabSurface("Lone", 5)] });
    const { api, calls } = fakeApi(model);
    const { services, log } = fakeServices();
    await runVolumeBetween(model, api, services);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("need two TIN surfaces"),
      "error",
    );
    expect(calls.some((c) => c.op === "addSurface")).toBe(false);
  });
});
