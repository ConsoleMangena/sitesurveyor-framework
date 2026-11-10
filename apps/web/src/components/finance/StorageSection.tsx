import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { DashboardSection } from "@/components/dashboard/DashboardShell.tsx";
import {
  getWorkspaceStorageUsage,
  type StorageUsage,
} from "../../lib/repositories/attachments.ts";
import {
  listStoragePurchases,
  type StoragePurchaseRow,
} from "../../lib/repositories/pesepay.ts";
import { formatDate } from "./FinanceUtils.ts";
import PackageCatalog, { type PurchaseMessage } from "./PackageCatalog.tsx";

interface StorageSectionProps {
  workspaceId: string;
  walletBalance: number;
  refreshKey: number;
  onMessage: (message: PurchaseMessage | null) => void;
}

function mbToGb(mb: number): string {
  return (mb / 1024).toFixed(mb >= 10240 ? 0 : 1);
}

export default function StorageSection({
  workspaceId,
  walletBalance,
  refreshKey,
  onMessage,
}: StorageSectionProps) {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [purchases, setPurchases] = useState<StoragePurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedAtMs, setLoadedAtMs] = useState(0);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [nextUsage, nextPurchases] = await Promise.all([
        getWorkspaceStorageUsage(workspaceId),
        listStoragePurchases(workspaceId, 12),
      ]);
      setUsage(nextUsage);
      setPurchases(nextPurchases);
      setLoadedAtMs(Date.now());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load storage.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const activePurchases = purchases.filter(
    (purchase) => purchase.expires_at === null || new Date(purchase.expires_at).getTime() > loadedAtMs,
  );
  const activeAddOnMb = activePurchases.reduce(
    (sum, purchase) => sum + Number(purchase.storage_mb),
    0,
  );

  return (
    <DashboardSection title="Workspace storage">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="gap-4 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Used of total quota</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <Skeleton className="h-8 w-40" />
            ) : usage ? (
              <>
                <div className="text-2xl font-bold tabular-nums">
                  {usage.used_mb.toFixed(0)} MB
                  <span className="text-base font-medium text-muted-foreground">
                    {" "}
                    / {usage.limit_mb.toFixed(0)} MB
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-none bg-muted">
                  <div
                    className={`h-full rounded-none ${usage.over_quota ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${Math.min(100, usage.percent)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {usage.file_count.toLocaleString()} file
                  {usage.file_count === 1 ? "" : "s"} ·{" "}
                  {mbToGb(usage.limit_mb)} GB available
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{error ?? "No quota data yet."}</p>
            )}
          </CardContent>
        </Card>

        <Card className="gap-4 border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">How the quota is built</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col divide-y divide-border text-sm">
              <div className="flex items-baseline justify-between gap-4 py-2 first:pt-0">
                <dt className="text-muted-foreground">Base allowance</dt>
                <dd className="font-mono tabular-nums">
                  {usage ? `${usage.base_limit_mb.toFixed(0)} MB` : "—"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-muted-foreground">Active add-ons</dt>
                <dd className="font-mono tabular-nums">{activeAddOnMb.toLocaleString()} MB</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-muted-foreground">Expiring next</dt>
                <dd className="font-mono tabular-nums">
                  {usage && usage.expiring_storage_mb > 0
                    ? `${usage.expiring_storage_mb.toFixed(0)} MB · ${
                        usage.next_storage_expiration
                          ? formatDate(usage.next_storage_expiration)
                          : "soon"
                      }`
                    : "—"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <PackageCatalog
        workspaceId={workspaceId}
        kind="storage"
        walletBalance={walletBalance}
        headline={(pkg) =>
          `${mbToGb(pkg.storageMb ?? 0)} GB for ${pkg.durationDays ?? 0} days`
        }
        unitNote={(pkg) =>
          pkg.storageMb && pkg.durationDays
            ? `$${(pkg.amount / ((pkg.storageMb / 1024) * (pkg.durationDays / 30))).toFixed(2)} per GB-month`
            : null
        }
        onMessage={onMessage}
        onChanged={load}
      />

      <div className="border rounded-none overflow-hidden">
        <ResponsiveTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Purchased</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead className="hidden sm:table-cell">Valid until</TableHead>
                <TableHead className="hidden md:table-cell">Paid</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6}>
                    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading storage purchases…
                    </div>
                  </TableCell>
                </TableRow>
              ) : purchases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-sm text-muted-foreground">
                    No storage packages purchased yet.
                  </TableCell>
                </TableRow>
              ) : (
                purchases.map((purchase) => {
                  const expired =
                    purchase.expires_at !== null &&
                    new Date(purchase.expires_at).getTime() <= loadedAtMs;
                  return (
                    <TableRow key={purchase.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(purchase.created_at)}
                      </TableCell>
                      <TableCell className="font-mono text-sm tabular-nums">
                        {Number(purchase.storage_mb).toLocaleString()} MB
                      </TableCell>
                      <TableCell className="hidden sm:table-cell whitespace-nowrap text-sm">
                        {purchase.expires_at ? formatDate(purchase.expires_at) : "Base allowance"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell whitespace-nowrap text-sm text-muted-foreground">
                        {purchase.payment_method}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        ${Number(purchase.amount).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={expired ? "secondary" : "success"}>
                          {expired ? "Expired" : "Active"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ResponsiveTable>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
    </DashboardSection>
  );
}
