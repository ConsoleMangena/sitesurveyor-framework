import { useCallback, useMemo, useState } from "react";
import { TriangleAlert, Wallet } from "lucide-react";

import PageLoader from "@/components/PageLoader.tsx";
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
  onAddWallet?: () => void;
  onNotice?: (message: string) => void;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export default function MarketplaceWalletCard({
  workspaceId,
  connectedAddress,
  connectedWalletName,
  cryptoMethods,
  onAddWallet,
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
    return list;
  }, [connectedAddress, connectedWalletName, cryptoMethods]);

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
    <section className="side-card marketplace-wallet" aria-labelledby="marketplace-wallet-title">
      <div className="side-card-head">
        <span className="side-card-mark">
          <Wallet size={17} />
        </span>
        <div>
          <p className="treasury-eyebrow">Marketplace</p>
          <h2 id="marketplace-wallet-title" className="side-card-title">
            Receiving wallet
          </h2>
        </div>
      </div>

      <div className="side-card-body">
        <p className="side-card-copy">
          Solana address that receives sale and hire payments from the marketplace.
        </p>

        {loading ? (
          <div className="marketplace-loading">
            <PageLoader compact />
          </div>
        ) : (
          <>
            <Select value={wallet ?? ""} onValueChange={handleChange} disabled={saving}>
              <SelectTrigger className="marketplace-select" aria-label="Marketplace receiving wallet">
                <SelectValue placeholder="Select a Solana wallet" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— No wallet selected —</SelectItem>
                {options.map((option) => (
                  <SelectItem key={option.address} value={option.address}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {!wallet && (
              <div className="marketplace-empty">
                <TriangleAlert size={14} />
                <span>
                  No wallet assigned. Buyers see “Seller has no wallet” until you pick
                  one.
                  {onAddWallet ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        className="marketplace-empty-action"
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
      </div>
    </section>
  );
}
