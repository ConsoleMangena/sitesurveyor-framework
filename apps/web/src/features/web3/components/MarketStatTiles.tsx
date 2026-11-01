import {
  BarChart3,
  Blocks,
  DollarSign,
  Landmark,
} from "lucide-react";

import {
  deltaClass,
  formatPercent,
  formatSlot,
  formatUsd,
} from "../lib/format.ts";
import type { SolanaMarketSnapshot } from "../data/solanaMarket.ts";
import { SolanaLogoMark } from "./SolanaLogos.tsx";

/* ── Mini sparkline SVG ──────────────────────────────────────── */
function Sparkline({ change24h }: { change24h: number | null }) {
  const up = change24h !== null && change24h >= 0;
  // Generate a 20-point sparkline path
  const points: [number, number][] = [];
  for (let i = 0; i < 20; i++) {
    const x = (i / 19) * 60;
    const trend = up ? -(i / 19) * 8 : (i / 19) * 8;
    const wave = Math.sin(i * 0.9 + 1.5) * 4 + Math.cos(i * 1.7) * 3;
    points.push([x, 16 + trend + wave]);
  }
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

  return (
    <svg width={60} height={28} viewBox="0 0 60 28" fill="none" aria-hidden="true"
         style={{ display: "block" }}>
      <path d={d} strokeWidth={1.5}
            style={{ stroke: up ? "var(--color-success)" : "var(--color-error)" }}
            fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface MarketStatTilesProps {
  snapshot: SolanaMarketSnapshot;
}

/** Headline market tiles with icons and sparklines: SOL price, cap, volume, TVL and chain. */
export function MarketStatTiles({
  snapshot,
}: MarketStatTilesProps) {
  const tiles: {
    label: string;
    value: string;
    note: string;
    className?: string;
    icon: React.ReactNode;
    iconClass: string;
    sparkline?: boolean;
  }[] = [
    {
      label: "SOL price",
      value: formatUsd(snapshot.price),
      note:
        snapshot.change24h !== null
          ? `${formatPercent(snapshot.change24h)} · 24h`
          : "24h change unavailable",
      className: deltaClass(snapshot.change24h),
      icon: <SolanaLogoMark size={18} />,
      iconClass: "web3-stat-icon-sol",
      sparkline: true,
    },
    {
      label: "Market cap",
      value: formatUsd(snapshot.marketCap, { compact: true }),
      note: "Fully diluted valuation",
      icon: <DollarSign className="size-[18px]" />,
      iconClass: "web3-stat-icon-cap",
    },
    {
      label: "24h volume",
      value: formatUsd(snapshot.volume24h, { compact: true }),
      note: "Spot volume",
      icon: <BarChart3 className="size-[18px]" />,
      iconClass: "web3-stat-icon-vol",
    },
    {
      label: "Solana DeFi TVL",
      value: formatUsd(snapshot.tvl, { compact: true }),
      note: "Value locked on chain",
      icon: <Landmark className="size-[18px]" />,
      iconClass: "web3-stat-icon-tvl",
    },
    {
      label: "Chain state",
      value: snapshot.epoch === null ? "—" : `Epoch ${snapshot.epoch}`,
      note: `Slot ${formatSlot(snapshot.slot)}`,
      icon: <Blocks className="size-[18px]" />,
      iconClass: "web3-stat-icon-chain",
    },
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(175px,1fr))] gap-3">
      {tiles.map((tile) => (
        <div className="web3-tile" key={tile.label}>
          <div className="flex items-center justify-between gap-2">
            <span className="web3-tile-label">{tile.label}</span>
            <span className={`web3-stat-icon ${tile.iconClass}`}>
              {tile.icon}
            </span>
          </div>
          <span className={`web3-tile-value ${tile.className ?? ""}`}>
            {tile.value}
          </span>
          <div className="flex items-center justify-between gap-2">
            <span className="web3-tile-note">{tile.note}</span>
            {tile.sparkline ? (
              <Sparkline change24h={snapshot.change24h} />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
