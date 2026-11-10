import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Lock, TrendingUp } from "lucide-react";

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
import {
  getPlatformFinancialOverview,
  listAiCreditTransactions,
  listPesepayTransactions,
  type PesepayTransactionRow,
  type PlatformFinancialOverview,
} from "../../lib/repositories/pesepay.ts";
import { formatMoney, pesepayKindLabel } from "./FinanceUtils.ts";

interface FinancialInsightsSectionProps {
  workspaceId: string;
  isPlatformAdmin: boolean;
  refreshKey: number;
}

function ShareRow({
  label,
  amount,
  total,
  currencyCode,
}: {
  label: string;
  amount: number;
  total: number;
  currencyCode: string;
}) {
  const percent = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">
          {formatMoney(amount, currencyCode)}
          <span className="ml-2 text-xs text-muted-foreground">{percent}%</span>
        </span>
      </div>
      <div className="h-1.5 w-full rounded-none bg-muted">
        <div className="h-full rounded-none bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default function FinancialInsightsSection({
  workspaceId,
  isPlatformAdmin,
  refreshKey,
}: FinancialInsightsSectionProps) {
  const [rows, setRows] = useState<PesepayTransactionRow[]>([]);
  const [refunds, setRefunds] = useState(0);
  const [platform, setPlatform] = useState<PlatformFinancialOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [platformLoading, setPlatformLoading] = useState(isPlatformAdmin);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [transactions, creditLedger] = await Promise.all([
        listPesepayTransactions(workspaceId, 100),
        listAiCreditTransactions(workspaceId, 100).catch(() => []),
      ]);
      setRows(transactions);
      setRefunds(
        creditLedger
          .filter((entry) => entry.kind === "refund" || entry.kind === "reversal")
          .reduce((sum, entry) => sum + Math.abs(Number(entry.credits_delta)), 0),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load spending insights.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    let cancelled = false;
    getPlatformFinancialOverview()
      .then((data) => {
        if (!cancelled) setPlatform(data);
      })
      .catch(() => {
        if (!cancelled) setPlatform(null);
      })
      .finally(() => {
        if (!cancelled) setPlatformLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPlatformAdmin, refreshKey]);

  const summary = useMemo(() => {
    const completed = rows.filter((row) => row.status === "completed");
    const byKind = new Map<string, { amount: number; currency: string }>();
    let total = 0;
    for (const row of completed) {
      if (row.kind === "deposit") continue;
      const current = byKind.get(row.kind) ?? { amount: 0, currency: row.currency_code };
      current.amount += Number(row.amount);
      byKind.set(row.kind, current);
      total += Number(row.amount);
    }
    const settled = completed.filter((row) => row.kind !== "deposit");
    const failures = rows.filter(
      (row) => row.status === "failed" || row.status === "cancelled",
    );
    const fees = settled.reduce((sum, row) => sum + Number(row.estimated_payment_fee), 0);
    const infrastructure = settled.reduce(
      (sum, row) => sum + Number(row.estimated_infrastructure_cost),
      0,
    );
    return {
      total,
      byKind: [...byKind.entries()].sort((a, b) => b[1].amount - a[1].amount),
      settledCount: settled.length,
      failureCount: failures.length,
      pendingCount: rows.filter((row) => row.status === "pending").length,
      fees,
      infrastructure,
      currency: settled[0]?.currency_code ?? "USD",
    };
  }, [rows]);

  const successRate =
    summary.settledCount + summary.failureCount > 0
      ? Math.round(
          (summary.settledCount / (summary.settledCount + summary.failureCount)) * 100,
        )
      : null;

  return (
    <DashboardSection title="Insights">
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : error ? (
        <ErrorNotice tone="danger">{error}</ErrorNotice>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="gap-4 border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Where the money went</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.byKind.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No confirmed purchases yet.
                </p>
              ) : (
                summary.byKind.map(([kind, value]) => (
                  <ShareRow
                    key={kind}
                    label={pesepayKindLabel(kind)}
                    amount={value.amount}
                    total={summary.total}
                    currencyCode={value.currency}
                  />
                ))
              )}
              <div className="flex items-baseline justify-between gap-4 border-t pt-3 text-sm">
                <span className="font-medium">Total</span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatMoney(summary.total, summary.currency)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-4 border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Payment quality</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col divide-y divide-border text-sm">
                <div className="flex items-baseline justify-between gap-4 py-2 first:pt-0">
                  <dt className="text-muted-foreground">Confirmed payments</dt>
                  <dd className="font-mono tabular-nums">{summary.settledCount}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="text-muted-foreground">Failed or cancelled</dt>
                  <dd className="font-mono tabular-nums">{summary.failureCount}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="text-muted-foreground">Awaiting confirmation</dt>
                  <dd className="font-mono tabular-nums">{summary.pendingCount}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="text-muted-foreground">Success rate</dt>
                  <dd className="font-mono tabular-nums">
                    {successRate === null ? "—" : `${successRate}%`}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="text-muted-foreground">Payment fees recorded</dt>
                  <dd className="font-mono tabular-nums">
                    {formatMoney(summary.fees, summary.currency)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="text-muted-foreground">Estimated infrastructure cost</dt>
                  <dd className="font-mono tabular-nums">
                    {formatMoney(summary.infrastructure, summary.currency)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="text-muted-foreground">SiteSurveyor credits refunded</dt>
                  <dd className="font-mono tabular-nums">{refunds.toLocaleString()}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      )}

      {isPlatformAdmin ? (
        <Card className="gap-4 border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-medium">Platform revenue report</CardTitle>
            </div>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {platformLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Reading platform totals…
              </div>
            ) : !platform ? (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                Platform totals need the billing overview function applied to the database.
              </p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    { label: "Gross revenue", value: formatMoney(Number(platform.gross_revenue), platform.currency_code) },
                    { label: "Refunds", value: formatMoney(Number(platform.refunds), platform.currency_code) },
                    { label: "Payment fees", value: formatMoney(Number(platform.payment_fees), platform.currency_code) },
                    { label: "Infrastructure cost", value: formatMoney(Number(platform.infrastructure_costs), platform.currency_code) },
                    {
                      label: "Estimated profit",
                      value: formatMoney(Number(platform.estimated_profit), platform.currency_code),
                    },
                    {
                      label: "Margin",
                      value:
                        Number(platform.gross_revenue) > 0
                          ? `${Math.round(
                              (Number(platform.estimated_profit) / Number(platform.gross_revenue)) * 100,
                            )}%`
                          : "—",
                    },
                  ].map((item) => (
                    <div key={item.label} className="border-t pt-2">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="font-mono text-lg font-semibold tabular-nums">{item.value}</p>
                    </div>
                  ))}
                </div>
                <dl className="mt-4 flex flex-col divide-y divide-border text-sm">
                  <div className="flex items-baseline justify-between gap-4 py-2 first:pt-0">
                    <dt className="text-muted-foreground">Transactions recorded</dt>
                    <dd className="font-mono tabular-nums">
                      {Number(platform.transaction_volume).toLocaleString()} ·{" "}
                      {Number(platform.successful_orders).toLocaleString()} completed
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 py-2">
                    <dt className="text-muted-foreground">Volume sold</dt>
                    <dd className="font-mono tabular-nums">
                      {Number(platform.ai_credits_sold).toLocaleString()} credits ·{" "}
                      {(Number(platform.storage_mb_sold) / 1024).toFixed(1)} GB
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Cost basis: {platform.cost_basis} Reconcile against the provider invoice
                  before quoting these margins externally. PesePay exposes no refund call, so
                  the money is settled with the provider first and then recorded on the
                  Transactions tab; recording it moves the payment out of revenue and into
                  refunds, and takes back whatever the purchase still granted.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Refresh insights
        </Button>
      </div>
    </DashboardSection>
  );
}
