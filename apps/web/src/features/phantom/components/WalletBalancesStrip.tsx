import type { ReactNode } from "react";
import { CircleDollarSign, Coins, RefreshCw, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SOLANA_CLUSTER } from "../lib/config.ts";
import { useSolanaBalances } from "../hooks/useSolanaBalances.ts";

interface WalletBalancesStripProps {
  address: string | null;
  connected: boolean;
  onConnect?: () => void;
}

function formatAmount(value: number | null, maxDp: number): string {
  if (value === null) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: maxDp,
  });
}

function BalanceTile({
  label,
  symbol,
  amount,
  maxDp,
  accent,
  icon,
  loading,
  error,
  action,
}: {
  label: string;
  symbol: "USDC" | "SOL";
  amount: number | null;
  maxDp: number;
  accent: string;
  icon: ReactNode;
  loading: boolean;
  error: string | null;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", accent)}>
            {icon}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-[11px] text-muted-foreground">{SOLANA_CLUSTER}</p>
          </div>
        </div>
        {action}
      </div>
      {loading ? (
        <div className="mt-4 h-9 w-40 animate-pulse rounded-lg bg-muted" aria-busy="true" />
      ) : (
        <p className="mt-4 font-mono text-3xl font-bold tabular-nums tracking-tight">
          {formatAmount(amount, maxDp)}
          <span className="ml-2 text-sm font-semibold text-muted-foreground">{symbol}</span>
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default function WalletBalancesStrip({ address, connected, onConnect }: WalletBalancesStripProps) {
  const { sol, usdc, loading, error, refresh } = useSolanaBalances(connected ? address : null);

  const refreshButton = (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={refresh}
      disabled={loading || !connected}
      aria-label="Refresh balances"
    >
      <RefreshCw size={14} className={cn(loading && "animate-spin")} />
    </Button>
  );

  if (!connected) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          { label: "USDC balance", symbol: "USDC" as const, accent: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", icon: <CircleDollarSign size={20} /> },
          { label: "SOL balance", symbol: "SOL" as const, accent: "bg-violet-500/15 text-violet-600 dark:text-violet-400", icon: <Coins size={20} /> },
        ].map((tile) => (
          <div key={tile.symbol} className="rounded-2xl border border-dashed border-border/60 bg-card p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", tile.accent)}>
                {tile.icon}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tile.label}</p>
                <p className="text-[11px] text-muted-foreground">Connect a wallet to view</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="font-mono text-3xl font-bold tabular-nums text-muted-foreground">—</p>
              {onConnect && (
                <Button size="sm" variant="outline" className="gap-2 rounded-xl" onClick={onConnect}>
                  <Wallet size={14} />
                  Connect wallet
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <BalanceTile
        label="USDC balance"
        symbol="USDC"
        amount={usdc}
        maxDp={2}
        accent="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
        icon={<CircleDollarSign size={20} />}
        loading={loading}
        error={error}
        action={refreshButton}
      />
      <BalanceTile
        label="SOL balance"
        symbol="SOL"
        amount={sol}
        maxDp={4}
        accent="bg-violet-500/15 text-violet-600 dark:text-violet-400"
        icon={<Coins size={20} />}
        loading={loading}
        error={error}
      />
    </div>
  );
}
