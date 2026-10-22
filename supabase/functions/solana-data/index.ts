/**
 * `solana-data` — server-side Solana data proxy for the public web3 market.
 *
 * Why this exists: browser-reachable public RPCs refuse the account methods
 * the portfolio needs (`getTokenAccountsByOwner`) and `api.mainnet-beta.solana.com`
 * rejects CORS requests. From the edge runtime (no Origin header) the mainnet
 * endpoint serves them, so the browser talks to this function instead.
 *
 * Actions:
 *   - `rpc`    → JSON-RPC passthrough: { action: "rpc", method, params }
 *   - `market` → aggregated market snapshot (SOL price, cap, volume, TVL,
 *                epoch/slot) cached in Postgres for 30 seconds.
 *
 * The function is public (verify_jwt = false). Per-IP rate limiting is
 * opportunistic: the platform may run a fresh isolate per request, so the
 * in-memory buckets are best-effort. The Postgres snapshot cache is what
 * actually bounds upstream API usage.
 */

import { checkRateLimit, clientIp } from "../_shared/rate_limit.ts";
import { adminClient, corsHeaders, json } from "../_shared/supabase.ts";

const MAINNET_RPC = "https://api.mainnet-beta.solana.com";
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true";
const DEFILLAMA_URL = "https://api.llama.fi/v2/chains";

const RPC_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const MARKET_RATE_LIMIT = { limit: 40, windowMs: 60_000 };
const MARKET_CACHE_MS = 30_000;
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_ROW_ID = 1;

/** Methods the proxy is willing to forward. */
const ALLOWED_METHODS = new Set([
  "getBalance",
  "getEpochInfo",
  "getSlot",
  "getBlockHeight",
  "getTokenAccountsByOwner",
  "getTokenSupply",
  "getAccountInfo",
  "getSignatureStatuses",
  "getLatestBlockhash",
]);

interface RpcEnvelope {
  jsonrpc?: string;
  id?: number | string;
  result?: unknown;
  error?: { code?: number; message?: string };
}

interface MarketSnapshot {
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

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(MAINNET_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`RPC request failed (${response.status})`);
    const envelope = (await response.json()) as RpcEnvelope;
    if (envelope.error) {
      throw new Error(envelope.error.message ?? "RPC error");
    }
    return envelope.result ?? null;
  } finally {
    clearTimeout(timer);
  }
}

async function buildMarketSnapshot(): Promise<MarketSnapshot> {
  const [price, tvl, epoch] = await Promise.all([
    fetchJson(COINGECKO_URL)
      .then((payload) => {
        const solana = (payload as { solana?: Record<string, unknown> } | null)?.solana;
        return {
          price: asFiniteNumber(solana?.usd),
          change24h: asFiniteNumber(solana?.usd_24h_change),
          marketCap: asFiniteNumber(solana?.usd_market_cap),
          volume24h: asFiniteNumber(solana?.usd_24h_vol),
        };
      })
      .catch(() => ({
        price: null,
        change24h: null,
        marketCap: null,
        volume24h: null,
      })),
    fetchJson(DEFILLAMA_URL)
      .then((payload) => {
        if (!Array.isArray(payload)) return null;
        const entry = payload.find(
          (item) =>
            typeof item === "object" &&
            item !== null &&
            (item as { name?: string }).name === "Solana",
        );
        return asFiniteNumber((entry as { tvl?: number } | undefined)?.tvl);
      })
      .catch(() => null),
    rpcCall("getEpochInfo", [])
      .then((result) => {
        const info = (result ?? {}) as Record<string, unknown>;
        return {
          epoch: asFiniteNumber(info.epoch),
          slot: asFiniteNumber(info.slot ?? info.absoluteSlot),
          blockHeight: asFiniteNumber(info.blockHeight),
        };
      })
      .catch(() => ({ epoch: null, slot: null, blockHeight: null })),
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
 * Reads the shared snapshot from Postgres. Missing table / RLS / network
 * failures all degrade to `null` so the function keeps working before the
 * migration is applied.
 */
async function readCachedSnapshot(): Promise<MarketSnapshot | null> {
  try {
    const { data, error } = await adminClient()
      .from("solana_market_cache")
      .select("payload, updated_at")
      .eq("id", CACHE_ROW_ID)
      .maybeSingle();
    if (error || !data) return null;

    const updatedAt = Date.parse(String(data.updated_at));
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > MARKET_CACHE_MS) {
      return null;
    }
    return data.payload as MarketSnapshot;
  } catch {
    return null;
  }
}

async function writeCachedSnapshot(snapshot: MarketSnapshot): Promise<void> {
  try {
    await adminClient()
      .from("solana_market_cache")
      .upsert({
        id: CACHE_ROW_ID,
        payload: snapshot,
        updated_at: new Date().toISOString(),
      });
  } catch {
    // Cache writes are best-effort.
  }
}

async function handleMarket(): Promise<Response> {
  const cached = await readCachedSnapshot();
  if (cached) return noStore(json(cached));

  const snapshot = await buildMarketSnapshot();
  await writeCachedSnapshot(snapshot);
  return noStore(json(snapshot));
}

async function handleRpc(method: string, params: unknown[]): Promise<Response> {
  if (!ALLOWED_METHODS.has(method)) {
    return json({ error: `Method not allowed: ${method}` }, 400);
  }
  try {
    const result = await rpcCall(method, params);
    return noStore(json({ result }));
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "RPC request failed" },
      502,
    );
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: { action?: string; method?: string; params?: unknown[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const ip = clientIp(req);
  const action = body.action ?? "market";

  if (action === "market") {
    const limit = checkRateLimit({ key: `market:${ip}`, ...MARKET_RATE_LIMIT });
    if (!limit.allowed) {
      return json(
        { error: "Too many requests", retryAfter: limit.retryAfterSeconds },
        429,
      );
    }
    try {
      return await handleMarket();
    } catch (error) {
      return json(
        { error: error instanceof Error ? error.message : "Market data failed" },
        502,
      );
    }
  }

  if (action === "rpc") {
    const limit = checkRateLimit({ key: `rpc:${ip}`, ...RPC_RATE_LIMIT });
    if (!limit.allowed) {
      return json(
        { error: "Too many requests", retryAfter: limit.retryAfterSeconds },
        429,
      );
    }
    return await handleRpc(body.method ?? "", body.params ?? []);
  }

  return json({ error: `Unknown action: ${action}` }, 400);
});
