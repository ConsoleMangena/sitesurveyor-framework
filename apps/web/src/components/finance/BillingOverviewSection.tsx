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
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";
import { DashboardSection } from "@/components/dashboard/DashboardShell.tsx";
import { MetricStrip } from "@/components/dashboard/MetricStrip.tsx";
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
    return <MetricStrip metrics={[]} loading />;
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
        Nothing to show yet.
      </p>
    );
  }

  const storage = overview.storage;

  return (
    <DashboardSection title="Overview">
      <MetricStrip
        metrics={[
          {
            label: "AI credits available",
            value: Number(overview.ai_credit_balance).toLocaleString(),
            subtext: `${Number(overview.ai_credits_used).toLocaleString()} used`,
            tone: "primary",
            icon: <Sparkles />,
          },
          {
            label: "SiteSurveyor balance",
            value: formatCurrency(Number(overview.wallet_balance)),
            subtext: "Prepaid via PesePay",
            icon: <Wallet />,
          },
          {
            label: "Storage used",
            value: storage ? `${storage.used_mb.toFixed(0)} MB` : "—",
            subtext: storage ? `of ${storage.limit_mb.toFixed(0)} MB` : "No quota data",
            tone: "info",
            icon: <HardDrive />,
          },
          {
            label: "Total spent",
            value: formatCurrency(Number(overview.total_spent)),
            subtext: `${overview.successful_purchases} completed purchase${
              overview.successful_purchases === 1 ? "" : "s"
            }`,
            icon: <Coins />,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex h-full flex-col justify-between border-border">
          <div>
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
          </div>
        </Card>

        <Card className="flex h-full flex-col justify-between border-border">
          <div>
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
          </div>
        </Card>

        <Card className="flex h-full flex-col justify-between border-border">
          <div>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Buy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Top up balances or expand allowances</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => onSection("credits")}>
                  <Sparkles className="h-3.5 w-3.5" />
                  AI credits
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => onSection("storage")}>
                  <HardDrive className="h-3.5 w-3.5" />
                  Storage
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => onSection("methods")}>
                  <Wallet className="h-3.5 w-3.5" />
                  Add money
                </Button>
              </div>
            </CardContent>
          </div>
        </Card>
      </div>
    </DashboardSection>
  );
}
