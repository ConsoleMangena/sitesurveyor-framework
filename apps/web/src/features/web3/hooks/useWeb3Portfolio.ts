import { useCallback, useEffect, useState } from "react";

import {
  EMPTY_PORTFOLIO,
  fetchPortfolio,
  type PortfolioSnapshot,
} from "../data/portfolio.ts";

export interface Web3PortfolioFeed {
  snapshot: PortfolioSnapshot;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const POLL_MS = 60_000;

/** Loads and polls the web3 portfolio for a connected wallet. */
export function useWeb3Portfolio(address: string | null): Web3PortfolioFeed {
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot>(EMPTY_PORTFOLIO);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!address) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const next = await fetchPortfolio(address);
        if (cancelled) return;
        setSnapshot(next);
        setError(
          next.tokens.length === 0
            ? "No balances found for this wallet yet."
            : null,
        );
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load the portfolio.",
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
  }, [address, tick]);

  if (!address) {
    return { snapshot: EMPTY_PORTFOLIO, loading: false, error: null, refresh };
  }

  return { snapshot, loading, error, refresh };
}
