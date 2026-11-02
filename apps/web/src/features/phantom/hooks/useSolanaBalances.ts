import { useCallback, useEffect, useState } from "react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

import { SOLANA_CLUSTER, SOLANA_USDC_MINT } from "../lib/config.ts";
import { getAssociatedTokenAddress } from "../payments/phantomPay.ts";

export interface SolanaBalances {
  sol: number | null;
  usdc: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const POLL_MS = 30_000;
const EDGE_FUNCTION_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "") +
  "/functions/v1/solana-data";

/** Call the solana-data Edge Function for a single RPC method. */
async function rpcProxy<T>(method: string, params: unknown[]): Promise<T> {
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

/** Fetch SOL + USDC balances via the RPC proxy (CORS-safe). */
async function fetchBalancesViaProxy(address: string): Promise<{ sol: number | null; usdc: number | null }> {
  const owner = new PublicKey(address);
  const mint = new PublicKey(SOLANA_USDC_MINT);
  const ata = getAssociatedTokenAddress(mint, owner);

  const [balanceResult, tokenAccount] = await Promise.all([
    rpcProxy<{ value: number; context: unknown }>("getBalance", [address, { commitment: "confirmed" }]),
    rpcProxy<{ value: { amount: string; decimals: number; uiAmount: number | null } } | null>(
      "getTokenAccountBalance",
      [ata.toBase58(), { commitment: "confirmed" }],
    ).catch(() => null),
  ]);

  return {
    sol: balanceResult?.value != null ? balanceResult.value / LAMPORTS_PER_SOL : null,
    usdc: tokenAccount?.value?.uiAmount ?? 0,
  };
}

export function useSolanaBalances(address: string | null): SolanaBalances {
  const [sol, setSol] = useState<number | null>(null);
  const [usdc, setUsdc] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!address) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const { sol, usdc } = await fetchBalancesViaProxy(address);
        if (cancelled) return;
        setSol(sol);
        setUsdc(usdc);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load balances.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [address, tick]);

  return {
    sol: address ? sol : null,
    usdc: address ? usdc : null,
    loading: address ? loading : false,
    error: address ? error : null,
    refresh,
  };
}