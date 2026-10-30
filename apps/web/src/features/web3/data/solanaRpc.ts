/**
 * Solana RPC access for the web3 surfaces.
 *
 * Browser-reachable public RPCs block the account methods we need
 * (`api.mainnet-beta.solana.com` refuses CORS requests outright and the free
 * publicnode tier rejects `getTokenAccountsByOwner`), so traffic is proxied
 * through the `solana-data` edge function. When the function is not deployed we
 * degrade to the publicnode endpoint for the handful of methods it does serve
 * (getBalance, getEpochInfo, getSlot).
 */

import { supabase } from "../../../lib/supabase/client.ts";

export const SOLANA_DATA_FUNCTION = "solana-data";

/** Free, browser-reachable mainnet RPC used as the direct fallback. */
export const MAINNET_RPC_FALLBACK = "https://solana-rpc.publicnode.com";

const RPC_TIMEOUT_MS = 12_000;

/** Methods the public fallback endpoint is allowed to serve. */
const FALLBACK_METHODS = new Set(["getBalance", "getEpochInfo", "getSlot"]);

interface RpcEnvelope {
  jsonrpc?: string;
  id?: number | string;
  result?: unknown;
  error?: { code?: number; message?: string };
}

async function postJson(
  url: string,
  body: unknown,
  timeoutMs = RPC_TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Calls a JSON-RPC method on mainnet-beta.
 * Returns `null` when neither the edge function nor the fallback can serve it.
 */
export async function solanaRpc<T = unknown>(
  method: string,
  params: unknown[] = [],
): Promise<T | null> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      result?: T;
      error?: string;
    }>(SOLANA_DATA_FUNCTION, {
      body: { action: "rpc", method, params },
    });
    if (!error && data?.result !== undefined && data.result !== null) {
      return data.result;
    }
  } catch {
    // Fall through to the direct endpoint.
  }

  if (!FALLBACK_METHODS.has(method)) return null;

  try {
    const envelope = (await postJson(MAINNET_RPC_FALLBACK, {
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    })) as RpcEnvelope;
    if (envelope.error) return null;
    return (envelope.result ?? null) as T | null;
  } catch {
    return null;
  }
}
