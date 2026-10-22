import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/supabase/client.ts", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import {
  parseCoinGeckoSolana,
  parseDefiLlamaSolanaTvl,
  parseEpochInfo,
} from "./solanaMarket.ts";

describe("parseCoinGeckoSolana", () => {
  it("reads the price, change, market cap and volume", () => {
    const result = parseCoinGeckoSolana({
      solana: {
        usd: 105.03,
        usd_24h_change: -1.5567,
        usd_market_cap: 61_888_000_000,
        usd_24h_vol: 2_830_000_000,
      },
    });

    expect(result).toEqual({
      price: 105.03,
      change24h: -1.5567,
      marketCap: 61_888_000_000,
      volume24h: 2_830_000_000,
    });
  });

  it("returns nulls when the payload has no solana entry", () => {
    expect(parseCoinGeckoSolana({})).toEqual({
      price: null,
      change24h: null,
      marketCap: null,
      volume24h: null,
    });
    expect(parseCoinGeckoSolana(null).price).toBeNull();
  });

  it("ignores non-finite numbers", () => {
    const result = parseCoinGeckoSolana({ solana: { usd: "105" } });
    expect(result.price).toBeNull();
  });
});

describe("parseDefiLlamaSolanaTvl", () => {
  it("finds the Solana chain entry", () => {
    const result = parseDefiLlamaSolanaTvl([
      { name: "Ethereum", tvl: 80_000_000_000 },
      { name: "Solana", tvl: 5_909_477_809.52 },
    ]);
    expect(result).toBeCloseTo(5_909_477_809.52, 2);
  });

  it("returns null for a non-array payload", () => {
    expect(parseDefiLlamaSolanaTvl({ chains: [] })).toBeNull();
    expect(parseDefiLlamaSolanaTvl([])).toBeNull();
  });
});

describe("parseEpochInfo", () => {
  it("prefers the slot field and keeps block height", () => {
    expect(
      parseEpochInfo({ epoch: 1064, slot: 460_069_223, blockHeight: 438_102_970 }),
    ).toEqual({
      epoch: 1064,
      slot: 460_069_223,
      blockHeight: 438_102_970,
    });
  });

  it("falls back to absoluteSlot", () => {
    const result = parseEpochInfo({
      epoch: 1064,
      absoluteSlot: 460_069_041,
      blockHeight: 438_102_788,
    });
    expect(result.slot).toBe(460_069_041);
    expect(result.epoch).toBe(1064);
  });

  it("returns nulls for an empty payload", () => {
    expect(parseEpochInfo(null)).toEqual({
      epoch: null,
      slot: null,
      blockHeight: null,
    });
  });
});
