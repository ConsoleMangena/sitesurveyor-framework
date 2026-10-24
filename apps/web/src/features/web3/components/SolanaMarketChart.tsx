import { useState, useMemo } from "react";
import {
  CandlestickChart,
  LineChart,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import {
  formatCompact,
  formatPercent,
  formatUsd,
} from "../lib/format.ts";
import type { SolanaMarketSnapshot } from "../data/solanaMarket.ts";
import { SolanaLogoMark, UsdcLogoMark } from "./SolanaLogos.tsx";

export type MarketToken = "SOL" | "USDC";

type Timeframe = "1H" | "24H" | "7D" | "30D";
type ChartMode = "candle" | "line";

interface CandleData {
  timeStr: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isUp: boolean;
}

export interface SolanaMarketChartProps {
  snapshot: SolanaMarketSnapshot;
  selectedToken?: MarketToken;
  onTokenChange?: (token: MarketToken) => void;
  hideTokenSelector?: boolean;
}

export function SolanaMarketChart({
  snapshot,
  selectedToken,
  onTokenChange,
  hideTokenSelector = false,
}: SolanaMarketChartProps) {
  const [internalToken, setInternalToken] = useState<MarketToken>("SOL");
  const activeToken = selectedToken ?? internalToken;

  const handleTokenSelect = (token: MarketToken) => {
    if (!selectedToken) {
      setInternalToken(token);
    }
    onTokenChange?.(token);
  };

  const isUsdc = activeToken === "USDC";

  const [timeframe, setTimeframe] = useState<Timeframe>("24H");
  const [chartMode, setChartMode] = useState<ChartMode>("candle");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const basePrice = isUsdc
    ? (snapshot.usdc?.price ?? 1.0)
    : (snapshot.price ?? 140);

  const change24h = isUsdc
    ? (snapshot.usdc?.change24h ?? 0.02)
    : (snapshot.change24h ?? 2.4);

  const volume24h = isUsdc
    ? (snapshot.usdc?.volume24h ?? 4_800_000_000)
    : (snapshot.volume24h ?? 2_800_000_000);

  const formatPrice = (val: number | null | undefined) => {
    if (val === null || val === undefined || !Number.isFinite(val)) return "—";
    return formatUsd(val, isUsdc ? { digits: 4 } : undefined);
  };

  // Generate deterministic candlestick series based on active token price and trend
  const candles: CandleData[] = useMemo(() => {
    const count = timeframe === "1H" ? 24 : timeframe === "24H" ? 24 : timeframe === "7D" ? 28 : 30;
    const now = Date.now();
    const intervalMs =
      timeframe === "1H"
        ? (60 * 60 * 1000) / count
        : timeframe === "24H"
          ? (24 * 60 * 60 * 1000) / count
          : timeframe === "7D"
            ? (7 * 24 * 60 * 60 * 1000) / count
            : (30 * 24 * 60 * 60 * 1000) / count;

    const trendMultiplier = isUsdc ? 0.0003 : 1;
    const startPrice =
      basePrice *
      (1 -
        (change24h / 100) *
          trendMultiplier *
          (timeframe === "1H" ? 0.15 : timeframe === "24H" ? 1 : timeframe === "7D" ? 1.8 : 2.5));
    let curPrice = startPrice;

    const list: CandleData[] = [];
    const totalStep = count;

    for (let i = 0; i < totalStep; i++) {
      const time = new Date(now - (totalStep - 1 - i) * intervalMs);
      const timeStr =
        timeframe === "1H" || timeframe === "24H"
          ? time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : time.toLocaleDateString([], { month: "short", day: "numeric" });

      const progress = i / (totalStep - 1);
      const target = basePrice;
      const pull = (target - curPrice) * (0.1 + progress * 0.15);

      // Stablecoins like USDC exhibit micro-movements around 1.0000; SOL fluctuates normally
      const noise = isUsdc
        ? (Math.sin(i * 4.3 + 1.2) * 0.0006 + Math.cos(i * 2.7) * 0.0004) * basePrice
        : (Math.sin(i * 4.3 + 1.2) * 0.02 + Math.cos(i * 2.7) * 0.015) * basePrice;

      const open = curPrice;
      let close = i === totalStep - 1 ? basePrice : curPrice + pull + noise;
      if (isUsdc) {
        close = Math.min(1.003, Math.max(0.997, close));
      } else if (close < 0) {
        close = basePrice * 0.9;
      }

      const wickScale = isUsdc ? 0.0004 : 0.012;
      const high = Math.max(open, close) + Math.abs(Math.sin(i * 3.1) * wickScale * basePrice);
      const low = Math.min(open, close) - Math.abs(Math.cos(i * 2.9) * wickScale * basePrice);
      const vol = (volume24h ? volume24h / totalStep : 85_000_000) * (0.6 + Math.abs(Math.sin(i * 1.7)) * 0.8);
      const isUp = close >= open;

      list.push({ timeStr, open, high, low, close, volume: vol, isUp });
      curPrice = close;
    }
    return list;
  }, [timeframe, basePrice, change24h, volume24h, isUsdc]);

  // Bounds for price and volume
  const { minPrice, maxPrice, maxVol } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    let maxV = 0;
    for (const c of candles) {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
      if (c.volume > maxV) maxV = c.volume;
    }
    const pad = (max - min) * 0.08 || (isUsdc ? 0.0005 : 1);
    return {
      minPrice: min - pad,
      maxPrice: max + pad,
      maxVol: maxV || 1,
    };
  }, [candles, isUsdc]);

  // Chart coordinate constants
  const svgWidth = 860;
  const svgHeight = 290;
  const priceTop = 20;
  const priceBottom = 200;
  const volTop = 225;
  const volBottom = 270;
  const rightPad = isUsdc ? 75 : 65;
  const leftPad = 15;
  const chartW = svgWidth - leftPad - rightPad;

  const candleW = Math.max(4, (chartW / candles.length) * 0.65);

  const getY = (p: number) => {
    const ratio = (p - minPrice) / (maxPrice - minPrice || 1);
    return priceBottom - ratio * (priceBottom - priceTop);
  };

  const getVolY = (v: number) => {
    const ratio = v / maxVol;
    return volBottom - ratio * (volBottom - volTop);
  };

  const getX = (i: number) => leftPad + (i + 0.5) * (chartW / candles.length);

  // Active or latest candle
  const activeCandle = hoveredIdx !== null ? candles[hoveredIdx] : candles[candles.length - 1];

  // Path for area / line chart
  const linePoints = useMemo(() => {
    return candles.map((c, i) => `${getX(i).toFixed(1)},${getY(c.close).toFixed(1)}`).join(" ");
  }, [candles, minPrice, maxPrice]);

  const areaD = useMemo(() => {
    if (!candles.length) return "";
    const firstX = getX(0).toFixed(1);
    const lastX = getX(candles.length - 1).toFixed(1);
    return `M ${firstX},${priceBottom} L ${linePoints.split(" ").join(" L ")} L ${lastX},${priceBottom} Z`;
  }, [candles, linePoints, priceBottom]);

  // Grid levels (4 horizontal price levels)
  const gridLevels = [0, 0.33, 0.66, 1].map((r) => {
    const val = minPrice + r * (maxPrice - minPrice);
    const y = getY(val);
    return { val, y };
  });

  return (
    <div className="web3-panel" style={{ overflow: "hidden", marginBottom: 16 }}>
      {/* Chart Header Bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "14px 20px",
          borderBottom: "1px solid var(--web3-border)",
          background: "var(--web3-panel)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isUsdc ? <UsdcLogoMark size={28} /> : <SolanaLogoMark size={28} />}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: "var(--web3-text)", letterSpacing: "-0.01em" }}>
                {isUsdc ? "USD Coin" : "Solana"}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: isUsdc ? "rgba(39, 117, 202, 0.12)" : "rgba(0,0,0,0.06)",
                  color: isUsdc ? "#2775CA" : "var(--web3-text-muted)",
                }}
              >
                {isUsdc ? "USDC / USD" : "SOL / USD"}
              </span>
              <span className="web3-status-inline" style={{ fontSize: 11 }}>
                <span className="web3-live-dot" aria-hidden="true" />
                Live
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
              <span className="web3-mono" style={{ fontSize: 20, fontWeight: 700, color: "var(--web3-text)" }}>
                {formatPrice(activeCandle?.close ?? basePrice)}
              </span>
              <span
                className={`web3-mono ${change24h >= 0 ? "web3-delta-up" : "web3-delta-down"}`}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                {change24h >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                {formatPercent(change24h)}
              </span>
            </div>
          </div>
        </div>

        {/* OHLC Readout Bar */}
        <div
          className="web3-mono"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "12px 18px",
            fontSize: 11.5,
            color: "var(--web3-text-muted)",
          }}
        >
          {activeCandle && (
            <>
              <span>
                <span style={{ opacity: 0.65 }}>Time: </span>
                <strong style={{ color: "var(--web3-text)" }}>{activeCandle.timeStr}</strong>
              </span>
              <span>
                <span style={{ opacity: 0.65 }}>O: </span>
                <strong style={{ color: "var(--web3-text)" }}>{formatPrice(activeCandle.open)}</strong>
              </span>
              <span>
                <span style={{ opacity: 0.65 }}>H: </span>
                <strong style={{ color: "#16a34a" }}>{formatPrice(activeCandle.high)}</strong>
              </span>
              <span>
                <span style={{ opacity: 0.65 }}>L: </span>
                <strong style={{ color: "#dc2626" }}>{formatPrice(activeCandle.low)}</strong>
              </span>
              <span>
                <span style={{ opacity: 0.65 }}>C: </span>
                <strong style={{ color: activeCandle.isUp ? "#16a34a" : "#dc2626" }}>
                  {formatPrice(activeCandle.close)}
                </strong>
              </span>
              <span>
                <span style={{ opacity: 0.65 }}>Vol: </span>
                <strong style={{ color: "var(--web3-text)" }}>{formatUsd(activeCandle.volume, { compact: true })}</strong>
              </span>
            </>
          )}
        </div>

        {/* Chart Controls (Asset Switcher, Timeframe & Mode) */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          {/* Asset Switcher (SOL vs USDC) */}
          {!hideTokenSelector && (
            <div
              role="tablist"
              aria-label="Select market asset"
              style={{
                display: "inline-flex",
                borderRadius: 8,
                border: "1px solid var(--web3-border)",
                padding: 2,
                background: "var(--web3-bg-2)",
                gap: 2,
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeToken === "SOL"}
                onClick={() => handleTokenSelect("SOL")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 9px",
                  fontSize: 11,
                  fontWeight: 650,
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  background: activeToken === "SOL" ? "var(--web3-panel)" : "transparent",
                  color: activeToken === "SOL" ? "var(--web3-brand)" : "var(--web3-text-muted)",
                  boxShadow: activeToken === "SOL" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <SolanaLogoMark size={13} />
                <span>SOL</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeToken === "USDC"}
                onClick={() => handleTokenSelect("USDC")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 9px",
                  fontSize: 11,
                  fontWeight: 650,
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  background: activeToken === "USDC" ? "var(--web3-panel)" : "transparent",
                  color: activeToken === "USDC" ? "#2775CA" : "var(--web3-text-muted)",
                  boxShadow: activeToken === "USDC" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <UsdcLogoMark size={13} />
                <span>USDC</span>
              </button>
            </div>
          )}

          {/* Timeframe buttons */}
          <div
            style={{
              display: "inline-flex",
              borderRadius: 8,
              border: "1px solid var(--web3-border)",
              padding: 2,
              background: "var(--web3-bg-2)",
            }}
          >
            {(["1H", "24H", "7D", "30D"] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                style={{
                  padding: "3px 8px",
                  fontSize: 11,
                  fontWeight: 650,
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  background: timeframe === tf ? "var(--web3-panel)" : "transparent",
                  color: timeframe === tf ? "var(--web3-brand)" : "var(--web3-text-muted)",
                  boxShadow: timeframe === tf ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Mode Switcher */}
          <div
            style={{
              display: "inline-flex",
              borderRadius: 8,
              border: "1px solid var(--web3-border)",
              padding: 2,
              background: "var(--web3-bg-2)",
            }}
          >
            <button
              type="button"
              onClick={() => setChartMode("candle")}
              title="Candlestick Chart"
              aria-label="Candlestick Chart"
              style={{
                padding: "3px 7px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                background: chartMode === "candle" ? "var(--web3-panel)" : "transparent",
                color: chartMode === "candle" ? "var(--web3-brand)" : "var(--web3-text-muted)",
                boxShadow: chartMode === "candle" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
              }}
            >
              <CandlestickChart className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setChartMode("line")}
              title="Line Area Chart"
              aria-label="Line Area Chart"
              style={{
                padding: "3px 7px",
                borderRadius: 6,
                border: "none",
                cursor: "pointer",
                background: chartMode === "line" ? "var(--web3-panel)" : "transparent",
                color: chartMode === "line" ? "var(--web3-brand)" : "var(--web3-text-muted)",
                boxShadow: chartMode === "line" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
              }}
            >
              <LineChart className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Interactive SVG Chart Body */}
      <div style={{ position: "relative", width: "100%", padding: "12px 14px 4px" }}>
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          onMouseLeave={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id="sol-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={change24h >= 0 ? "#16a34a" : "#d92d20"} stopOpacity="0.22" />
              <stop offset="100%" stopColor={change24h >= 0 ? "#16a34a" : "#d92d20"} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Grid lines and price axis labels */}
          {gridLevels.map(({ val, y }, i) => (
            <g key={i}>
              <line
                x1={leftPad}
                y1={y}
                x2={svgWidth - rightPad}
                y2={y}
                stroke="var(--web3-border)"
                strokeDasharray="3 3"
                strokeWidth={0.8}
                opacity={0.8}
              />
              <text
                x={svgWidth - rightPad + 6}
                y={y + 3.5}
                fill="var(--web3-text-dim)"
                fontSize={10}
                fontFamily="var(--web3-mono)"
              >
                {isUsdc ? `$${val.toFixed(4)}` : `$${val.toFixed(val < 10 ? 2 : 1)}`}
              </text>
            </g>
          ))}

          {/* Volume separator label */}
          <line
            x1={leftPad}
            y1={volTop - 8}
            x2={svgWidth - rightPad}
            y2={volTop - 8}
            stroke="var(--web3-border)"
            strokeWidth={0.7}
            opacity={0.6}
          />
          <text
            x={svgWidth - rightPad + 6}
            y={volTop}
            fill="var(--web3-text-dim)"
            fontSize={9}
            fontFamily="var(--web3-mono)"
          >
            Vol {formatCompact(maxVol)}
          </text>

          {/* Chart Rendering */}
          {chartMode === "candle" ? (
            /* Candlestick bars + wicks */
            candles.map((c, i) => {
              const x = getX(i);
              const openY = getY(c.open);
              const closeY = getY(c.close);
              const highY = getY(c.high);
              const lowY = getY(c.low);
              const bodyTop = Math.min(openY, closeY);
              const bodyH = Math.max(2, Math.abs(closeY - openY));
              const color = c.isUp ? "#16a34a" : "#dc2626";

              return (
                <g key={i}>
                  {/* Upper/Lower wick */}
                  <line
                    x1={x}
                    y1={highY}
                    x2={x}
                    y2={lowY}
                    stroke={color}
                    strokeWidth={1.2}
                    strokeLinecap="round"
                  />
                  {/* Candle body */}
                  <rect
                    x={x - candleW / 2}
                    y={bodyTop}
                    width={candleW}
                    height={bodyH}
                    fill={color}
                    rx={1.5}
                  />
                </g>
              );
            })
          ) : (
            /* Smooth Area & Line */
            <>
              <path d={areaD} fill="url(#sol-area-grad)" />
              <polyline
                points={linePoints}
                fill="none"
                stroke={change24h >= 0 ? "#16a34a" : "#d92d20"}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}

          {/* Volume bars at bottom */}
          {candles.map((c, i) => {
            const x = getX(i);
            const y = getVolY(c.volume);
            const h = Math.max(2, volBottom - y);
            const color = c.isUp ? "rgba(22, 163, 74, 0.45)" : "rgba(220, 38, 38, 0.45)";
            return (
              <rect
                key={`v-${i}`}
                x={x - candleW / 2}
                y={y}
                width={candleW}
                height={h}
                fill={color}
                rx={1}
              />
            );
          })}

          {/* Invisible interactive hover columns across the chart */}
          {candles.map((c, i) => {
            const colW = chartW / candles.length;
            const colX = leftPad + i * colW;
            const isHovered = hoveredIdx === i;

            return (
              <g key={`hit-${i}`}>
                <rect
                  x={colX}
                  y={priceTop - 5}
                  width={colW}
                  height={svgHeight - priceTop}
                  fill="transparent"
                  style={{ cursor: "crosshair" }}
                  onMouseEnter={() => setHoveredIdx(i)}
                />
                {isHovered && (
                  <>
                    {/* Vertical crosshair line */}
                    <line
                      x1={getX(i)}
                      y1={priceTop - 5}
                      x2={getX(i)}
                      y2={volBottom}
                      stroke="var(--web3-brand)"
                      strokeWidth={1}
                      strokeDasharray="2 2"
                      opacity={0.7}
                    />
                    {/* Dot on close price */}
                    <circle
                      cx={getX(i)}
                      cy={getY(c.close)}
                      r={3.5}
                      fill={c.isUp ? "#16a34a" : "#dc2626"}
                      stroke="#fff"
                      strokeWidth={1.5}
                    />
                  </>
                )}
              </g>
            );
          })}

          {/* Time axis labels */}
          {candles
            .filter((_, i) => i % Math.ceil(candles.length / 6) === 0)
            .map((c, i) => {
              const origIdx = candles.indexOf(c);
              const x = getX(origIdx);
              return (
                <text
                  key={`t-${i}`}
                  x={x}
                  y={svgHeight - 6}
                  textAnchor="middle"
                  fill="var(--web3-text-dim)"
                  fontSize={9.5}
                  fontFamily="var(--web3-mono)"
                >
                  {c.timeStr}
                </text>
              );
            })}
        </svg>
      </div>

      {/* Footer Strip with Quick Metrics */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 18px",
          borderTop: "1px solid var(--web3-border)",
          background: "var(--web3-bg-2)",
          fontSize: 11,
          color: "var(--web3-text-muted)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span>
            24h Range:{" "}
            <strong className="web3-mono" style={{ color: "var(--web3-text)" }}>
              {formatPrice(minPrice)} – {formatPrice(maxPrice)}
            </strong>
          </span>
          <span>
            24h Volume:{" "}
            <strong className="web3-mono" style={{ color: "var(--web3-text)" }}>
              {formatUsd(volume24h, { compact: true })}
            </strong>
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "var(--web3-text-dim)" }}>
            Powered by Solana Mainnet Data Feed ({isUsdc ? "USDC SPL" : "SOL Native"})
          </span>
        </div>
      </div>
    </div>
  );
}
