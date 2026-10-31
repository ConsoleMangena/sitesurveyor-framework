import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { Check, Download, Loader2, ShieldCheck, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import FieldError from "@/components/errors/FieldError.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PaymentMethodRow } from "../../../lib/repositories/paymentMethods.ts";
import { createPaymentMethod } from "../../../lib/repositories/paymentMethods.ts";
import { CUSTOM_WALLET_NAME } from "../lib/customWalletAdapter.ts";
import { SOLANA_CLUSTER, SOLANA_CLUSTER_LABEL } from "../lib/config.ts";
import {
  isMobileBrowser,
  MWA_WALLET_NAME,
  openMobileWallet,
} from "../lib/provider.ts";

type MethodAction = "connect" | "handoff" | "install";

interface WalletMethodOption {
  key: string;
  name: string;
  icon?: string;
  adapterName?: WalletName;
  action: MethodAction;
  installUrl?: string;
  detail: string;
}

interface WalletMethodsCardProps {
  workspaceId: string;
  paymentMethods: PaymentMethodRow[];
  canManageBilling: boolean;
  onMethodsChanged: () => Promise<void>;
  onNotice?: (message: string) => void;
}

const MWA_WALLET_NAME_TYPED = MWA_WALLET_NAME as WalletName;

const FALLBACK_METHODS = [
  {
    key: "phantom",
    name: "Phantom",
    icon: "/solanaLogoMark.svg",
    installUrl: "https://phantom.app/download",
  },
  {
    key: "solflare",
    name: "Solflare",
    icon: "/solflare.svg",
    installUrl: "https://solflare.com/download",
  },
  {
    key: "metamask",
    name: "MetaMask",
    icon: "/metamask.svg",
    installUrl: "https://metamask.io/download/",
  },
] as const;

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export default function WalletMethodsCard({
  workspaceId,
  paymentMethods,
  canManageBilling,
  onMethodsChanged,
  onNotice,
}: WalletMethodsCardProps) {
  const { wallets, select } = useWallet();
  const isMobile = isMobileBrowser();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo<WalletMethodOption[]>(() => {
    const list: WalletMethodOption[] = [];
    const seen = new Set<string>();
    const push = (option: WalletMethodOption) => {
      const key = option.key.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      list.push(option);
    };

    const mwaWallet = wallets.find((entry) => entry.adapter.name === MWA_WALLET_NAME);
    if (mwaWallet) {
      push({
        key: "wallet-app",
        name: "Wallet app",
        icon: mwaWallet.adapter.icon,
        adapterName: MWA_WALLET_NAME_TYPED,
        action: "connect",
        detail: "Installed wallet apps on this device",
      });
    }

    for (const entry of wallets) {
      const name = entry.adapter.name;
      if (name === MWA_WALLET_NAME || name === CUSTOM_WALLET_NAME) continue;
      // Phantom signs in on desktop only; mobile uses the wallet app or
      // Solflare's in-app browser, same as the auth screen.
      if (isMobile && /phantom/i.test(name)) continue;
      if (isMobile && /solflare/i.test(name)) {
        if (entry.readyState === "Installed") {
          push({
            key: "solflare",
            name,
            icon: entry.adapter.icon,
            adapterName: name,
            action: "connect",
            detail: "Detected in this browser",
          });
        } else {
          push({
            key: "solflare",
            name,
            icon: entry.adapter.icon,
            action: "handoff",
            detail: "Opens Solflare's in-app browser",
          });
        }
        continue;
      }
      if (entry.readyState !== "Installed") continue;
      push({
        key: name,
        name,
        icon: entry.adapter.icon,
        adapterName: name,
        action: "connect",
        detail: "Detected in this browser",
      });
    }

    for (const fallback of FALLBACK_METHODS) {
      if (seen.has(fallback.key)) continue;
      if (isMobile) {
        if (fallback.key !== "solflare") continue;
        push({
          key: "solflare",
          name: "Solflare",
          icon: "/solflare.svg",
          action: "handoff",
          detail: "Opens Solflare's in-app browser",
        });
        continue;
      }
      const adapter = wallets.find((entry) =>
        entry.adapter.name.toLowerCase().includes(fallback.key),
      );
      push({
        key: fallback.key,
        name: fallback.name,
        icon: adapter?.adapter.icon ?? fallback.icon,
        action: "install",
        installUrl: fallback.installUrl,
        detail: "Extension not detected",
      });
    }

    return list;
  }, [isMobile, wallets]);

  const handleMethod = async (option: WalletMethodOption) => {
    setError(null);

    if (option.action === "install") {
      if (option.installUrl) {
        window.open(option.installUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }

    if (option.action === "handoff") {
      openMobileWallet("Solflare");
      return;
    }

    const entry = wallets.find((wallet) => wallet.adapter.name === option.adapterName);
    if (!entry || !option.adapterName) {
      setError(`${option.name} isn't available in this browser.`);
      return;
    }

    setBusyKey(option.key);
    try {
      select(option.adapterName);
      if (!entry.adapter.connected) {
        await entry.adapter.connect();
      }
      const address = entry.adapter.publicKey?.toBase58();
      if (!address) {
        throw new Error(`${option.name} connected without sharing an address.`);
      }

      if (!canManageBilling) {
        onNotice?.(`${entry.adapter.name} connected. A finance manager can save it as a receiving wallet.`);
        return;
      }

      if (paymentMethods.some((method) => method.detail === address)) {
        onNotice?.(`${entry.adapter.name} is already a saved wallet method.`);
        return;
      }

      await createPaymentMethod(workspaceId, {
        type: "Crypto Wallet",
        label: entry.adapter.name,
        detail: address,
        expiry: SOLANA_CLUSTER,
        holder: null,
        is_default: paymentMethods.length === 0,
      });
      await onMethodsChanged();
      onNotice?.(`${entry.adapter.name} added as a receiving wallet.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Card id="wallet-methods" className="wallet-methods-card">
      <CardHeader className="wallet-methods-head">
        <div className="flex items-start gap-3">
          <span className="wallet-methods-mark">
            <Wallet size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="wallet-methods-eyebrow-row">
              <p className="treasury-eyebrow">Receiving wallets</p>
              <span className="treasury-cluster-chip">
                {SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER]}
              </span>
            </div>
            <CardTitle className="mt-1 text-base">Wallet methods</CardTitle>
            <CardDescription>
              The same wallets that sign you in. Connect one to receive USDC and pay
              invoices from this workspace.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="wallet-methods-body space-y-3">
        {error ? <FieldError>{error}</FieldError> : null}

        <div className="wallet-method-register">
          {options.map((option) => {
            const entry = wallets.find(
              (wallet) => wallet.adapter.name === option.adapterName,
            );
            const address = entry?.adapter.publicKey?.toBase58();
            const saved = Boolean(
              address && paymentMethods.some((method) => method.detail === address),
            );
            const connected = Boolean(entry?.adapter.connected);
            const busy = busyKey === option.key;

            const state = saved
              ? "Saved"
              : option.action === "install"
                ? "Not installed"
                : option.action === "handoff"
                  ? "In-app browser"
                  : connected
                    ? "Connected"
                    : "Available";

            return (
              <div
                key={option.key}
                className="wallet-method-row"
                data-saved={saved || undefined}
              >
                <span className="wallet-method-icon">
                  {option.icon ? (
                    <img src={option.icon} alt="" />
                  ) : (
                    <Wallet size={18} />
                  )}
                </span>
                <span className="wallet-method-copy">
                  <span className="wallet-method-name">{option.name}</span>
                  <span className="wallet-method-detail">
                    {saved && address ? shorten(address) : option.detail}
                  </span>
                </span>
                <span className="wallet-method-state">{state}</span>
                <span className="wallet-method-action">
                  {saved ? (
                    <Button variant="ghost" size="sm" disabled className="gap-1.5">
                      <Check size={14} />
                      Saved
                    </Button>
                  ) : option.action === "install" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void handleMethod(option)}
                    >
                      <Download size={14} />
                      Install
                    </Button>
                  ) : connected && !canManageBilling ? (
                    <Button variant="ghost" size="sm" disabled className="gap-1.5">
                      <Check size={14} />
                      Connected
                    </Button>
                  ) : (
                    <Button
                      variant={connected ? "default" : "outline"}
                      size="sm"
                      className="gap-1.5"
                      disabled={busyKey !== null}
                      onClick={() => void handleMethod(option)}
                    >
                      {busy ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : option.action === "handoff" ? (
                        <Wallet size={14} />
                      ) : (
                        <Check size={14} />
                      )}
                      {busy
                        ? "Connecting…"
                        : option.action === "handoff"
                          ? "Open Solflare"
                          : connected
                            ? "Save method"
                            : "Connect"}
                    </Button>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        <p className="wallet-methods-note">
          <ShieldCheck size={14} />
          {canManageBilling
            ? "SiteSurveyor saves the wallet address only — never your keys or seed phrase."
            : "You can connect a wallet to pay invoices. A finance manager saves receiving wallets."}
        </p>
      </CardContent>
    </Card>
  );
}
