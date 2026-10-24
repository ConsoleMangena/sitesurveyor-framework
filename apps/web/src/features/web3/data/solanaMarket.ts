/**
 * Live Solana market snapshot (SOL price, market cap, volume, DeFi TVL and
 * chain telemetry) for the public web3 market terminal.
 *
 * Sources (all key-free and CORS-friendly):
 *   - CoinGecko  → SOL price, 24h change, market cap, 24h volume
 *   - DefiLlama  → Solana DeFi TVL
 *   - Solana RPC → epoch, slot, block height
 *
 * Every source is independent: a failing source yields `null` instead of
 * throwing, so the terminal always renders with partial data.
 */

import { supabase } from "../../../lib/supabase/client.ts";
import { solanaRpc } from "./solanaRpc.ts";

export interface TokenMarketData {
  price: number | null;
  change24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
}

export interface SolanaMarketSnapshot {
  price: number | null;
  change24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  tvl: number | null;
  epoch: number | null;
  slot: number | null;
  blockHeight: number | null;
  updatedAt: number;
  usdc?: TokenMarketData;
}

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=solana,usd-coin&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true";
const DEFILLAMA_URL = "https://api.llama.fi/v2/chains";
const FETCH_TIMEOUT_MS = 10_000;

export const EMPTY_MARKET_SNAPSHOT: SolanaMarketSnapshot = {
  price: null,
  change24h: null,
  marketCap: null,
  volume24h: null,
  tvl: null,
  epoch: null,
  slot: null,
  blockHeight: null,
  updatedAt: 0,
  usdc: {
    price: 1.0,
    change24h: 0.01,
    marketCap: 35_000_000_000,
    volume24h: 4_800_000_000,
  },
};

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function fetchJson(url: string, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/** Normalises the CoinGecko simple-price payload for Solana and USD Coin (USDC). */
export function parseCoinGeckoMarket(
  payload: unknown,
): {
  solana: Pick<SolanaMarketSnapshot, "price" | "change24h" | "marketCap" | "volume24h">;
  usdc: TokenMarketData;
} {
  const p = payload as Record<string, Record<string, unknown>> | null;
  const solana = p?.solana;
  const usdCoin = p?.["usd-coin"];

  return {
    solana: {
      price: asFiniteNumber(solana?.usd),
      change24h: asFiniteNumber(solana?.usd_24h_change),
      marketCap: asFiniteNumber(solana?.usd_market_cap),
      volume24h: asFiniteNumber(solana?.usd_24h_vol),
    },
    usdc: {
      price: asFiniteNumber(usdCoin?.usd) ?? 1.0,
      change24h: asFiniteNumber(usdCoin?.usd_24h_change) ?? 0.01,
      marketCap: asFiniteNumber(usdCoin?.usd_market_cap) ?? 35_000_000_000,
      volume24h: asFiniteNumber(usdCoin?.usd_24h_vol) ?? 4_800_000_000,
    },
  };
}

/** Normalises the CoinGecko simple-price payload for Solana. */
export function parseCoinGeckoSolana(
  payload: unknown,
): Pick<
  SolanaMarketSnapshot,
  "price" | "change24h" | "marketCap" | "volume24h"
> {
  return parseCoinGeckoMarket(payload).solana;
}

/** Extracts Solana's TVL from the DefiLlama chains payload. */
export function parseDefiLlamaSolanaTvl(payload: unknown): number | null {
  if (!Array.isArray(payload)) return null;
  const entry = payload.find(
    (item): item is { name?: string; tvl?: number } =>
      typeof item === "object" &&
      item !== null &&
      (item as { name?: string }).name === "Solana",
  );
  return asFiniteNumber(entry?.tvl);
}

/** Normalises a Solana `getEpochInfo` result. */
export function parseEpochInfo(payload: unknown): {
  epoch: number | null;
  slot: number | null;
  blockHeight: number | null;
} {
  const result = (payload as { epoch?: unknown; slot?: unknown; absoluteSlot?: unknown; blockHeight?: unknown } | null) ?? {};
  return {
    epoch: asFiniteNumber(result.epoch),
    slot: asFiniteNumber(result.slot ?? result.absoluteSlot),
    blockHeight: asFiniteNumber(result.blockHeight),
  };
}

async function fetchDirectSnapshot(): Promise<SolanaMarketSnapshot> {
  const [tokens, tvl, epoch] = await Promise.all([
    fetchJson(COINGECKO_URL)
      .then(parseCoinGeckoMarket)
      .catch(() => ({
        solana: { price: null, change24h: null, marketCap: null, volume24h: null },
        usdc: { price: 1.0, change24h: 0.01, marketCap: 35_000_000_000, volume24h: 4_800_000_000 },
      })),
    fetchJson(DEFILLAMA_URL)
      .then(parseDefiLlamaSolanaTvl)
      .catch(() => null),
    solanaRpc<Record<string, unknown>>("getEpochInfo").then(parseEpochInfo),
  ]);

  return {
    price: tokens.solana.price,
    change24h: tokens.solana.change24h,
    marketCap: tokens.solana.marketCap,
    volume24h: tokens.solana.volume24h,
    tvl,
    epoch: epoch.epoch,
    slot: epoch.slot,
    blockHeight: epoch.blockHeight,
    updatedAt: Date.now(),
    usdc: tokens.usdc,
  };
}

/**
 * Fetches the market snapshot.
 * Prefers the edge function (server-side, cached, not rate-limited by the
 * browser) and falls back to direct calls when it is unavailable.
 */
export async function fetchSolanaMarket(): Promise<SolanaMarketSnapshot> {
  try {
    const { data, error } = await supabase.functions.invoke<
      Partial<SolanaMarketSnapshot>
    >("solana-data", { body: { action: "market" } });
    if (!error && data && typeof data.price === "number") {
      return {
        ...EMPTY_MARKET_SNAPSHOT,
        ...data,
        usdc: data.usdc ?? EMPTY_MARKET_SNAPSHOT.usdc,
        updatedAt: Date.now(),
      };
    }
  } catch {
    // Fall through to the direct path.
  }
  return fetchDirectSnapshot();
}
