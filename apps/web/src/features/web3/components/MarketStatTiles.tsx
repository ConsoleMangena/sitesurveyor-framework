import {
  deltaClass,
  formatPercent,
  formatSlot,
  formatUsd,
} from "../lib/format.ts";
import type { SolanaMarketSnapshot } from "../data/solanaMarket.ts";

interface MarketStatTilesProps {
  snapshot: SolanaMarketSnapshot;
  portfolioValue: number | null;
  portfolioLoading: boolean;
}

/** Headline market tiles: SOL price, cap, volume, TVL, portfolio and chain. */
export function MarketStatTiles({
  snapshot,
  portfolioValue,
  portfolioLoading,
}: MarketStatTilesProps) {
  const tiles: {
    label: string;
    value: string;
    note?: string;
    className?: string;
  }[] = [
    {
      label: "SOL price",
      value: formatUsd(snapshot.price),
      note:
        snapshot.change24h !== null
          ? `${formatPercent(snapshot.change24h)} · 24h`
          : "24h change unavailable",
      className: deltaClass(snapshot.change24h),
    },
    {
      label: "Market cap",
      value: formatUsd(snapshot.marketCap, { compact: true }),
      note: "Fully diluted valuation",
    },
    {
      label: "24h volume",
      value: formatUsd(snapshot.volume24h, { compact: true }),
      note: "Spot volume",
    },
    {
      label: "Solana DeFi TVL",
      value: formatUsd(snapshot.tvl, { compact: true }),
      note: "Value locked on chain",
    },
    {
      label: "Portfolio value",
      value: portfolioLoading ? "…" : formatUsd(portfolioValue),
      note: portfolioValue === null ? "Connect a wallet" : "Live holdings",
    },
    {
      label: "Chain state",
      value: snapshot.epoch === null ? "—" : `Epoch ${snapshot.epoch}`,
      note: `Slot ${formatSlot(snapshot.slot)}`,
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
      }}
    >
      {tiles.map((tile) => (
        <div className="web3-tile" key={tile.label}>
          <span className="web3-tile-label">{tile.label}</span>
          <span className={`web3-tile-value ${tile.className ?? ""}`}>
            {tile.value}
          </span>
          {tile.note ? (
            <span className="web3-tile-note">{tile.note}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
