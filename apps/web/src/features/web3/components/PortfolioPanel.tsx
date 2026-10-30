import { Link } from "react-router-dom";
import { Coins, RefreshCw, Wallet } from "lucide-react";

import type { PortfolioSnapshot } from "../data/portfolio.ts";
import {
  deltaClass,
  formatClock,
  formatPercent,
  formatTokenAmount,
  formatUsd,
} from "../lib/format.ts";

interface PortfolioPanelProps {
  address: string | null;
  snapshot: PortfolioSnapshot;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

/**
 * Read-only web3 portfolio for the connected wallet: total value, weighted
 * 24h move, allocation split and the individual holdings.
 */
export function PortfolioPanel({
  address,
  snapshot,
  loading,
  error,
  onRefresh,
}: PortfolioPanelProps) {
  if (!address) {
    return (
      <section className="web3-panel" aria-label="Web3 portfolio">
        <div className="web3-panel-header">
          <div>
            <h2 className="web3-panel-title">Your Web3 Portfolio</h2>
            <p className="web3-panel-sub">
              Connect a Solana wallet to track balances, value and allocation in
              real time.
            </p>
          </div>
          <Wallet size={18} aria-hidden="true" />
        </div>
        <div className="web3-empty">
          <Coins size={22} aria-hidden="true" />
          <p className="web3-empty-title">No wallet connected</p>
          <p className="web3-empty-note">
            The portfolio is read-only — it reads public on-chain balances and
            never asks for a signature.
          </p>
          <Link to="/login" className="web3-btn web3-btn-primary">
            Connect wallet
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="web3-panel" aria-label="Web3 portfolio">
      <div className="web3-panel-header">
        <div>
          <h2 className="web3-panel-title">Your Web3 Portfolio</h2>
          <p className="web3-panel-sub web3-mono">
            {address.slice(0, 4)}…{address.slice(-4)} · read-only · updates
            every 60s
          </p>
        </div>
        <button
          type="button"
          className="web3-icon-btn"
          onClick={onRefresh}
          aria-label="Refresh portfolio"
          title="Refresh portfolio"
        >
          <RefreshCw
            className={loading ? "web3-spin" : undefined}
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="web3-panel-body" style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <div>
            <p className="web3-kicker">Total value</p>
            <p
              className="web3-mono"
              style={{
                margin: "6px 0 0",
                fontSize: 30,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "var(--web3-text)",
              }}
            >
              {formatUsd(snapshot.totalValue)}
            </p>
          </div>
          <div>
            <p className="web3-kicker">24h change</p>
            <p
              className={`web3-mono ${deltaClass(snapshot.change24h)}`}
              style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 600 }}
            >
              {formatPercent(snapshot.change24h)}
            </p>
          </div>
          <div>
            <p className="web3-kicker">Holdings</p>
            <p
              className="web3-mono"
              style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 600 }}
            >
              {snapshot.tokens.length}
            </p>
          </div>
        </div>

        {error ? (
          <p className="web3-panel-sub" style={{ margin: 0 }}>
            {error}
          </p>
        ) : null}

        {snapshot.tokens.length === 0 ? (
          <div className="web3-empty">
            <Coins size={20} aria-hidden="true" />
            <p className="web3-empty-title">
              {loading ? "Reading on-chain balances…" : "No holdings found"}
            </p>
          </div>
        ) : (
          <>
            <div>
              <p className="web3-kicker" style={{ margin: "0 0 6px" }}>
                Allocation
              </p>
              {snapshot.tokens.slice(0, 6).map((token) => (
                <div className="web3-alloc-row" key={`alloc-${token.mint}`}>
                  <span className="web3-alloc-name">
                    {token.symbol}
                    {token.name && token.name !== token.symbol ? (
                      <span style={{ color: "var(--web3-text-dim)" }}>
                        {" "}
                        · {token.name}
                      </span>
                    ) : null}
                  </span>
                  <span className="web3-alloc-pct">
                    {token.allocation.toFixed(1)}%
                  </span>
                  <span className="web3-alloc-track">
                    <span
                      className="web3-alloc-fill"
                      style={{ width: `${Math.max(token.allocation, 0.6)}%` }}
                    />
                  </span>
                </div>
              ))}
            </div>

            <div>
              <p className="web3-kicker" style={{ margin: "0 0 4px" }}>
                Holdings
              </p>
              {snapshot.tokens.map((token) => (
                <div className="web3-token-row" key={token.mint}>
                  <span className="web3-token-icon">
                    {token.icon ? (
                      <img src={token.icon} alt="" />
                    ) : (
                      <Coins aria-hidden="true" />
                    )}
                  </span>
                  <span className="web3-token-meta">
                    <span className="web3-token-name">{token.symbol}</span>
                    <span className="web3-token-sub">
                      {formatTokenAmount(token.amount)}
                      {token.change24h !== null
                        ? ` · ${formatPercent(token.change24h)}`
                        : ""}
                    </span>
                  </span>
                  <span className="web3-token-value">
                    <span className="web3-token-usd">
                      {formatUsd(token.value)}
                    </span>
                    <span className="web3-token-amount">
                      {token.price === null
                        ? "unpriced"
                        : formatUsd(token.price)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="web3-panel-foot">
        <p className="web3-panel-sub" style={{ margin: 0 }}>
          {snapshot.updatedAt
            ? `Last synced ${formatClock(snapshot.updatedAt)}`
            : "Waiting for the first sync"}
          {snapshot.partial ? " · some holdings could not be priced" : ""}
        </p>
      </div>
    </section>
  );
}
