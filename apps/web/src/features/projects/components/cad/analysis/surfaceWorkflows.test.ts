import { describe, expect, it } from "vitest";
import { runBuildSurface, runBuildSurfaceWithBreaklines } from "./surfaceWorkflows";
import { fakeApi, fakeModel, fakeServices } from "./testHarness";
// buildTin is async (WASM bridge w/ TS fallback) — the exported workflows
// await internally, so tests simply await them.

function pts(count: number) {
  // Well-spread 3D points: a zig-zag either side of the north axis so any
  // three triangulate to non-degenerate triangles (the plan's linear
  // n=i*10/e=i*7 ramp proved collinear and yields zero triangles).
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`, pointNo: String(i), n: i * 10, e: (i % 2) * 40, z: i * 3, code: "", layerId: "TOPO",
  }));
}

describe("runBuildSurface", () => {
  it("adds one TOPO surface", async () => {
    const model = fakeModel({ points: pts(3) });
    const { api, calls } = fakeApi(model);
    const { services, log } = fakeServices();
    await runBuildSurface(model, api, services);
    const adds = calls.filter((c) => c.op === "addSurface");
    expect(adds).toHaveLength(1);
    expect((adds[0].args[0] as { layerId: string }).layerId).toBe("TOPO");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("triangles"));
    expect(services.fitExtents).toHaveBeenCalled();
  });

  it("replaces any previous TOPO surfaces before adding the new one", async () => {
    const stale = {
      id: "sf-old", name: "Surface 1", layerId: "TOPO", visible: true,
      points: [], triangles: [],
    };
    const model = fakeModel({ points: pts(3), surfaces: [stale] });
    const { api, calls } = fakeApi(model);
    const { services } = fakeServices();
    await runBuildSurface(model, api, services);
    expect(calls.some((c) => c.op === "deleteSurface" && c.args[0] === "sf-old")).toBe(true);
    expect(calls.indexOf(calls.find((c) => c.op === "deleteSurface")!))
      .toBeLessThan(calls.indexOf(calls.find((c) => c.op === "addSurface")!));
  });

  it("logs an error when fewer than 3 valid-Z points exist", async () => {
    const model = fakeModel({ points: pts(2) });
    const { api } = fakeApi(model);
    const { services, log } = fakeServices();
    await runBuildSurface(model, api, services);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("at least 3 points"), "error");
  });

  it("uses a selected closed ring as the clip boundary (constrained variant)", async () => {
    const ring = {
      id: "lw-ring", kind: "boundary" as const, closed: true,
      vertices: [{ n: 0, e: 0 }, { n: 100, e: 0 }, { n: 50, e: 80 }],
      layerId: "BOUNDARY",
    };
    const model = fakeModel({
      points: pts(4),
      linework: [ring],
    });
    const selection = { type: "linework" as const, id: "lw-ring", items: [{ type: "linework" as const, id: "lw-ring" }] };
    const { api, calls } = fakeApi(model);
    const { services } = fakeServices();
    await runBuildSurfaceWithBreaklines(model, selection, api, services);
    const adds = calls.filter((c) => c.op === "addSurface");
    expect(adds).toHaveLength(1);
    expect((adds[0].args[0] as { name: string }).name).toContain("(constrained)");
  });
});
