import { BarChart3, Blocks, DollarSign, Landmark, RefreshCw, TrendingUp, Zap } from "lucide-react";

import {
  deltaClass,
  formatClock,
  formatCompact,
  formatPercent,
  formatSlot,
  formatUsd,
} from "../lib/format.ts";
import type { SolanaMarketSnapshot } from "../data/solanaMarket.ts";

/* ── Solana gradient logo (inline SVG, official gradient) ───── */
function SolanaLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 400 400" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="sol-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#9945FF" />
          <stop offset="50%" stopColor="#8752F3" />
          <stop offset="100%" stopColor="#14F195" />
        </linearGradient>
      </defs>
      <circle cx="200" cy="200" r="200" fill="url(#sol-grad)" />
      <path d="M129.5 303.4c2.2-2.2 5.2-3.5 8.4-3.5h192.7c5.3 0 7.9 6.4 4.1 10.1l-41.7 41.7c-2.2 2.2-5.2 3.5-8.4 3.5H91.9c-5.3 0-7.9-6.4-4.1-10.1l41.7-41.7z" fill="#fff"/>
      <path d="M129.5 48.4c2.3-2.2 5.3-3.5 8.4-3.5h192.7c5.3 0 7.9 6.4 4.1 10.1l-41.7 41.7c-2.2 2.2-5.2 3.5-8.4 3.5H91.9c-5.3 0-7.9-6.4-4.1-10.1l41.7-41.7z" fill="#fff"/>
      <path d="M293 175.4c-2.2-2.2-5.2-3.5-8.4-3.5H91.9c-5.3 0-7.9 6.4-4.1 10.1l41.7 41.7c2.2 2.2 5.2 3.5 8.4 3.5h192.7c5.3 0 7.9-6.4 4.1-10.1L293 175.4z" fill="#fff"/>
    </svg>
  );
}

/* ── Mini candlestick sparkline ──────────────────────────────── */
function MiniCandlesticks({ change24h }: { change24h: number | null }) {
  // Generate a representative 12-candle array based on the 24h trend
  const direction = change24h !== null && change24h >= 0 ? 1 : -1;
  const candles = Array.from({ length: 12 }, (_, i) => {
    const bias = direction * (i / 12) * 0.6;
    const rand = Math.sin(i * 7.3 + 3.1) * 0.5;
    const isUp = (rand + bias) > 0;
    const bodyH = 4 + Math.abs(rand + bias) * 16;
    const wickH = 2 + Math.abs(Math.cos(i * 5.1)) * 6;
    return { isUp, bodyH, wickH };
  });

  return (
    <div className="web3-candlestick-wrap" style={{ height: 44, padding: "4px 0", gap: 2 }}>
      {candles.map((c, i) => (
        <div key={i} className={`web3-candle ${c.isUp ? "web3-candle-up" : "web3-candle-down"}`}
             style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
          <div className="web3-candle-wick" style={{ height: c.wickH }} />
          <div className="web3-candle-body" style={{ height: c.bodyH, width: 5, borderRadius: 1 }} />
          <div className="web3-candle-wick" style={{ height: c.wickH * 0.6 }} />
        </div>
      ))}
    </div>
  );
}

interface MarketTickerProps {
  snapshot: SolanaMarketSnapshot;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

/** Live Solana market strip with icons, candlesticks, and chain state. */
export function MarketTicker({
  snapshot,
  loading,
  error,
  onRefresh,
}: MarketTickerProps) {
  const cells: { label: string; value: string; className?: string; icon: React.ReactNode }[] = [
    {
      label: "SOL price",
      value: formatUsd(snapshot.price),
      icon: <SolanaLogo size={16} />,
    },
    {
      label: "24h",
      value: formatPercent(snapshot.change24h),
      className: deltaClass(snapshot.change24h),
      icon: <TrendingUp className="size-3.5" />,
    },
    {
      label: "Market cap",
      value: formatUsd(snapshot.marketCap, { compact: true }),
      icon: <DollarSign className="size-3.5" />,
    },
    {
      label: "24h volume",
      value: formatUsd(snapshot.volume24h, { compact: true }),
      icon: <BarChart3 className="size-3.5" />,
    },
    {
      label: "DeFi TVL",
      value: formatUsd(snapshot.tvl, { compact: true }),
      icon: <Landmark className="size-3.5" />,
    },
    {
      label: "Epoch",
      value: snapshot.epoch === null ? "—" : `#${snapshot.epoch}`,
      icon: <Blocks className="size-3.5" />,
    },
    {
      label: "Slot",
      value: formatSlot(snapshot.slot),
      icon: <Zap className="size-3.5" />,
    },
  ];

  return (
    <section className="web3-panel" aria-label="Live Solana market">
      {/* Top bar with Solana identity */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--web3-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <SolanaLogo size={20} />
          <span style={{ fontWeight: 650, fontSize: 13, color: "var(--web3-text)", letterSpacing: "-0.01em" }}>
            Solana Market Data
          </span>
          <span className="web3-status-inline" style={{ fontSize: 11, color: "var(--web3-text-muted)" }}>
            <span className="web3-live-dot" aria-hidden="true" />
            {loading ? "Syncing…" : "Live"}
          </span>
        </div>
        <MiniCandlesticks change24h={snapshot.change24h} />
      </div>

      {/* Ticker cells */}
      <div className="web3-ticker">
        {cells.map((cell) => (
          <div key={cell.label} className="web3-ticker-cell">
            <span className="web3-ticker-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ opacity: 0.7 }}>{cell.icon}</span>
              {cell.label}
            </span>
            <span className={`web3-ticker-value ${cell.className ?? ""}`}>
              {cell.value}
            </span>
          </div>
        ))}
        <div className="web3-ticker-cell">
          <span className="web3-ticker-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ opacity: 0.7 }}>
              <span className="web3-live-dot" aria-hidden="true" style={{ width: 5, height: 5 }} />
            </span>
            Status
          </span>
          <span className="web3-ticker-value web3-status-inline">
            {error ? (
              <span className="web3-delta-down">Unavailable</span>
            ) : (
              <span>{loading ? "Syncing" : formatClock(snapshot.updatedAt)}</span>
            )}
          </span>
        </div>
      </div>

      {/* Footer */}
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
