import { useCallback, useEffect, useState } from "react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

import { SOLANA_USDC_MINT } from "../lib/config.ts";
import { getAssociatedTokenAddress, getConnection } from "../payments/phantomPay.ts";

export interface SolanaBalances {
  sol: number | null;
  usdc: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const POLL_MS = 30_000;

export function useSolanaBalances(address: string | null): SolanaBalances {
  const [sol, setSol] = useState<number | null>(null);
  const [usdc, setUsdc] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!address) {
      setSol(null);
      setUsdc(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const conn = getConnection();
        const owner = new PublicKey(address);
        const mint = new PublicKey(SOLANA_USDC_MINT);
        const ata = getAssociatedTokenAddress(mint, owner);
        const [lamports, tokenBalance] = await Promise.all([
          conn.getBalance(owner, "confirmed"),
          // A wallet with no USDC token account yet simply holds 0 USDC.
          conn.getTokenAccountBalance(ata, "confirmed").catch(() => null),
        ]);
        if (cancelled) return;
        setSol(lamports / LAMPORTS_PER_SOL);
        setUsdc(tokenBalance?.value?.uiAmount ?? 0);
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

  return { sol, usdc, loading, error, refresh };
}
