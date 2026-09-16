import { describe, it, expect } from "vitest";
import {
  parseDistanceBearing,
  fmtCoord,

  fmtDistance,
  fmtBearing,
  fmtArea,
  parseBearing,
  parsePackedDms,
  dmsToDeg,
  angleEntryToDeg,
} from "./format.ts";

describe("fmtCoord / fmtDistance", () => {
  it("formats with default 3 decimals", () => {
    expect(fmtCoord(1234.5)).toBe("1234.500");
    expect(fmtDistance(10)).toBe("10.000");
  });
  it("honours custom decimals", () => {
    expect(fmtCoord(1.23456, 2)).toBe("1.23");
  });
  it("returns em dash for non-finite", () => {
    expect(fmtCoord(NaN)).toBe("—");
    expect(fmtDistance(Infinity)).toBe("—");
  });
});

describe("fmtBearing", () => {
  it("formats azimuth as DMS", () => {
    expect(fmtBearing(45.5, "azimuth")).toBe("45°30'00.00\"");
  });

  it("formats gon", () => {
    expect(fmtBearing(90, "gon")).toBe("100.0000 gon");
  });

  it("never emits 60 seconds when rounding carries", () => {
    // 12.999861° = 12°59'59.50" — must NOT round to 12°59'60.00".
    // Any azimuth whose seconds fall in [59.995, 60) must carry into minutes.
    for (const az of [0.016665, 12.16663, 89.999861, 270.999861]) {
      expect(fmtBearing(az, "azimuth")).not.toMatch(/'60\./);
      expect(fmtBearing(az, "azimuth")).not.toMatch(/60\.\d+"$/);
    }
  });

  it("resolves cardinal directions in quadrant mode", () => {
    // Due south (180°) must read S, not S0°…E.
    expect(fmtBearing(180, "quadrant")).toBe("S0°00'00.00\"W");
    expect(fmtBearing(0, "quadrant")).toBe("N0°00'00.00\"E");
    expect(fmtBearing(90, "quadrant")).toBe("S90°00'00.00\"E");
    expect(fmtBearing(270, "quadrant")).toBe("N90°00'00.00\"W");
  });

  it("formats quadrant bearings in all four quadrants", () => {
    expect(fmtBearing(45, "quadrant")).toBe("N45°00'00.00\"E");
    expect(fmtBearing(135, "quadrant")).toBe("S45°00'00.00\"E");
    expect(fmtBearing(225, "quadrant")).toBe("S45°00'00.00\"W");
    expect(fmtBearing(315, "quadrant")).toBe("N45°00'00.00\"W");
  });
});

describe("fmtArea", () => {
  it("shows m² for small areas", () => {
    expect(fmtArea(500)).toBe("500.00 m²");
  });
  it("adds hectare hint for large areas", () => {
    expect(fmtArea(15000)).toBe("15000.00 m² (1.5000 ha)");
  });
});

describe("parseBearing", () => {
  it("parses plain decimal azimuth", () => {
    expect(parseBearing("123.456")).toBeCloseTo(123.456, 6);
  });

  it("normalises out-of-range decimal azimuth", () => {
    expect(parseBearing("-90")).toBeCloseTo(270, 6);
  });

  it("parses quadrant bearings to azimuth", () => {
    expect(parseBearing("N45E")).toBeCloseTo(45, 6);
    expect(parseBearing("S45E")).toBeCloseTo(135, 6);
    expect(parseBearing("S45W")).toBeCloseTo(225, 6);
    expect(parseBearing("N45W")).toBeCloseTo(315, 6);
  });

  it("parses DMS quadrant bearings", () => {
    expect(parseBearing("N45°30'E")).toBeCloseTo(45.5, 6);
  });

  it("parses quadrant bearings with decimal minutes", () => {
    expect(parseBearing("N45°30.5'E")).toBeCloseTo(45 + 30.5 / 60, 9);
  });

  it("returns null for unparseable input", () => {
    expect(parseBearing("")).toBeNull();
    expect(parseBearing("nonsense")).toBeNull();
  });
});

describe("parsePackedDms (DD.MMSS surveyor shorthand)", () => {
  it("decodes minutes and seconds from the fractional digits", () => {
    expect(parsePackedDms("45.3020")).toBeCloseTo(45 + 30 / 60 + 20 / 3600, 9);
    expect(parsePackedDms("123.0759")).toBeCloseTo(123 + 7 / 60 + 59 / 3600, 9);
  });

  it("pads missing seconds with zero", () => {
    expect(parsePackedDms("90.30")).toBeCloseTo(90.5, 9);
  });

  it("treats a bare integer as whole degrees", () => {
    expect(parsePackedDms("45")).toBe(45);
  });

  it("rejects out-of-range minutes or seconds", () => {
    expect(parsePackedDms("45.6000")).toBeNull(); // 60 minutes
    expect(parsePackedDms("45.3060")).toBeNull(); // 60 seconds
  });

  it("handles fractional seconds beyond MMSS", () => {
    expect(parsePackedDms("45.302050")).toBeCloseTo(45 + 30 / 60 + 20.5 / 3600, 9);
  });

  it("accepts more than six fractional digits for high-precision seconds", () => {
    // 45.3020551 → MM=30, SS=20, fractional seconds = 0.551.
    expect(parsePackedDms("45.3020551")).toBeCloseTo(45 + 30 / 60 + 20.551 / 3600, 9);
    // 45.30205512 → fractional seconds = 0.5512.
    expect(parsePackedDms("45.30205512")).toBeCloseTo(45 + 30 / 60 + 20.5512 / 3600, 9);
  });
});

describe("dmsToDeg", () => {
  it("composes components", () => {
    expect(dmsToDeg(45, 30, 20)).toBeCloseTo(45 + 30 / 60 + 20 / 3600, 9);
  });
  it("applies a negative degree sign to the whole angle", () => {
    expect(dmsToDeg(-10, 30, 0)).toBeCloseTo(-10.5, 9);
  });
});

describe("angleEntryToDeg", () => {
  it("decimal mode parses plain degrees", () => {
    expect(angleEntryToDeg("decimal", "123.456")).toBeCloseTo(123.456, 9);
  });
  it("packed mode parses DD.MMSS", () => {
    expect(angleEntryToDeg("packed", "45.3020")).toBeCloseTo(45.50556, 4);
  });

  it("packed mode accepts fractional seconds beyond six digits", () => {
    expect(angleEntryToDeg("packed", "45.3020551")).toBeCloseTo(45 + 30 / 60 + 20.551 / 3600, 9);
  });
  it("gon mode converts gradians to degrees", () => {
    expect(angleEntryToDeg("gon", "100")).toBeCloseTo(90, 9);
  });
  it("dms mode parses space-separated components", () => {
    expect(angleEntryToDeg("dms", "45 30 20")).toBeCloseTo(45 + 30 / 60 + 20 / 3600, 6);
  });
  it("returns null on empty input", () => {
    expect(angleEntryToDeg("decimal", "")).toBeNull();
  });
});

describe("parseDistanceBearing", () => {
  it("parses decimal distance<angle", () => {
    const r = parseDistanceBearing("50<30", "decimal");
    expect(r).not.toBeNull();
    expect(r!.distance).toBe(50);
    expect(r!.azimuthDeg).toBeCloseTo(30, 9);
  });

  it("parses gon angle", () => {
    const r = parseDistanceBearing("100<100", "gon");
    expect(r).not.toBeNull();
    expect(r!.distance).toBe(100);
    expect(r!.azimuthDeg).toBeCloseTo(90, 9);
  });

  it("accepts an optional leading @", () => {
    const r = parseDistanceBearing("@25<N45E", "packed");
    expect(r).not.toBeNull();
    expect(r!.distance).toBe(25);
    expect(r!.azimuthDeg).toBeCloseTo(45, 9);
  });

  it("returns null for inputs that should fall through to command parser", () => {
    expect(parseDistanceBearing("LAYER", "packed")).toBeNull();
    expect(parseDistanceBearing("100", "decimal")).toBeNull();
    expect(parseDistanceBearing("<45", "decimal")).toBeNull();
  });
});
