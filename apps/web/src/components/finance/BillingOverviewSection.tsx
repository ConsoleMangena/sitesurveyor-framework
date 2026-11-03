import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Coins,
  HardDrive,
  Hourglass,
  Loader2,
  Sparkles,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";
import { DashboardSection } from "@/components/dashboard/DashboardShell.tsx";
import { getWorkspaceBillingOverview } from "../../lib/repositories/pesepay.ts";
import type { WorkspaceBillingOverview } from "../../lib/repositories/pesepay.ts";
import { formatCurrency, formatDate } from "./FinanceUtils.ts";
import type { BillingSectionId } from "./billingSections.ts";

interface BillingOverviewSectionProps {
  workspaceId: string;
  refreshKey: number;
  onSection: (section: BillingSectionId) => void;
}

export default function BillingOverviewSection({
  workspaceId,
  refreshKey,
  onSection,
}: BillingOverviewSectionProps) {
  const [overview, setOverview] = useState<WorkspaceBillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setOverview(await getWorkspaceBillingOverview(workspaceId));
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to load your billing overview.",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <ErrorNotice tone="danger">
        {error}
        <Button variant="outline" size="sm" className="mt-2" onClick={() => void load()}>
          <Loader2 className="animate-spin" /> Try again
        </Button>
      </ErrorNotice>
    );
  }

  if (!overview) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing to show yet. Buy a package or top up your balance and this page fills in.
      </p>
    );
  }

  const storage = overview.storage;
  const tiles = [
    {
      key: "credits",
      label: "AI credits available",
      value: Number(overview.ai_credit_balance).toLocaleString(),
      caption: `${Number(overview.ai_credits_used).toLocaleString()} used across AI calls`,
      icon: Sparkles,
    },
    {
      key: "balance",
      label: "SiteSurveyor balance",
      value: formatCurrency(Number(overview.wallet_balance)),
      caption: "Prepaid from PesePay, usable for credits and storage",
      icon: Wallet,
    },
    {
      key: "storage",
      label: "Storage used",
      value: storage ? `${storage.used_mb.toFixed(0)} MB` : "—",
      caption: storage
        ? `of ${storage.limit_mb.toFixed(0)} MB · ${storage.file_count.toLocaleString()} files`
        : "No quota data",
      icon: HardDrive,
    },
    {
      key: "spent",
      label: "Total spent",
      value: formatCurrency(Number(overview.total_spent)),
      caption: `${overview.successful_purchases} completed purchase${
        overview.successful_purchases === 1 ? "" : "s"
      }`,
      icon: Coins,
    },
  ];

  return (
    <DashboardSection title="Overview">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="list" aria-label="Billing totals">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Card key={tile.key} role="listitem" className="gap-4 border-border">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{tile.label}</CardTitle>
                <Icon className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">{tile.value}</div>
                <p className="text-xs text-muted-foreground">{tile.caption}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-4 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {overview.pending_payments > 0 ? (
              <p className="flex items-start gap-2 text-warning">
                <Hourglass className="mt-0.5 h-4 w-4 shrink-0" />
                {overview.pending_payments} payment{overview.pending_payments === 1 ? "" : "s"}{" "}
                still awaiting PesePay confirmation. Credits and storage arrive only once it lands.
              </p>
            ) : null}
            {overview.failed_payments > 0 ? (
              <p className="flex items-start gap-2 text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {overview.failed_payments} payment{overview.failed_payments === 1 ? "" : "s"}{" "}
                failed or was cancelled. Nothing was allocated for those.
              </p>
            ) : null}
            {storage?.expiring_storage_mb ? (
              <p className="flex items-start gap-2 text-muted-foreground">
                <HardDrive className="mt-0.5 h-4 w-4 shrink-0" />
                {storage.expiring_storage_mb.toFixed(0)} MB of purchased storage ends{" "}
                {storage.next_storage_expiration ? formatDate(storage.next_storage_expiration) : "soon"}.
                Renew before then to keep uploading at the same quota.
              </p>
            ) : null}
            {overview.pending_payments === 0 &&
            overview.failed_payments === 0 &&
            !storage?.expiring_storage_mb ? (
              <p className="text-muted-foreground">
                Nothing waiting on a payment. All confirmed purchases are allocated.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="gap-4 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Quota build-up</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col divide-y divide-border text-sm">
              <div className="flex items-baseline justify-between gap-4 py-2 first:pt-0">
                <dt className="text-muted-foreground">Base allowance</dt>
                <dd className="font-mono tabular-nums">
                  {storage ? `${storage.base_limit_mb.toFixed(0)} MB` : "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-muted-foreground">Purchased add-ons</dt>
                <dd className="font-mono tabular-nums">
                  {storage ? `${storage.purchased_storage_mb.toFixed(0)} MB` : "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-muted-foreground">Total quota</dt>
                <dd className="font-mono font-semibold tabular-nums">
                  {storage ? `${storage.limit_mb.toFixed(0)} MB` : "—"}
                </dd>
              </div>
            </dl>
            {storage?.over_quota ? (
              <p className="mt-3 flex items-start gap-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Over quota: new uploads are blocked, existing files stay downloadable.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="gap-4 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Buy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Packages and prices come from the platform catalog, so they change without an
              app release. Every purchase is confirmed by PesePay before it lands.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={() => onSection("credits")}>
                <Sparkles />
                AI credits
              </Button>
              <Button size="sm" variant="outline" onClick={() => onSection("storage")}>
                <HardDrive />
                Storage
              </Button>
              <Button size="sm" variant="outline" onClick={() => onSection("methods")}>
                <Wallet />
                Add money
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardSection>
  );
}
