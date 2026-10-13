import { describe, it, expect } from "vitest";
import {
  fitHelmert,
  inverseHelmert,
  applyHelmert,
  helmertDiagnostics,
  detectOutliers,
  fitAffine,
  inverseAffine,
  applyAffine,
} from "./transform.ts";
import { type NE } from "./cogo.ts";

describe("Helmert transform", () => {
  it("recovers a known similarity transform", () => {
    const src: NE[] = [
      { n: 0, e: 0 },
      { n: 10, e: 0 },
      { n: 10, e: 10 },
      { n: 0, e: 10 },
    ];
    const t0 = {
      scale: 2,
      rotationDeg: 90,
      translationN: 100,
      translationE: 200,
    };
    const tgt = src.map((p) => applyHelmert(p, t0));
    const fit = fitHelmert(src, tgt);
    expect(fit).not.toBeNull();
    expect(fit!.scale).toBeCloseTo(2, 9);
    expect(fit!.rotationDeg).toBeCloseTo(90, 9);
    expect(fit!.translationN).toBeCloseTo(100, 9);
    expect(fit!.translationE).toBeCloseTo(200, 9);
  });

  it("round-trips through the inverse", () => {
    const src: NE[] = [
      { n: 1, e: 2 },
      { n: 5, e: -3 },
      { n: -2, e: 7 },
    ];
    const t = {
      scale: 0.9996,
      rotationDeg: 12.5,
      translationN: 1000,
      translationE: 2000,
    };
    const tgt = src.map((p) => applyHelmert(p, t));
    const inv = inverseHelmert(t);
    for (let i = 0; i < src.length; i++) {
      const back = applyHelmert(tgt[i], inv);
      expect(back.n).toBeCloseTo(src[i].n, 9);
      expect(back.e).toBeCloseTo(src[i].e, 9);
    }
  });

  it("reports zero diagnostics for a perfect fit", () => {
    const src: NE[] = [
      { n: 0, e: 0 },
      { n: 10, e: 0 },
      { n: 0, e: 10 },
    ];
    const t = fitHelmert(src, src);
    expect(t).not.toBeNull();
    const d = helmertDiagnostics(t!, src, src);
    expect(d).not.toBeNull();
    expect(d!.rmse).toBeCloseTo(0, 9);
    expect(d!.maxOffset).toBeCloseTo(0, 9);
  });

  it("detects a gross outlier", () => {
    const src: NE[] = [
      { n: 0, e: 0 },
      { n: 10, e: 0 },
      { n: 0, e: 10 },
      { n: 10, e: 10 },
    ];
    const tgt: NE[] = [...src];
    tgt[2] = { n: tgt[2].n + 100, e: tgt[2].e };
    const outliers = detectOutliers(src, tgt, 1);
    expect(outliers).not.toBeNull();
    expect(outliers!.includes(2)).toBe(true);
  });
});

describe("Affine transform", () => {
  it("recovers a known affine mapping", () => {
    const a = {
      a: 1.1,
      b: 0.05,
      c: 100,
      d: -0.03,
      e: 0.95,
      f: -50,
    };
    const src: NE[] = [
      { n: 0, e: 0 },
      { n: 100, e: 0 },
      { n: 0, e: 100 },
      { n: 50, e: 50 },
    ];
    const tgt = src.map((p) => applyAffine(p, a));
    const fit = fitAffine(src, tgt);
    expect(fit).not.toBeNull();
    expect(fit!.a).toBeCloseTo(1.1, 9);
    expect(fit!.b).toBeCloseTo(0.05, 9);
    expect(fit!.c).toBeCloseTo(100, 9);
    expect(fit!.d).toBeCloseTo(-0.03, 9);
    expect(fit!.e).toBeCloseTo(0.95, 9);
    expect(fit!.f).toBeCloseTo(-50, 9);
  });

  it("round-trips through the inverse", () => {
    const a = {
      a: 1.1,
      b: 0.05,
      c: 100,
      d: -0.03,
      e: 0.95,
      f: -50,
    };
    const p: NE = { n: 123, e: 456 };
    const t = applyAffine(p, a);
    const inv = inverseAffine(a);
    expect(inv).not.toBeNull();
    const back = applyAffine(t, inv!);
    expect(back.n).toBeCloseTo(p.n, 9);
    expect(back.e).toBeCloseTo(p.e, 9);
  });
});
