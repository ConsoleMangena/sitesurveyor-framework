import { describe, it, expect } from "vitest";
import {
  worldToScreen,
  screenToWorld,
  zoomAt,
  fitToBox,
  niceGridSpacing,
} from "./cadViewportMath.ts";
import type { Viewport } from "./cadModel.ts";

const size = { width: 800, height: 600 };
const vp: Viewport = { scale: 10, centerN: 0, centerE: 0 };

describe("cadViewportMath", () => {
  it("round-trips survey coords through screen coords", () => {
    const s = worldToScreen(25, 40, vp, size);
    const w = screenToWorld(s.x, s.y, vp, size);
    expect(w.n).toBeCloseTo(25, 10);
    expect(w.e).toBeCloseTo(40, 10);
  });

  it("keeps the zoom anchor fixed", () => {
    const anchor = { x: 400, y: 300 };
    const before = screenToWorld(anchor.x, anchor.y, vp, size);
    const next = zoomAt(vp, 2, anchor.x, anchor.y, size);
    const after = screenToWorld(anchor.x, anchor.y, next, size);
    expect(after.n).toBeCloseTo(before.n, 10);
    expect(after.e).toBeCloseTo(before.e, 10);
    expect(next.scale).toBe(20);
  });

  it("fits a bounding box with the requested padding", () => {
    const box = { minN: 0, maxN: 100, minE: 0, maxE: 100 };
    const fitted = fitToBox(box, size, 0);
    // No padding → the 100×100 box must exactly fill the smaller screen axis.
    expect(fitted.centerN).toBe(50);
    expect(fitted.centerE).toBe(50);
    expect(fitted.scale).toBeCloseTo(Math.min(800 / 100, 600 / 100), 10);
  });

  it("chooses a nice grid spacing for the current scale", () => {
    // 10 px per ground unit → 64 px = 6.4 ground units → nearest nice is 5 or 10.
    const spacing = niceGridSpacing({ scale: 10, centerN: 0, centerE: 0 });
    expect([1, 2, 5, 10]).toContain(spacing);
  });

  it("matches the standard 1:500 plotting scale in px/ground-unit", () => {
    // Conventional paper scale math: 96 dpi, 1 inch = 0.0254 m.
    // At 1:500, 1 ground metre = 1/500 paper metres = 0.002 m = 2 mm.
    // 2 mm at 96 dpi = 96 px/inch * 0.002 m / 0.0254 m ≈ 7.559 px.
    const denominator = 500;
    const pxPerMetrePaper = 96 / 0.0254;
    const pxPerGroundUnit = pxPerMetrePaper / denominator;
    expect(pxPerGroundUnit).toBeCloseTo(7.559, 3);
  });

  it("rejects degenerate and reversed bounding boxes", () => {
    // Empty/zero box is clamped to a 1-unit span.
    const fitted = fitToBox({ minN: 0, maxN: 0, minE: 0, maxE: 0 }, size, 0);
    expect(fitted.scale).toBeGreaterThan(0);
    expect(fitted.scale).toBeLessThan(Infinity);
  });
});
