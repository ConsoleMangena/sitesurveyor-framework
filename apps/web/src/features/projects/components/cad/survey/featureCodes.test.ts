import { describe, it, expect } from "vitest";
import {
  parseCode,
  buildCodeTable,
  resolveFeature,
  UNKNOWN_FEATURE,
} from "./featureCodes.ts";

describe("parseCode", () => {
  it("splits a base code from its string-number suffix", () => {
    expect(parseCode("FL1")).toEqual({ base: "FL", string: 1, raw: "FL1" });
    expect(parseCode("fl12")).toEqual({ base: "FL", string: 12, raw: "FL12" });
  });

  it("treats a bare code as having no string number", () => {
    expect(parseCode("WALL")).toEqual({ base: "WALL", string: null, raw: "WALL" });
  });

  it("normalises case and whitespace", () => {
    expect(parseCode("  ek3 ")).toEqual({ base: "EK", string: 3, raw: "EK3" });
  });
});

describe("resolveFeature", () => {
  const table = buildCodeTable();

  it("resolves a known base code regardless of string suffix", () => {
    expect(resolveFeature("FL2", table).symbol).toBe("cross");
    expect(resolveFeature("FL", table).breakline).toBe(true);
    expect(resolveFeature("TREE", table).symbol).toBe("tree");
  });

  it("falls back to the uncoded default for unknown codes", () => {
    expect(resolveFeature("ZZZ9", table)).toBe(UNKNOWN_FEATURE);
    expect(resolveFeature("", table)).toBe(UNKNOWN_FEATURE);
  });
});
