import { describe, expect, it } from "vitest";

import {
  deltaClass,
  formatCompact,
  formatPercent,
  formatSlot,
  formatTokenAmount,
  formatUsd,
} from "./format.ts";

describe("formatUsd", () => {
  it("renders a dash for missing values", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatUsd(undefined)).toBe("—");
    expect(formatUsd(Number.NaN)).toBe("—");
  });

  it("renders small and large amounts", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(105.03)).toBe("$105.03");
    expect(formatUsd(0.0012)).toBe("$0.0012");
  });

  it("compacts large market caps", () => {
    expect(formatUsd(61_888_000_000, { compact: true })).toBe("$61.89B");
    expect(formatUsd(2_830_000_000, { compact: true })).toBe("$2.83B");
  });
});

describe("formatCompact", () => {
  it("scales to B, M and K", () => {
    expect(formatCompact(1_500_000_000)).toBe("1.50B");
    expect(formatCompact(2_500_000)).toBe("2.50M");
    expect(formatCompact(12_400)).toBe("12.4K");
  });
});

describe("formatPercent", () => {
  it("signs positive values and keeps the dash for missing ones", () => {
    expect(formatPercent(2.5)).toBe("+2.50%");
    expect(formatPercent(-1.25)).toBe("-1.25%");
    expect(formatPercent(0)).toBe("0.00%");
    expect(formatPercent(null)).toBe("—");
  });
});

describe("formatTokenAmount", () => {
  it("keeps precision for small balances", () => {
    expect(formatTokenAmount(0)).toBe("0");
    expect(formatTokenAmount(1.5)).toBe("1.5");
    expect(formatTokenAmount(0.00005)).toBe("5.00e-5");
  });
});

describe("formatSlot", () => {
  it("groups thousands and dashes missing slots", () => {
    expect(formatSlot(460_069_223)).toBe("460,069,223");
    expect(formatSlot(null)).toBe("—");
  });
});

describe("deltaClass", () => {
  it("maps the sign to the up/down classes", () => {
    expect(deltaClass(1.2)).toBe("web3-delta-up");
    expect(deltaClass(-1.2)).toBe("web3-delta-down");
    expect(deltaClass(0)).toBe("");
    expect(deltaClass(null)).toBe("");
  });
});
