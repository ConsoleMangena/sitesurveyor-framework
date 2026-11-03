import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";
import {
  initiatePackageCheckout,
  listBillingPackages,
  payPackageWithBalance,
  type BillingPackage,
  type BillingPackageKind,
} from "../../lib/repositories/pesepay.ts";

export type PurchaseMessage = {
  tone: "success" | "error" | "pending";
  text: string;
};

interface PackageCatalogProps {
  workspaceId: string;
  kind: BillingPackageKind;
  /** SiteSurveyor (PesePay) balance in the package currency, used for balance purchases. */
  walletBalance: number;
  /** What the buyer receives, e.g. "500 credits" or "10 GB · 30 days". */
  headline: (pkg: BillingPackage) => string;
  /** Optional value note, e.g. "$0.03 per credit". */
  unitNote?: (pkg: BillingPackage) => string | null;
  onMessage: (message: PurchaseMessage | null) => void;
  /** Called after a purchase so the parent can refresh balances and ledgers. */
  onChanged: () => void;
}

export default function PackageCatalog({
  workspaceId,
  kind,
  walletBalance,
  headline,
  unitNote,
  onMessage,
  onChanged,
}: PackageCatalogProps) {
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listBillingPackages(kind)
      .then((rows) => {
        if (!cancelled) {
          setPackages(rows);
          setLoadError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Unable to load packages.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const buyWithCheckout = useCallback(
    async (pkg: BillingPackage) => {
      setBusyId(pkg.id);
      onMessage(null);
      try {
        const checkout = await initiatePackageCheckout({
          workspaceId,
          packageId: pkg.id,
        });
        // PesePay holds the payment page; the return URL re-verifies this order.
        window.location.assign(checkout.redirectUrl);
      } catch (err: unknown) {
        onMessage({
          tone: "error",
          text:
            err instanceof Error
              ? err.message
              : "Unable to open PesePay checkout. Try again.",
        });
        setBusyId(null);
      }
    },
    [workspaceId, onMessage],
  );

  const buyFromBalance = useCallback(
    async (pkg: BillingPackage) => {
      setBusyId(pkg.id);
      onMessage(null);
      try {
        const paid = await payPackageWithBalance({ workspaceId, packageId: pkg.id });
        onMessage({
          tone: "success",
          text: `${pkg.label} added to this workspace. SiteSurveyor balance is now $${paid.balance.toFixed(2)}.`,
        });
        onChanged();
      } catch (err: unknown) {
        onMessage({
          tone: "error",
          text:
            err instanceof Error
              ? err.message
              : "Unable to take this purchase from your balance.",
        });
      } finally {
        setBusyId(null);
      }
    },
    [workspaceId, onMessage, onChanged],
  );

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-44 w-full" />
        ))}
      </div>
    );
  }

  if (loadError) {
    return <ErrorNotice tone="danger">{loadError}</ErrorNotice>;
  }

  if (packages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No packages are on sale right now. Prices are set by the platform
        administrator.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {packages.map((pkg) => {
        const covered = walletBalance >= pkg.amount;
        const busy = busyId === pkg.id;
        return (
          <Card key={pkg.id} className="flex flex-col justify-between gap-4 border-border">
            <CardHeader className="space-y-1 pb-2">
              <CardTitle className="text-base">{headline(pkg)}</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                {pkg.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <span className="text-2xl font-bold tabular-nums">
                  ${pkg.amount.toFixed(2)}
                </span>
                {unitNote ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {unitNote(pkg)}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void buyFromBalance(pkg)}
                >
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {busy ? "Processing…" : "Pay from balance"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void buyWithCheckout(pkg)}
                >
                  Pay with PesePay
                </Button>
              </div>
              {!covered && (
                <p className="text-xs text-muted-foreground">
                  Balance is ${walletBalance.toFixed(2)} — PesePay checkout covers
                  this package.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
