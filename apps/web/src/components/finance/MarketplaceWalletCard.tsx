import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TriangleAlert, Wallet } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAsyncAction } from "@/hooks/useAsyncAction.ts";
import type { PaymentMethodRow } from "@/lib/repositories/paymentMethods.ts";
import { getMarketplaceWallet, updateMarketplaceWallet } from "@/lib/repositories/workspaces.ts";

interface MarketplaceWalletCardProps {
  workspaceId: string;
  connectedAddress: string | null;
  connectedWalletName?: string | null;
  cryptoMethods: PaymentMethodRow[];
  canManage?: boolean;
  onAddWallet?: () => void;
  onNotice?: (message: string) => void;
}

const NONE_VALUE = "__none__";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export default function MarketplaceWalletCard({
  workspaceId,
  connectedAddress,
  connectedWalletName,
  cryptoMethods,
  canManage = true,
  onAddWallet,
  onNotice,
}: MarketplaceWalletCardProps) {
  const [wallet, setWallet] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onNoticeRef = useRef(onNotice);
  useEffect(() => {
    onNoticeRef.current = onNotice;
  }, [onNotice]);

  const fetchWallet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const address = await getMarketplaceWallet(workspaceId);
      setWallet(address);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to load marketplace wallet",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useAsyncAction(fetchWallet, [fetchWallet]);

  const options = useMemo(() => {
    const list: { address: string; label: string }[] = [];
    const seen = new Set<string>();
    const add = (address: string, label: string) => {
      if (seen.has(address)) return;
      seen.add(address);
      list.push({ address, label: `${label} (${shortAddress(address)})` });
    };

    if (connectedAddress) {
      add(connectedAddress, connectedWalletName ?? "Connected wallet");
    }
    for (const method of cryptoMethods) {
      if (!method.detail) continue;
      add(method.detail, method.label);
    }
    if (wallet) add(wallet, "Current wallet");
    return list;
  }, [connectedAddress, connectedWalletName, cryptoMethods, wallet]);

  const handleChange = async (value: string) => {
    if (!canManage) return;
    const address = value === NONE_VALUE ? null : value;
    const previous = wallet;
    setWallet(address);
    setSaving(true);
    setError(null);
    try {
      await updateMarketplaceWallet(workspaceId, address);
      onNoticeRef.current?.(
        address ? "Marketplace receiving wallet saved." : "Marketplace wallet cleared.",
      );
    } catch (err: unknown) {
      setWallet(previous);
      setError(
        err instanceof Error ? err.message : "Failed to save marketplace wallet.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="gap-4 border-border" aria-labelledby="marketplace-wallet-title">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
            <Wallet className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Marketplace
            </p>
            <h2 id="marketplace-wallet-title" className="mt-1 text-sm font-semibold">
              Receiving wallet
            </h2>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading ? (
          <Skeleton className="h-9 w-full rounded-md" aria-busy="true" />
        ) : (
          <>
            {error ? (
              <Alert variant="destructive">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {options.length > 0 ? (
              <Select
                value={wallet ?? ""}
                onValueChange={handleChange}
                disabled={saving || !canManage}
              >
                <SelectTrigger
                  aria-label="Marketplace receiving wallet"
                  aria-busy={saving}
                >
                  <SelectValue placeholder="Select a Solana wallet" />
                </SelectTrigger>
                <SelectContent>
                  {wallet ? (
                    <SelectItem value={NONE_VALUE}>— Clear wallet —</SelectItem>
                  ) : null}
                  {options.map((option) => (
                    <SelectItem key={option.address} value={option.address}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {!wallet && (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {canManage
                    ? "No wallet assigned. Buyers see “Seller has no wallet” until you pick one."
                    : "No wallet assigned. A finance manager can set the receiving wallet."}
                  {canManage && onAddWallet ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                        onClick={onAddWallet}
                      >
                        Add a wallet method
                      </button>
                    </>
                  ) : null}
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
