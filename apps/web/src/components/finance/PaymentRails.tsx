import {
  CircleDollarSign,
  Coins,
  CreditCard,
  Plus,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import FieldError from "@/components/errors/FieldError.tsx";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SolanaBalances } from "../../features/phantom/hooks/useSolanaBalances.ts";
import { SOLANA_CLUSTER, SOLANA_CLUSTER_LABEL } from "../../features/phantom/lib/config.ts";
import type { PesepayWalletRow } from "../../lib/repositories/pesepay.ts";

interface PaymentRailsProps {
  address: string | null;
  walletName?: string | null;
  solana: SolanaBalances;
  pesepayBalance: PesepayWalletRow | null;
  pesepayLoading: boolean;
  pesepayError: string | null;
  onManageWallets: () => void;
  onOpenBalance: () => void;
  onRetryPesepay: () => void;
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

export default function PaymentRails({
  address,
  walletName,
  solana,
  pesepayBalance,
  pesepayLoading,
  pesepayError,
  onManageWallets,
  onOpenBalance,
  onRetryPesepay,
}: PaymentRailsProps) {
  const connected = Boolean(address);
  const balance = Number(pesepayBalance?.balance ?? 0);
  const balanceFailed = Boolean(pesepayError);
  const clusterLabel = SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER];

  return (
    <section className="payment-rails" aria-label="Payment rails">
      <div className="payment-rails-head">
        <p className="treasury-eyebrow">Payment rails</p>
        <p className="payment-rails-hint">
          Pay an invoice from a Solana wallet or your prepaid PesePay balance.
        </p>
      </div>

      <div className="payment-rails-grid">
        <article className="payment-rail" data-rail="crypto">
          <header className="payment-rail-head">
            <span className="payment-rail-mark" aria-hidden="true">
              <Wallet size={16} />
            </span>
            <div className="min-w-0">
              <h3 className="payment-rail-title">Crypto wallets</h3>
              <p className="payment-rail-sub">Solana {clusterLabel} · USDC</p>
            </div>
          </header>

          <div className="payment-rail-wallet">
            <span
              className="payment-rail-wallet-dot"
              data-connected={connected || undefined}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="payment-rail-wallet-name">
                {connected ? (walletName ?? "Connected wallet") : "No wallet connected"}
              </p>
              <p className="payment-rail-wallet-meta">
                {connected && address
                  ? `${shortAddress(address)} · signs here`
                  : "Connect a wallet to pay with USDC"}
              </p>
            </div>
          </div>

          <div className="payment-rail-figures">
            <div className="payment-rail-figure">
              <span className="payment-rail-figure-label">
                <CircleDollarSign size={13} />
                USDC available
              </span>
              {solana.loading && solana.usdc === null ? (
                <span className="treasury-amount-skeleton" aria-busy="true" />
              ) : (
                <p className="payment-rail-amount">
                  {formatAmount(solana.usdc, 2)}
                  <span className="treasury-unit">USDC</span>
                </p>
              )}
            </div>

            <div className="payment-rail-figure">
              <span className="payment-rail-figure-label">
                <Coins size={13} />
                SOL for fees
              </span>
              {solana.loading && solana.sol === null ? (
                <span className="treasury-amount-skeleton" aria-busy="true" />
              ) : (
                <p className="payment-rail-amount">
                  {formatAmount(solana.sol, 4)}
                  <span className="treasury-unit">SOL</span>
                </p>
              )}
            </div>

            <button
              type="button"
              className={cn("treasury-refresh", solana.loading && "is-loading")}
              onClick={solana.refresh}
              disabled={solana.loading || !connected}
              aria-label="Refresh wallet balances"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="payment-rail-actions">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-lg"
              onClick={onManageWallets}
            >
              <Wallet size={14} />
              {connected ? "Manage wallets" : "Connect wallet"}
            </Button>
          </div>

          {solana.error ? (
            <div className="payment-rail-error">
              <FieldError>{solana.error}</FieldError>
            </div>
          ) : null}
        </article>

        <article className="payment-rail" data-rail="pesepay">
          <header className="payment-rail-head">
            <span className="payment-rail-mark" aria-hidden="true">
              <CreditCard size={16} />
            </span>
            <div className="min-w-0">
              <h3 className="payment-rail-title">PesePay balance</h3>
              <p className="payment-rail-sub">Prepaid USD · personal to you</p>
            </div>
          </header>

          <div className="payment-rail-wallet">
            <span
              className="payment-rail-wallet-dot"
              data-connected={(balance > 0 && !balanceFailed) || undefined}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="payment-rail-wallet-name">SiteSurveyor credit</p>
              <p className="payment-rail-wallet-meta">USD · invoices and storage</p>
            </div>
          </div>

          <div className="payment-rail-figures">
            <div className="payment-rail-figure">
              <span className="payment-rail-figure-label">Available balance</span>
              {pesepayLoading ? (
                <span className="treasury-amount-skeleton" aria-busy="true" />
              ) : (
                <p className="payment-rail-amount">
                  {balanceFailed ? "—" : formatAmount(balance, 2)}
                  <span className="treasury-unit">USD</span>
                </p>
              )}
            </div>
          </div>

          <p className="payment-rail-note">
            <ShieldCheck size={13} />
            Deposits are final. Use for invoices and storage only.
          </p>

          <div className="payment-rail-actions">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-lg"
              onClick={onOpenBalance}
            >
              <Plus size={14} />
              Add funds
            </Button>
            <button type="button" className="payment-rail-link" onClick={onOpenBalance}>
              Transactions
            </button>
          </div>

          {pesepayError ? (
            <div className="payment-rail-error">
              <FieldError>{pesepayError}</FieldError>
              <Button variant="ghost" size="sm" onClick={onRetryPesepay}>
                Retry
              </Button>
            </div>
          ) : null}
        </article>
      </div>

      <div className="treasury-rule" aria-hidden="true" />
    </section>
  );
}
