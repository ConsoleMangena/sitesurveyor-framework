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
}

const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true";
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

/** Normalises the CoinGecko simple-price payload for Solana. */
export function parseCoinGeckoSolana(
  payload: unknown,
): Pick<
  SolanaMarketSnapshot,
  "price" | "change24h" | "marketCap" | "volume24h"
> {
  const solana = (payload as { solana?: Record<string, unknown> } | null)?.solana;
  if (!solana || typeof solana !== "object") {
    return { price: null, change24h: null, marketCap: null, volume24h: null };
  }
  return {
    price: asFiniteNumber(solana.usd),
    change24h: asFiniteNumber(solana.usd_24h_change),
    marketCap: asFiniteNumber(solana.usd_market_cap),
    volume24h: asFiniteNumber(solana.usd_24h_vol),
  };
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
  const [price, tvl, epoch] = await Promise.all([
    fetchJson(COINGECKO_URL)
      .then(parseCoinGeckoSolana)
      .catch(() => ({ price: null, change24h: null, marketCap: null, volume24h: null })),
    fetchJson(DEFILLAMA_URL)
      .then(parseDefiLlamaSolanaTvl)
      .catch(() => null),
    solanaRpc<Record<string, unknown>>("getEpochInfo").then(parseEpochInfo),
  ]);

  return {
    price: price.price,
    change24h: price.change24h,
    marketCap: price.marketCap,
    volume24h: price.volume24h,
    tvl,
    epoch: epoch.epoch,
    slot: epoch.slot,
    blockHeight: epoch.blockHeight,
    updatedAt: Date.now(),
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
      return { ...EMPTY_MARKET_SNAPSHOT, ...data, updatedAt: Date.now() };
    }
  } catch {
    // Fall through to the direct path.
  }
  return fetchDirectSnapshot();
}
