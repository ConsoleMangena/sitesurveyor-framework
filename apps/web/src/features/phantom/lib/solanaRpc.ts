/**
 * Read-only Solana RPC access.
 *
 * Direct browser calls to the public RPC endpoints fail CORS in several
 * contexts, so reads go through the `solana-data` Edge Function proxy.
 */

import { SOLANA_CLUSTER } from "./config.ts";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(
  /\/$/,
  "",
);

const EDGE_FUNCTION_URL = SUPABASE_URL
  ? `${SUPABASE_URL}/functions/v1/solana-data`
  : "";

export async function solanaRpc<T>(method: string, params: unknown[]): Promise<T> {
  if (!EDGE_FUNCTION_URL) throw new Error("solana-data Edge Function URL not configured");
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "rpc", method, params, cluster: SOLANA_CLUSTER }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `RPC proxy failed (${res.status})`);
  }
  const { result } = await res.json();
  return result as T;
}

/** Wallet balance in lamports, paid from the connected wallet for network fees. */
export async function getWalletBalanceLamports(address: string): Promise<number> {
  const result = await solanaRpc<{ value: number }>("getBalance", [
    address,
    { commitment: "confirmed" },
  ]);
  return result?.value ?? 0;
}
