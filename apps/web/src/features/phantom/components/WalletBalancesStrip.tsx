import { CircleDollarSign, Coins, RefreshCw, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import FieldError from "@/components/errors/FieldError.tsx";
import { SOLANA_CLUSTER, SOLANA_CLUSTER_LABEL } from "../lib/config.ts";
import { useSolanaBalances } from "../hooks/useSolanaBalances.ts";

interface WalletBalancesStripProps {
  address: string | null;
  connected: boolean;
  walletName?: string | null;
  onConnect?: () => void;
}

function formatAmount(value: number | null, maxDp: number): string {
  if (value === null) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDp,
  });
}

function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export default function WalletBalancesStrip({
  address,
  connected,
  walletName,
  onConnect,
}: WalletBalancesStripProps) {
  const { sol, usdc, loading, error, refresh } = useSolanaBalances(
    connected ? address : null,
  );
  const clusterLabel = SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER];

  return (
    <section className="treasury-rail" aria-label="Treasury wallet and balances">
      <div className="treasury-rail-inner">
        <div className="treasury-rail-id">
          <span className="treasury-eyebrow">Treasury wallet</span>
          <div className="treasury-wallet-line">
            <span className="treasury-wallet-mark">
              <Wallet size={18} />
            </span>
            <div className="min-w-0">
              <p className="treasury-wallet-name">
                {connected ? (walletName ?? "Connected wallet") : "No wallet connected"}
              </p>
              <p className="treasury-wallet-meta">
                {connected && address
                  ? `${shortAddress(address)} · ${clusterLabel}`
                  : "Connect a wallet to read balances"}
              </p>
            </div>
          </div>
          <div className="treasury-rail-actions">
            {onConnect ? (
              <Button
                variant={connected ? "outline" : "default"}
                size="sm"
                className="rounded-lg gap-2"
                onClick={onConnect}
              >
                <Wallet size={14} />
                {connected ? "Manage wallet" : "Connect wallet"}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="treasury-rail-balances">
          <div className="treasury-balance">
            <span className="treasury-balance-label">
              <CircleDollarSign size={14} />
              USDC available
            </span>
            {loading && usdc === null ? (
              <span className="treasury-amount-skeleton" aria-busy="true" />
            ) : (
              <p className="treasury-amount">
                {formatAmount(usdc, 2)}
                <span className="treasury-unit">USDC</span>
              </p>
            )}
            <span className="treasury-caption">Settles invoices 1:1 with USD</span>
          </div>

          <div className="treasury-balance">
            <span className="treasury-balance-label">
              <Coins size={14} />
              SOL for fees
            </span>
            {loading && sol === null ? (
              <span className="treasury-amount-skeleton" aria-busy="true" />
            ) : (
              <p className="treasury-amount">
                {formatAmount(sol, 4)}
                <span className="treasury-unit">SOL</span>
              </p>
            )}
            <span className="treasury-caption">Pays network fees on transfers</span>
          </div>

          <button
            type="button"
            className={cn("treasury-refresh", loading && "is-loading")}
            onClick={refresh}
            disabled={loading || !connected}
            aria-label="Refresh balances"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="treasury-rule" aria-hidden="true" />

      {error ? (
        <div className="treasury-rail-error">
          <FieldError>{error}</FieldError>
        </div>
      ) : null}
    </section>
  );
}
