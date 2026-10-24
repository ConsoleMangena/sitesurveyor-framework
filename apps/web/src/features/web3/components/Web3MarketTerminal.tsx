import { useState } from "react";
import {
  BarChart2,
  Blocks,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Landmark,
  Layers,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

import {
  deltaClass,
  formatCompact,
  formatPercent,
  formatSlot,
  formatUsd,
} from "../lib/format.ts";
import type { SolanaMarketSnapshot } from "../data/solanaMarket.ts";
import { SolanaLogoMark, UsdcLogoMark } from "./SolanaLogos.tsx";
import { SolanaMarketChart, type MarketToken } from "./SolanaMarketChart.tsx";

interface Web3MarketTerminalProps {
  snapshot: SolanaMarketSnapshot;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  defaultToken?: MarketToken;
}

/** Mini Sparkline for sidebar tile */
function MiniSparkline({ up }: { up: boolean }) {
  const points: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const x = (i / 15) * 56;
    const trend = up ? -(i / 15) * 7 : (i / 15) * 7;
    const wave = Math.sin(i * 1.1 + 1.2) * 3 + Math.cos(i * 1.9) * 2;
    points.push([x, 14 + trend + wave]);
  }
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");

  return (
    <svg width={56} height={26} viewBox="0 0 56 26" fill="none" aria-hidden="true">
      <path
        d={d}
        stroke={up ? "#16a34a" : "#dc2626"}
        strokeWidth={1.75}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Web3MarketTerminal
 *
 * An integrated, modern crypto & on-chain market dashboard for SiteSurveyor.
 * Unifies real-time candlestick charts (SOL & USDC) with live on-chain telemetry,
 * asset selector, and collapsible layout for optimal marketplace page placement.
 */
export function Web3MarketTerminal({
  snapshot,
  loading,
  error,
  onRefresh,
  defaultToken = "SOL",
}: Web3MarketTerminalProps) {
  const [activeToken, setActiveToken] = useState<MarketToken>(defaultToken);
  const [isChartExpanded, setIsChartExpanded] = useState<boolean>(true);

  const isUsdc = activeToken === "USDC";

  // Active token metrics
  const tokenPrice = isUsdc
    ? (snapshot.usdc?.price ?? 1.0)
    : (snapshot.price ?? 140);
  const tokenChange = isUsdc
    ? (snapshot.usdc?.change24h ?? 0.02)
    : (snapshot.change24h ?? 2.4);
  const tokenCap = isUsdc
    ? (snapshot.usdc?.marketCap ?? 35_000_000_000)
    : (snapshot.marketCap ?? 65_000_000_000);
  const tokenVol = isUsdc
    ? (snapshot.usdc?.volume24h ?? 4_800_000_000)
    : (snapshot.volume24h ?? 2_800_000_000);

  const isUp = (tokenChange ?? 0) >= 0;

  return (
    <div
      className="web3-panel overflow-hidden border border-border/80 shadow-sm"
      style={{
        borderRadius: 16,
        background: "var(--web3-panel)",
        transition: "all 0.2s ease-in-out",
      }}
    >
      {/* ── Terminal Header Bar ───────────────────────────────── */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6"
        style={{
          borderBottom: "1px solid var(--web3-border)",
          background: "var(--web3-bg-2)",
        }}
      >
        {/* Left: Terminal Identity & Network Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center rounded-lg p-1.5"
              style={{
                background: "var(--web3-bg)",
                border: "1px solid var(--web3-border)",
                color: "var(--web3-brand)",
              }}
            >
              <BarChart2 className="size-4" aria-hidden="true" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    color: "var(--web3-text)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Web3 Market Terminal
                </span>
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
                  style={{
                    background: "rgba(153, 69, 255, 0.12)",
                    color: "#9945FF",
                    border: "1px solid rgba(153, 69, 255, 0.2)",
                  }}
                >
                  Solana Mainnet
                </span>
              </div>
              <p
                className="text-[11px]"
                style={{ color: "var(--web3-text-dim)", marginTop: -1 }}
              >
                Live settlement assets for equipment, escrow & invoices
              </p>
            </div>
          </div>

          <span
            className="hidden items-center gap-1.5 sm:inline-flex text-xs font-medium"
            style={{ color: "var(--web3-text-muted)" }}
          >
            <span className="web3-live-dot" aria-hidden="true" />
            {loading ? "Syncing…" : "Live Feed"}
          </span>
        </div>

        {/* Center: Token Switcher Pills (SOL & USDC) */}
        <div
          role="tablist"
          aria-label="Select active token for chart and market intel"
          className="inline-flex items-center rounded-xl p-1 shadow-inner"
          style={{
            background: "var(--web3-panel)",
            border: "1px solid var(--web3-border)",
            gap: 3,
          }}
        >
          {/* SOL Tab */}
          <button
            type="button"
            role="tab"
            aria-selected={activeToken === "SOL"}
            onClick={() => setActiveToken("SOL")}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150"
            style={{
              background:
                activeToken === "SOL"
                  ? "var(--web3-bg-2)"
                  : "transparent",
              color:
                activeToken === "SOL"
                  ? "var(--web3-text)"
                  : "var(--web3-text-muted)",
              boxShadow:
                activeToken === "SOL"
                  ? "0 1px 3px rgba(0,0,0,0.08), inset 0 0 0 1px var(--web3-border)"
                  : "none",
            }}
          >
            <SolanaLogoMark size={16} />
            <span>SOL</span>
            <span
              className="font-mono text-[11px] font-bold"
              style={{
                color: activeToken === "SOL" ? "var(--web3-text)" : "var(--web3-text-dim)",
              }}
            >
              {formatUsd(snapshot.price)}
            </span>
            <span
              className={`text-[10px] font-bold ${deltaClass(snapshot.change24h)}`}
            >
              {formatPercent(snapshot.change24h, { digits: 1 })}
            </span>
          </button>

          {/* USDC Tab */}
          <button
            type="button"
            role="tab"
            aria-selected={activeToken === "USDC"}
            onClick={() => setActiveToken("USDC")}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150"
            style={{
              background:
                activeToken === "USDC"
                  ? "var(--web3-bg-2)"
                  : "transparent",
              color:
                activeToken === "USDC"
                  ? "var(--web3-text)"
                  : "var(--web3-text-muted)",
              boxShadow:
                activeToken === "USDC"
                  ? "0 1px 3px rgba(0,0,0,0.08), inset 0 0 0 1px var(--web3-border)"
                  : "none",
            }}
          >
            <UsdcLogoMark size={16} />
            <span>USDC</span>
            <span
              className="font-mono text-[11px] font-bold"
              style={{
                color: activeToken === "USDC" ? "var(--web3-text)" : "var(--web3-text-dim)",
              }}
            >
              $1.00
            </span>
            <span
              className={`text-[10px] font-bold ${deltaClass(snapshot.usdc?.change24h ?? 0.01)}`}
            >
              {formatPercent(snapshot.usdc?.change24h ?? 0.01, { digits: 1 })}
            </span>
          </button>
        </div>

        {/* Right: Expand/Collapse View Toggle & Refresh */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh on-chain market feed"
            aria-label="Refresh feed"
            className="inline-flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
            style={{
              color: "var(--web3-text-muted)",
              border: "1px solid var(--web3-border)",
            }}
          >
            <RefreshCw
              className={`size-3.5 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            onClick={() => setIsChartExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all"
            style={{
              background: isChartExpanded ? "var(--web3-panel)" : "var(--web3-bg)",
              color: "var(--web3-text)",
              border: "1px solid var(--web3-border)",
            }}
          >
            <span>{isChartExpanded ? "Collapse Chart" : "Technical Chart"}</span>
            {isChartExpanded ? (
              <ChevronUp className="size-3.5 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* ── Error Banner if any ──────────────────────────────── */}
      {error && (
        <div
          className="border-b px-4 py-2 text-xs"
          style={{
            background: "rgba(220, 38, 38, 0.08)",
            color: "#dc2626",
            borderColor: "rgba(220, 38, 38, 0.2)",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Main Terminal Body ───────────────────────────────── */}
      {isChartExpanded ? (
        <div className="p-3 sm:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            {/* Left Column (8 cols): Candlestick Chart */}
            <div className="lg:col-span-8 flex flex-col justify-between">
              <SolanaMarketChart
                snapshot={snapshot}
                selectedToken={activeToken}
                onTokenChange={setActiveToken}
                hideTokenSelector
              />
            </div>

            {/* Right Column (4 cols): Cohesive Market Intel Sidebar */}
            <div className="lg:col-span-4 flex flex-col gap-3">
              {/* Asset Spotlight Card */}
              <div
                className="rounded-xl p-4 transition-all"
                style={{
                  background: "var(--web3-bg-2)",
                  border: "1px solid var(--web3-border)",
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isUsdc ? <UsdcLogoMark size={22} /> : <SolanaLogoMark size={22} />}
                    <div>
                      <h4
                        className="text-sm font-bold leading-tight"
                        style={{ color: "var(--web3-text)" }}
                      >
                        {isUsdc ? "USD Coin" : "Solana"}
                      </h4>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {isUsdc ? "USDC · SPL Token" : "SOL · Native Token"}
                      </span>
                    </div>
                  </div>
                  <MiniSparkline up={isUp} />
                </div>

                <div className="mt-3.5 flex items-baseline justify-between border-t border-border/50 pt-3">
                  <div>
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Price (USD)
                    </span>
                    <div
                      className="font-mono text-xl font-bold"
                      style={{ color: "var(--web3-text)" }}
                    >
                      {formatUsd(tokenPrice, isUsdc ? { digits: 4 } : undefined)}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      24h Change
                    </span>
                    <div
                      className={`font-mono text-sm font-bold flex items-center justify-end gap-1 ${
                        isUp ? "web3-delta-up" : "web3-delta-down"
                      }`}
                    >
                      {isUp ? (
                        <TrendingUp className="size-3.5" />
                      ) : (
                        <TrendingDown className="size-3.5" />
                      )}
                      {formatPercent(tokenChange)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/50 pt-3 text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">
                      24h Spot Vol
                    </span>
                    <p className="font-mono font-bold" style={{ color: "var(--web3-text)" }}>
                      {formatUsd(tokenVol, { compact: true })}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">
                      Market Cap (FDV)
                    </span>
                    <p className="font-mono font-bold" style={{ color: "var(--web3-text)" }}>
                      {formatUsd(tokenCap, { compact: true })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Solana Network State Card */}
              <div
                className="rounded-xl p-4 transition-all"
                style={{
                  background: "var(--web3-bg-2)",
                  border: "1px solid var(--web3-border)",
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="rounded-md p-1.5"
                      style={{
                        background: "rgba(16, 185, 129, 0.1)",
                        color: "#10b981",
                      }}
                    >
                      <Landmark className="size-4" />
                    </div>
                    <div>
                      <h4
                        className="text-xs font-bold leading-tight"
                        style={{ color: "var(--web3-text)" }}
                      >
                        Solana On-Chain Telemetry
                      </h4>
                      <span className="text-[10px] text-muted-foreground">
                        Mainnet Beta Ecosystem
                      </span>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Active
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/50 pt-3 text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">
                      DeFi TVL
                    </span>
                    <p className="font-mono font-bold" style={{ color: "var(--web3-text)" }}>
                      {formatUsd(snapshot.tvl, { compact: true })}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">
                      Epoch
                    </span>
                    <p className="font-mono font-bold" style={{ color: "var(--web3-text)" }}>
                      {snapshot.epoch === null ? "—" : `#${snapshot.epoch}`}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-medium">
                      Slot Height
                    </span>
                    <p className="font-mono font-bold text-[11px]" style={{ color: "var(--web3-text)" }}>
                      {formatSlot(snapshot.slot)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Settlement Guarantee Card */}
              <div
                className="rounded-xl p-3.5 transition-all"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(153, 69, 255, 0.06) 0%, rgba(39, 117, 202, 0.06) 100%)",
                  border: "1px solid var(--web3-border)",
                }}
              >
                <div className="flex items-start gap-2.5">
                  <ShieldCheck
                    className="size-4 shrink-0 text-primary mt-0.5"
                    aria-hidden="true"
                  />
                  <div>
                    <p
                      className="text-xs font-semibold leading-snug"
                      style={{ color: "var(--web3-text)" }}
                    >
                      SiteSurveyor SPL Settlement
                    </p>
                    <p
                      className="text-[11px] leading-relaxed mt-1"
                      style={{ color: "var(--web3-text-muted)" }}
                    >
                      Escrow milestones, equipment listings, and professional invoices
                      support instant finality with Phantom in <strong>SOL</strong> and{" "}
                      <strong>USDC</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── Compact Ticker Mode ────────────────────────────── */
        <div
          className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6"
          style={{ background: "var(--web3-panel)" }}
        >
          <div className="flex flex-wrap items-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              {isUsdc ? <UsdcLogoMark size={18} /> : <SolanaLogoMark size={18} />}
              <span className="font-bold" style={{ color: "var(--web3-text)" }}>
                {isUsdc ? "USDC / USD" : "SOL / USD"}:
              </span>
              <span className="font-mono font-bold" style={{ color: "var(--web3-text)" }}>
                {formatUsd(tokenPrice, isUsdc ? { digits: 4 } : undefined)}
              </span>
              <span
                className={`font-mono font-bold ${
                  isUp ? "web3-delta-up" : "web3-delta-down"
                }`}
              >
                {formatPercent(tokenChange)}
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-4 text-muted-foreground font-mono">
              <span>
                Vol 24h:{" "}
                <strong style={{ color: "var(--web3-text)" }}>
                  {formatUsd(tokenVol, { compact: true })}
                </strong>
              </span>
              <span>
                DeFi TVL:{" "}
                <strong style={{ color: "var(--web3-text)" }}>
                  {formatUsd(snapshot.tvl, { compact: true })}
                </strong>
              </span>
              <span>
                Epoch:{" "}
                <strong style={{ color: "var(--web3-text)" }}>
                  {snapshot.epoch ? `#${snapshot.epoch}` : "—"}
                </strong>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsChartExpanded(true)}
            className="text-xs font-semibold hover:underline"
            style={{ color: "var(--web3-brand)" }}
          >
            Show Technical Candlestick Chart →
          </button>
        </div>
      )}
    </div>
  );
}
