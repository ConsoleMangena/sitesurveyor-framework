import { RefreshCw } from "lucide-react";

import {
  deltaClass,
  formatClock,
  formatCompact,
  formatPercent,
  formatSlot,
  formatUsd,
} from "../lib/format.ts";
import type { SolanaMarketSnapshot } from "../data/solanaMarket.ts";

interface MarketTickerProps {
  snapshot: SolanaMarketSnapshot;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

/** Live Solana market strip: price, 24h move, cap, volume, TVL and chain state. */
export function MarketTicker({
  snapshot,
  loading,
  error,
  onRefresh,
}: MarketTickerProps) {
  const cells: { label: string; value: string; className?: string }[] = [
    { label: "SOL price", value: formatUsd(snapshot.price) },
    {
      label: "24h",
      value: formatPercent(snapshot.change24h),
      className: deltaClass(snapshot.change24h),
    },
    { label: "Market cap", value: formatUsd(snapshot.marketCap, { compact: true }) },
    { label: "24h volume", value: formatUsd(snapshot.volume24h, { compact: true }) },
    { label: "DeFi TVL", value: formatUsd(snapshot.tvl, { compact: true }) },
    { label: "Epoch", value: snapshot.epoch === null ? "—" : `#${snapshot.epoch}` },
    { label: "Slot", value: formatSlot(snapshot.slot) },
  ];

  return (
    <section className="web3-panel" aria-label="Live Solana market">
      <div className="web3-ticker">
        {cells.map((cell) => (
          <div key={cell.label} className="web3-ticker-cell">
            <span className="web3-ticker-label">{cell.label}</span>
            <span className={`web3-ticker-value ${cell.className ?? ""}`}>
              {cell.value}
            </span>
          </div>
        ))}
        <div className="web3-ticker-cell">
          <span className="web3-ticker-label">Status</span>
          <span className="web3-ticker-value web3-status-inline">
            {error ? (
              <span className="web3-delta-down">Unavailable</span>
            ) : (
              <>
                <span className="web3-live-dot" aria-hidden="true" />
                <span>{loading ? "Syncing" : formatClock(snapshot.updatedAt)}</span>
              </>
            )}
          </span>
        </div>
      </div>
      <div className="web3-panel-foot">
        <p className="web3-panel-sub" style={{ margin: 0 }}>
          {error
            ? error
            : `Market data refreshes every 30s · supply ${
                snapshot.marketCap && snapshot.price
                  ? formatCompact(snapshot.marketCap / snapshot.price)
                  : "—"
              } SOL`}
        </p>
        <button
          type="button"
          className="web3-icon-btn"
          onClick={onRefresh}
          aria-label="Refresh market data"
          title="Refresh market data"
        >
          <RefreshCw
            className={loading ? "web3-spin" : undefined}
            aria-hidden="true"
          />
        </button>
      </div>
    </section>
  );
}
