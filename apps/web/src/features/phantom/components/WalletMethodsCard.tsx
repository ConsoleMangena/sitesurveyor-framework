import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { Check, Download, Loader2, LockKeyhole, ShieldCheck, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import FieldError from "@/components/errors/FieldError.tsx";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import type { PaymentMethodRow } from "../../../lib/repositories/paymentMethods.ts";
import { createPaymentMethod } from "../../../lib/repositories/paymentMethods.ts";
import { useCustomWalletStatus } from "../hooks/useCustomWalletStatus.ts";
import {
  CUSTOM_WALLET_NAME,
  customWalletAdapter,
} from "../lib/customWalletAdapter.ts";
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
  const { wallets, select, wallet, connected } = useWallet();
  const isMobile = isMobileBrowser();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { status: customWalletStatus, refresh: refreshCustomWalletStatus } =
    useCustomWalletStatus();
  const hasStoredCustomWallet = customWalletStatus === "stored";
  const customWalletMethod = paymentMethods.find(
    (method) =>
      method.type === "Crypto Wallet" && method.label === CUSTOM_WALLET_NAME,
  );
  const customActive = wallet?.adapter.name === CUSTOM_WALLET_NAME && connected;
  const [customPin, setCustomPin] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [customBusy, setCustomBusy] = useState(false);

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
      // Phantom signs in on desktop only; on mobile the billing wallet uses
      // the wallet app or Solflare's in-app browser.
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

  const saveCustomWalletMethod = async (address: string) => {
    if (!canManageBilling) return;
    if (!paymentMethods.some((method) => method.detail === address)) {
      await createPaymentMethod(workspaceId, {
        type: "Crypto Wallet",
        label: CUSTOM_WALLET_NAME,
        detail: address,
        expiry: SOLANA_CLUSTER,
        holder: null,
        is_default: paymentMethods.length === 0,
      });
      await onMethodsChanged();
      onNotice?.(`${CUSTOM_WALLET_NAME} added as a receiving wallet.`);
      return;
    }
    onNotice?.(`${CUSTOM_WALLET_NAME} unlocked.`);
  };

  const unlockCustomWallet = async () => {
    if (!customPin) {
      setCustomError("Enter your wallet PIN.");
      return;
    }
    setCustomBusy(true);
    setCustomError(null);
    try {
      if (hasStoredCustomWallet) {
        await customWalletAdapter.unlockWallet(customPin);
      } else {
        try {
          await customWalletAdapter.createWallet(customPin);
        } catch (err: unknown) {
          if (err instanceof Error && err.message.includes("already exists")) {
            await customWalletAdapter.unlockWallet(customPin);
          } else {
            throw err;
          }
        }
      }
      select(CUSTOM_WALLET_NAME);
      const address = customWalletAdapter.publicKey?.toBase58();
      if (!address) {
        throw new Error("The wallet unlocked without an address.");
      }
      await saveCustomWalletMethod(address);
      setCustomPin("");
      setCustomDialogOpen(false);
      await refreshCustomWalletStatus();
    } catch (err: unknown) {
      setCustomError(
        err instanceof Error ? err.message : "Custom wallet failed.",
      );
      await refreshCustomWalletStatus();
    } finally {
      setCustomBusy(false);
    }
  };

  const saveActiveCustomWallet = async () => {
    const address = customWalletAdapter.publicKey?.toBase58();
    if (!address) return;
    setError(null);
    try {
      await saveCustomWalletMethod(address);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to save the wallet method.",
      );
    }
  };

  return (
    <Card id="wallet-methods" className="gap-0 border-border">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
            <Wallet className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Receiving wallets
              </p>
              <Badge variant="secondary" className="gap-1.5">
                <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                {SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER]}
              </Badge>
            </div>
            <CardTitle className="mt-1 text-base">Wallet methods</CardTitle>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {error ? <FieldError>{error}</FieldError> : null}

        <div className="overflow-hidden rounded-lg border border-border">
          {options.map((option) => {
            const entry = wallets.find(
              (wallet) => wallet.adapter.name === option.adapterName,
            );
            const address = entry?.adapter.publicKey?.toBase58();
            const savedMethod =
              paymentMethods.find((method) => method.detail === address) ??
              (address
                ? undefined
                : paymentMethods.find(
                    (method) =>
                      method.type === "Crypto Wallet" &&
                      method.label === option.name,
                  ));
            const saved = Boolean(savedMethod);
            const savedAddress = address ?? savedMethod?.detail ?? null;
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
                className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
                data-saved={saved || undefined}
              >
                <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted text-muted-foreground">
                  {option.icon ? (
                    <img src={option.icon} alt="" className="size-5 object-contain" />
                  ) : (
                    <Wallet className="h-4 w-4" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{option.name}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {saved && savedAddress ? shorten(savedAddress) : option.detail}
                  </span>
                </span>
                <span
                  className={
                    saved
                      ? "text-xs font-semibold uppercase tracking-wider text-success"
                      : "text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  }
                >
                  {state}
                </span>
                <span className="ml-auto shrink-0">
                  {saved && connected ? (
                    <Button variant="ghost" size="sm" disabled className="gap-1.5">
                      <Check className="h-4 w-4" />
                      Saved
                    </Button>
                  ) : option.action === "install" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => void handleMethod(option)}
                    >
                      <Download className="h-4 w-4" />
                      Install
                    </Button>
                  ) : saved ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled={busyKey !== null}
                      onClick={() => void handleMethod(option)}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wallet className="h-4 w-4" />
                      )}
                      {busy ? "Connecting…" : "Connect"}
                    </Button>
                  ) : connected && !canManageBilling ? (
                    <Button variant="ghost" size="sm" disabled className="gap-1.5">
                      <Check className="h-4 w-4" />
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
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : option.action === "handoff" ? (
                        <Wallet className="h-4 w-4" />
                      ) : (
                        <Check className="h-4 w-4" />
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

          <div
            className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
            data-saved={customWalletMethod || customActive || undefined}
          >
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
              <img src="/logo.svg" alt="" className="size-5 object-contain" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">{CUSTOM_WALLET_NAME}</span>
              <span className="truncate font-mono text-xs text-muted-foreground">
                {customWalletMethod?.detail
                  ? shorten(customWalletMethod.detail)
                  : customActive
                    ? "Unlocked on this device"
                    : hasStoredCustomWallet
                      ? "Encrypted on this device"
                      : "Built-in app wallet"}
              </span>
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {customActive
                ? "Connected"
                : customWalletMethod
                  ? "Saved"
                  : hasStoredCustomWallet
                    ? "Locked"
                    : "Not created"}
            </span>
            <span className="ml-auto shrink-0">
              {customActive ? (
                customWalletMethod || !canManageBilling ? (
                  <Button variant="ghost" size="sm" disabled className="gap-1.5">
                    <Check className="h-4 w-4" />
                    {customWalletMethod ? "Saved" : "Connected"}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void saveActiveCustomWallet()}
                  >
                    <Check className="h-4 w-4" />
                    Save method
                  </Button>
                )
              ) : hasStoredCustomWallet || canManageBilling ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setCustomError(null);
                    setCustomDialogOpen(true);
                  }}
                >
                  <LockKeyhole className="h-4 w-4" />
                  {hasStoredCustomWallet ? "Unlock" : "Create"}
                </Button>
              ) : null}
            </span>
          </div>
        </div>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          {canManageBilling
            ? "SiteSurveyor saves the wallet address only — never your keys or seed phrase."
            : "You can connect a wallet to pay invoices. A finance manager saves receiving wallets."}
        </p>
      </CardContent>

      <DialogTemplate
        open={customDialogOpen}
        onOpenChange={setCustomDialogOpen}
        title={
          hasStoredCustomWallet
            ? "Unlock SiteSurveyor Wallet"
            : "Create SiteSurveyor Wallet"
        }
        description="Use a strong PIN to protect this wallet on the current device."
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setCustomDialogOpen(false)}
              disabled={customBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void unlockCustomWallet()}
              disabled={!customPin || customBusy}
              className="gap-2"
            >
              {customBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LockKeyhole className="h-4 w-4" />
              )}
              {hasStoredCustomWallet ? "Unlock" : "Create wallet"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            autoFocus
            type="password"
            placeholder="Wallet PIN"
            value={customPin}
            onChange={(event) => setCustomPin(event.target.value)}
          />
          {customError ? <FieldError>{customError}</FieldError> : null}
        </div>
      </DialogTemplate>
    </Card>
  );
}
