import { useCallback, useEffect, useState } from "react";

import {
  EMPTY_MARKET_SNAPSHOT,
  fetchSolanaMarket,
  type SolanaMarketSnapshot,
} from "../data/solanaMarket.ts";

export interface SolanaMarketFeed {
  snapshot: SolanaMarketSnapshot;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const POLL_MS = 30_000;

/** Polls the live Solana market snapshot; pauses while the tab is hidden. */
export function useSolanaMarketFeed(): SolanaMarketFeed {
  const [snapshot, setSnapshot] = useState<SolanaMarketSnapshot>(
    EMPTY_MARKET_SNAPSHOT,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const next = await fetchSolanaMarket();
        if (cancelled) return;
        setSnapshot(next);
        setError(next.price === null ? "Market data is unavailable right now." : null);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load market data.",
        );
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
  }, [tick]);

  return { snapshot, loading, error, refresh };
}
