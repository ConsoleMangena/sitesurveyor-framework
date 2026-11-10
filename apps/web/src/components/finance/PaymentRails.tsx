import { Plus, RefreshCw, ShieldCheck } from "lucide-react";

import FieldError from "@/components/errors/FieldError.tsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { SolanaBalances } from "../../features/phantom/hooks/useSolanaBalances.ts";
import { SOLANA_CLUSTER, SOLANA_CLUSTER_LABEL } from "../../features/phantom/lib/config.ts";
import type { PesepayWalletRow } from "../../lib/repositories/pesepay.ts";
import SolanaLogo from "../../features/phantom/components/SolanaLogo.tsx";
import PesepayLogo from "../../features/phantom/components/PesepayLogo.tsx";

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

function RailIcon({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground",
        className,
      )}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

function BalanceRow({
  icon,
  label,
  value,
  unit,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  loading: boolean;
}) {
  return (
    <div className="min-w-0">
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </span>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-28" aria-busy="true" />
      ) : (
        <p className="mt-1 flex items-baseline gap-2">
          <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{unit}</span>
        </p>
      )}
    </div>
  );
}

function WalletStatus({
  connected,
  hasWallet,
  address,
  walletName,
  shortAddress,
}: {
  connected: boolean;
  hasWallet: boolean;
  address: string | null;
  walletName: string | null | undefined;
  shortAddress: string;
}) {
  return (
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
            ? walletName ?? (connected ? "Connected wallet" : "Saved wallet")
            : "No wallet connected"}
        </p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {connected && address
            ? `${shortAddress} · signs here`
            : address
            ? `${shortAddress} · saved method, connect to pay`
            : "Connect a wallet to pay with USDC"}
        </p>
      </div>
    </div>
  );
}

function RailHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
      <div className="flex min-w-0 items-start gap-3">
        <RailIcon>{icon}</RailIcon>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </CardHeader>
  );
}

function RailContent({ children }: { children: React.ReactNode }) {
  return <CardContent className="space-y-4">{children}</CardContent>;
}

function ActionButtonRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function SavedWalletNote({ connected, hasWallet, walletName, shortAddress }: {
  connected: boolean;
  hasWallet: boolean;
  walletName: string | null | undefined;
  shortAddress: string;
}) {
  if (!hasWallet || connected) return null;
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <SolanaLogo size={14} className="mt-0.5 shrink-0 text-primary" />
      Saved for payments. Connect it to sign USDC transfers.
    </p>
  );
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
  const shortAddr = shortAddress(address ?? "");

  return (
    <section className="space-y-4" aria-label="Payment rails">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Payment rails
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Crypto rail (Solana) ─────────────────────────── */}
        <Card data-rail="crypto" className="gap-4 border-border">
          <RailHeader
            icon={<SolanaLogo size={22} />}
            title="Crypto wallets"
            subtitle={`Solana ${clusterLabel} · USDC`}
          />

          <RailContent>
            <WalletStatus
              connected={connected}
              hasWallet={hasWallet}
              address={address}
              walletName={walletName}
              shortAddress={shortAddr}
            />

            <div className="flex flex-col lg:flex-row gap-6">
              <BalanceRow
                icon={<SolanaLogo size={12} />}
                label="USDC available"
                value={formatAmount(solana.usdc, 2)}
                unit="USDC"
                loading={solana.loading && solana.usdc === null}
              />

              <BalanceRow
                icon={<SolanaLogo size={12} />}
                label="SOL for fees"
                value={formatAmount(solana.sol, 4)}
                unit="SOL"
                loading={solana.loading && solana.sol === null}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
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

              <ActionButtonRow>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={onManageWallets}
                >
                  <SolanaLogo size={14} />
                  {connected ? "Manage wallets" : "Connect wallet"}
                </Button>
              </ActionButtonRow>
            </div>

            <SavedWalletNote
              connected={connected}
              hasWallet={hasWallet}
              walletName={walletName}
              shortAddress={shortAddr}
            />

            {solana.error ? (
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <FieldError>{solana.error}</FieldError>
              </div>
            ) : null}
          </RailContent>
        </Card>

        {/* ── Fiat rail (PesePay) ──────────────────────────── */}
        <Card data-rail="pesepay" className="gap-4 border-border">
          <RailHeader
            icon={<PesepayLogo size={24} />}
            title="PesePay balance"
            subtitle="Prepaid USD · personal to you"
          />

          <RailContent>
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

            <BalanceRow
              icon={<PesepayLogo size={12} />}
              label="Available balance"
              value={balanceFailed ? "—" : formatAmount(balance, 2)}
              unit="USD"
              loading={pesepayLoading}
            />

            <ActionButtonRow>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={onOpenBalance}
              >
                <Plus className="h-4 w-4" />
                Add funds
              </Button>
            </ActionButtonRow>

            {pesepayError ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/50 p-3">
                <FieldError>{pesepayError}</FieldError>
                <Button variant="ghost" size="sm" onClick={onRetryPesepay}>
                  Retry
                </Button>
              </div>
            ) : null}
          </RailContent>
        </Card>
      </div>
    </section>
  );
}