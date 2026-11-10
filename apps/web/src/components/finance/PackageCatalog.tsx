import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-36 w-full rounded-xl" />
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
        No packages are on sale right now. The catalog is published by the
        deployment operator and read-only here, so nothing can be bought until a
        package is marked active.
      </p>
    );
  }

  return (
    <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {packages.map((pkg) => {
        const covered = walletBalance >= pkg.amount;
        const busy = busyId === pkg.id;
        return (
          <Card
            key={pkg.id}
            className="flex flex-col justify-between h-full rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 shadow-sm"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-foreground truncate">
                    {headline(pkg)}
                  </h4>
                  {unitNote && unitNote(pkg) ? (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {unitNote(pkg)}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-base sm:text-lg font-bold font-mono tabular-nums text-foreground">
                    ${pkg.amount.toFixed(2)}
                  </span>
                </div>
              </div>

              {pkg.description ? (
                <p className="mt-2 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {pkg.description}
                </p>
              ) : null}
            </div>

            <div className="mt-4 pt-3 border-t border-border/60 flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void buyFromBalance(pkg)}
                  className="w-full text-xs h-8 px-2"
                  variant={covered ? "default" : "secondary"}
                >
                  {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  {busy ? "Processing…" : "Pay from balance"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void buyWithCheckout(pkg)}
                  className="w-full text-xs h-8 px-2"
                >
                  Pay with PesePay
                </Button>
              </div>
              {!covered && (
                <span className="text-[11px] text-muted-foreground truncate">
                  Balance is ${walletBalance.toFixed(2)} — PesePay checkout covers this.
                </span>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
