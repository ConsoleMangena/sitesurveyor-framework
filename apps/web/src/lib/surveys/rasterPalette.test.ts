import { describe, expect, it } from "vitest";

import {
  RASTER_NODATA_CLASS,
  colorMapToRgba,
  colorizeClasses,
  hexToRgb,
  makeTransparent,
  paletteToRgba,
} from "./rasterPalette.ts";

describe("hexToRgb", () => {
  it("parses six-digit and shorthand colours", () => {
    expect(hexToRgb("#1a9850")).toEqual([26, 152, 80]);
    expect(hexToRgb("f80")).toEqual([255, 136, 0]);
  });

  it("rejects malformed colours", () => {
    expect(hexToRgb("#12345")).toBeNull();
    expect(hexToRgb("not-a-colour")).toBeNull();
  });
});

describe("paletteToRgba", () => {
  it("writes each palette entry in class order", () => {
    const lut = paletteToRgba(["#d73027", "#1a9850"]);
    expect([...lut.slice(0, 4)]).toEqual([215, 48, 39, 215]);
    expect([...lut.slice(4, 8)]).toEqual([26, 152, 80, 215]);
  });

  it("leaves codes past the palette fully transparent", () => {
    const lut = paletteToRgba(["#d73027"]);
    expect([...lut.slice(4, 8)]).toEqual([0, 0, 0, 0]);
    expect([...lut.slice(RASTER_NODATA_CLASS * 4, RASTER_NODATA_CLASS * 4 + 4)]).toEqual([
      0, 0, 0, 0,
    ]);
  });
});

describe("colorMapToRgba", () => {
  it("reads the red, green, and blue planes of 16-bit values", () => {
    const colorMap = new Uint16Array(256 * 3);
    colorMap[0] = 65535;
    colorMap[256 + 1] = 32768;
    colorMap[512 + 2] = 65535;

    const lut = colorMapToRgba(colorMap);

    expect(lut).not.toBeNull();
    expect([...lut!.slice(0, 4)]).toEqual([255, 0, 0, 215]);
    expect([...lut!.slice(4, 8)]).toEqual([0, 128, 0, 215]);
    expect([...lut!.slice(8, 12)]).toEqual([0, 0, 255, 215]);
  });

  it("rejects a tag that is not three colour planes", () => {
    expect(colorMapToRgba(new Uint16Array(10))).toBeNull();
  });
});

describe("colorizeClasses", () => {
  it("expands class codes and keeps nodata transparent", () => {
    const lut = paletteToRgba(["#d73027"]);
    makeTransparent(lut, RASTER_NODATA_CLASS);

    const rgba = colorizeClasses(new Uint8Array([0, 1, RASTER_NODATA_CLASS]), lut);

    expect([...rgba.slice(0, 4)]).toEqual([215, 48, 39, 215]);
    expect([...rgba.slice(4, 8)]).toEqual([0, 0, 0, 0]);
    expect([...rgba.slice(8, 12)]).toEqual([0, 0, 0, 0]);
  });

  it("ignores non-integer and out-of-range codes", () => {
    const lut = paletteToRgba(["#d73027"]);
    const rgba = colorizeClasses(new Float32Array([0.5, 300, -1]), lut);
    expect([...rgba]).toEqual(new Array(12).fill(0));
  });
});
