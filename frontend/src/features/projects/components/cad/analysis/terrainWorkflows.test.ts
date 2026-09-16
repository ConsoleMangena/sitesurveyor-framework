import { describe, expect, it, vi } from "vitest";
import type { SurveySurface } from "../cadModel.ts";
import { aspectColor, runTerrainAnalysis } from "./terrainWorkflows";
import { fakeApi, fakeModel, fakeServices } from "./testHarness";

/** The 8-wind-sector palette moved verbatim from CadWorkspace. */
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

describe("aspectColor", () => {
  it("maps the cardinal sectors and treats null as neutral grey", () => {
    expect(aspectColor(0)).toBe("#dc2626"); // N
    expect(aspectColor(90)).toBe("#eab308"); // E
    expect(aspectColor(180)).toBe("#16a34a"); // S
    expect(aspectColor(270)).toBe("#3b82f6"); // W
    expect(aspectColor(null)).toBe("#64748b");
  });

  it("wraps angles past north back into the N sector", () => {
    expect(aspectColor(350)).toBe("#dc2626");
  });
});

/** Two-triangle slab at constant z — flat ⇒ null aspects, zero slopes. */
function flatSurface(): SurveySurface {
  return {
    id: "sf-flat",
    name: "Existing",
    layerId: "TOPO",
    visible: true,
    points: [
      { n: 0, e: 0, z: 10 },
      { n: 0, e: 40, z: 10 },
      { n: 20, e: 40, z: 10 },
      { n: 20, e: 0, z: 10 },
    ],
    triangles: [
      { a: 0, b: 1, c: 2 },
      { a: 0, b: 2, c: 3 },
    ],
  };
}

describe("runTerrainAnalysis", () => {
  it("slope mode adds one slopeShade overlay sized to the TIN, shows 3D and reports", async () => {
    const fixture = flatSurface();
    const model = fakeModel({ surfaces: [fixture] });
    const { api, calls } = fakeApi(model);
    const offeredOptions: string[][] = [];
    const { services, log } = fakeServices({
      select: async (_msg, options) => {
        offeredOptions.push([...options]);
        return options[0]; // "Slope shading (steepness ramp)"
      },
    });
    await runTerrainAnalysis(model, api, services);

    expect(offeredOptions).toEqual([
      ["Slope shading (steepness ramp)", "Aspect shading (8-wind sector)"],
    ]);

    const adds = calls.filter((c) => c.op === "addSurface");
    expect(adds).toHaveLength(1);
    const srf = adds[0].args[0] as {
      name: string;
      slopeShade?: { triangles: { slopeDeg: number; color: string }[]; maxSlope: number };
    };
    expect(srf.slopeShade?.triangles).toHaveLength(fixture.triangles.length);
    expect(typeof srf.slopeShade?.maxSlope).toBe("number");
    expect(srf.name).toContain("Slope shade");
    // Slope-ramp colours are hsl(); hex palette entries would mean aspect routing.
    for (const tri of srf.slopeShade?.triangles ?? []) {
      expect(tri.color.startsWith("hsl(")).toBe(true);
    }
    expect(services.show3d).toHaveBeenCalled();
    const openReport = vi.mocked(services.openReport);
    expect(openReport).toHaveBeenCalledTimes(1);
    const [reportTitle] = openReport.mock.calls[0];
    expect(String(reportTitle)).toMatch(/^Terrain Analysis — /);
    const logText = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logText).toContain("mean slope");
  });

  it("aspect mode shades each triangle with a wind-sector palette colour", async () => {
    const fixture = flatSurface();
    const model = fakeModel({ surfaces: [fixture] });
    const { api, calls } = fakeApi(model);
    const { services } = fakeServices({
      select: async (_msg, options) => options[1], // "Aspect shading (8-wind sector)"
    });
    await runTerrainAnalysis(model, api, services);

    const adds = calls.filter((c) => c.op === "addSurface");
    expect(adds).toHaveLength(1);
    const srf = adds[0].args[0] as {
      name: string;
      slopeShade?: { triangles: { color: string }[] };
    };
    expect(srf.name).toContain("Aspect shade");
    // Flat slab ⇒ every triangle is null-aspect ⇒ the neutral palette entry;
    // any other triangle must land on one of the eight sector colours.
    for (const tri of srf.slopeShade?.triangles ?? []) {
      expect([...ASPECT_COLORS, "#64748b"]).toContain(tri.color);
    }
  });

  it("logs an error when no TIN surface exists yet", async () => {
    const model = fakeModel();
    const { api, calls } = fakeApi(model);
    const { services, log } = fakeServices();
    await runTerrainAnalysis(model, api, services);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("build a TIN surface first"),
      "error",
    );
    expect(calls.some((c) => c.op === "addSurface")).toBe(false);
  });
});
