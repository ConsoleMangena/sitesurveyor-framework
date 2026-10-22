import { describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/supabase/client.ts", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { parseDexScreenerQuote, parseTokenAccounts } from "./portfolio.ts";

const MINT_A = "FhMxWnZts95ViF8hgzwvomydAiLP9qfgZHyGRnvkNia5";

function account(
  mint: string,
  amount: string,
  decimals: number,
): unknown {
  return {
    pubkey: "1GBCYei68HwbDnVGTSLkYoRfzsEyA8AaRaPQ3uQ6NKv",
    account: {
      data: {
        program: "spl-token",
        parsed: {
          info: {
            mint,
            owner: "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9",
            state: "initialized",
            tokenAmount: { amount, decimals, uiAmount: Number(amount) / 10 ** decimals },
          },
        },
        type: "account",
      },
    },
  };
}

describe("parseTokenAccounts", () => {
  it("decodes token amounts with their decimals", () => {
    const result = parseTokenAccounts({
      value: [account(MINT_A, "10000000000000", 9)],
    });

    expect(result).toEqual([{ mint: MINT_A, amount: 10_000, decimals: 9 }]);
  });

  it("sums multiple accounts for the same mint", () => {
    const result = parseTokenAccounts({
      value: [
        account(MINT_A, "1000000000000", 9),
        account(MINT_A, "2000000000000", 9),
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].amount).toBeCloseTo(3_000, 6);
  });

  it("drops empty accounts and unusable entries", () => {
    const result = parseTokenAccounts({
      value: [
        account(MINT_A, "0", 9),
        { account: { data: { parsed: { info: {} } } } },
        "not-an-account",
      ],
    });

    expect(result).toEqual([]);
  });

  it("returns an empty list for a malformed payload", () => {
    expect(parseTokenAccounts(null)).toEqual([]);
    expect(parseTokenAccounts({ value: "nope" })).toEqual([]);
  });
});

describe("parseDexScreenerQuote", () => {
  it("uses the deepest pair for price, change and metadata", () => {
    const result = parseDexScreenerQuote({
      pairs: [
        {
          liquidity: { usd: 1_000 },
          priceUsd: "1.1",
          priceChange: { h24: 1 },
          baseToken: { symbol: "SHALLOW", name: "Shallow", image: "a.png" },
        },
        {
          liquidity: { usd: 900_000 },
          priceUsd: "104.5",
          priceChange: { h24: -3.25 },
          baseToken: { symbol: "SOL", name: "Wrapped SOL", image: "b.png" },
        },
      ],
    });

    expect(result).toEqual({
      price: 104.5,
      change24h: -3.25,
      symbol: "SOL",
      name: "Wrapped SOL",
      icon: "b.png",
    });
  });

  it("returns null when there are no pairs", () => {
    expect(parseDexScreenerQuote({ pairs: [] })).toBeNull();
    expect(parseDexScreenerQuote(null)).toBeNull();
  });
});
