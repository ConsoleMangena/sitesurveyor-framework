import { useCallback, useState } from "react";
import { TriangleAlert, Wallet } from "lucide-react";

import PageLoader from "@/components/PageLoader.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  phantomAddress: string | null;
  phantomShortAddress: string | null;
  cryptoMethods: PaymentMethodRow[];
  onNotice?: (message: string) => void;
}

export default function MarketplaceWalletCard({
  workspaceId,
  phantomAddress,
  phantomShortAddress,
  cryptoMethods,
  onNotice,
}: MarketplaceWalletCardProps) {
  const [wallet, setWallet] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchWallet = useCallback(async () => {
    setLoading(true);
    try {
      const address = await getMarketplaceWallet(workspaceId);
      setWallet(address);
    } catch (err: unknown) {
      onNotice?.(err instanceof Error ? err.message : "Failed to load marketplace wallet");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, onNotice]);

  useAsyncAction(fetchWallet, [fetchWallet]);

  const handleChange = async (value: string) => {
    const address = value || null;
    setWallet(address);
    setSaving(true);
    try {
      await updateMarketplaceWallet(workspaceId, address);
      onNotice?.(address ? "Marketplace receiving wallet saved." : "Marketplace wallet cleared.");
    } catch (err: unknown) {
      onNotice?.(err instanceof Error ? err.message : "Failed to save marketplace wallet.");
      void getMarketplaceWallet(workspaceId).then(setWallet);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="rounded-2xl border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
            <Wallet size={18} />
          </div>
          <div>
            <CardTitle className="text-base">Marketplace receiving wallet</CardTitle>
            <CardDescription>
              Solana address that receives marketplace sale and hire payments.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <PageLoader compact />
        ) : (
          <div className="space-y-3">
            <Select value={wallet ?? ""} onValueChange={handleChange} disabled={saving}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Select a Solana wallet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— No wallet selected —</SelectItem>
                {phantomAddress && (
                  <SelectItem value={phantomAddress}>
                    Phantom Wallet ({phantomShortAddress})
                  </SelectItem>
                )}
                {cryptoMethods.map((method) => (
                  <SelectItem key={method.id} value={method.detail}>
                    {method.label} ({method.detail.slice(0, 6)}…{method.detail.slice(-6)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!wallet && (
              <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                No wallet selected. Buyers will see “Seller has no wallet” until one is assigned.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
