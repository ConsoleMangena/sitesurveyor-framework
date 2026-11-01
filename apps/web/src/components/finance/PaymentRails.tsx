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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { SolanaBalances } from "../../features/phantom/hooks/useSolanaBalances.ts";
import { SOLANA_CLUSTER, SOLANA_CLUSTER_LABEL } from "../../features/phantom/lib/config.ts";
import type { PesepayWalletRow } from "../../lib/repositories/pesepay.ts";

interface PaymentRailsProps {
  address: string | null;
  walletName?: string | null;
  connected: boolean;
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
  connected,
  solana,
  pesepayBalance,
  pesepayLoading,
  pesepayError,
  onManageWallets,
  onOpenBalance,
  onRetryPesepay,
}: PaymentRailsProps) {
  const hasWallet = Boolean(address);
  const balance = Number(pesepayBalance?.balance ?? 0);
  const balanceFailed = Boolean(pesepayError);
  const clusterLabel = SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER];

  return (
    <section className="space-y-4" aria-label="Payment rails">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Payment rails
        </p>
        <p className="text-sm text-muted-foreground">
          Pay an invoice from a Solana wallet or your prepaid PesePay balance.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Crypto rail (Solana) ─────────────────────────── */}
        <Card data-rail="crypto" className="gap-4 border-border">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <div className="flex min-w-0 items-start gap-3">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground"
                aria-hidden="true"
              >
                <Wallet className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Crypto wallets</h3>
                <p className="text-xs text-muted-foreground">
                  Solana {clusterLabel} · USDC
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  connected ? "bg-primary" : "bg-border",
                )}
                data-connected={connected || undefined}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {hasWallet
                    ? (walletName ?? (connected ? "Connected wallet" : "Saved wallet"))
                    : "No wallet connected"}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {connected && address
                    ? `${shortAddress(address)} · signs here`
                    : address
                      ? `${shortAddress(address)} · saved method, connect to pay`
                      : "Connect a wallet to pay with USDC"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-end gap-6">
                <div className="min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <CircleDollarSign className="h-4 w-4" />
                    USDC available
                  </span>
                  {solana.loading && solana.usdc === null ? (
                    <Skeleton className="mt-2 h-7 w-28" aria-busy="true" />
                  ) : (
                    <p className="mt-1 flex items-baseline gap-2">
                      <span className="font-mono text-2xl font-semibold tabular-nums">
                        {formatAmount(solana.usdc, 2)}
                      </span>
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        USDC
                      </span>
                    </p>
                  )}
                </div>

                <div className="min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <Coins className="h-4 w-4" />
                    SOL for fees
                  </span>
                  {solana.loading && solana.sol === null ? (
                    <Skeleton className="mt-2 h-7 w-24" aria-busy="true" />
                  ) : (
                    <p className="mt-1 flex items-baseline gap-2">
                      <span className="font-mono text-2xl font-semibold tabular-nums">
                        {formatAmount(solana.sol, 4)}
                      </span>
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        SOL
                      </span>
                    </p>
                  )}
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={solana.refresh}
                disabled={solana.loading || !hasWallet}
                aria-label="Refresh wallet balances"
                className="shrink-0"
              >
                <RefreshCw
                  className={cn("h-4 w-4", solana.loading && "animate-spin")}
                />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={onManageWallets}
              >
                <Wallet className="h-4 w-4" />
                {connected ? "Manage wallets" : "Connect wallet"}
              </Button>
            </div>

            {address && !connected ? (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Saved for payments. Connect it to sign USDC transfers.
              </p>
            ) : null}

            {solana.error ? (
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <FieldError>{solana.error}</FieldError>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* ── Fiat rail (PesePay) ──────────────────────────── */}
        <Card data-rail="pesepay" className="gap-4 border-border">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
            <div className="flex min-w-0 items-start gap-3">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground"
                aria-hidden="true"
              >
                <CreditCard className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">PesePay balance</h3>
                <p className="text-xs text-muted-foreground">
                  Prepaid USD · personal to you
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  balance > 0 && !balanceFailed ? "bg-primary" : "bg-border",
                )}
                data-connected={(balance > 0 && !balanceFailed) || undefined}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium">SiteSurveyor credit</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  USD · invoices and storage
                </p>
              </div>
            </div>

            <div>
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Available balance
              </span>
              {pesepayLoading ? (
                <Skeleton className="mt-2 h-7 w-28" aria-busy="true" />
              ) : (
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-semibold tabular-nums">
                    {balanceFailed ? "—" : formatAmount(balance, 2)}
                  </span>
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    USD
                  </span>
                </p>
              )}
            </div>

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Deposits are final. Use for invoices and storage only.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={onOpenBalance}
              >
                <Plus className="h-4 w-4" />
                Add funds
              </Button>
              <button
                type="button"
                onClick={onOpenBalance}
                className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Transactions
              </button>
            </div>

            {pesepayError ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/50 p-3">
                <FieldError>{pesepayError}</FieldError>
                <Button variant="ghost" size="sm" onClick={onRetryPesepay}>
                  Retry
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
