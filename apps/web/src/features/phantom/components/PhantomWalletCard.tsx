import { useCallback, useState } from "react";
import {
  Check,
  KeyRound,
  Loader2,
  LockKeyhole,
  WalletCards,
} from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import type { WalletName } from "@solana/wallet-adapter-base";
import { openMobileWallet } from "../lib/provider.ts";
import { Button } from "@/components/ui/button";
import FieldError from "@/components/errors/FieldError.tsx";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import { useCustomWalletStatus } from "../hooks/useCustomWalletStatus.ts";
import { CUSTOM_WALLET_NAME, customWalletAdapter } from "../lib/customWalletAdapter.ts";
import { SOLANA_CLUSTER } from "../lib/config.ts";
import SolanaLogo from "./SolanaLogo.tsx";
import {
  createPaymentMethod,
  type PaymentMethodRow,
} from "../../../lib/repositories/paymentMethods.ts";

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

interface PhantomWalletCardProps {
  workspaceId: string;
  paymentMethods: PaymentMethodRow[];
  canManageBilling: boolean;
  onMethodsChanged: () => Promise<void>;
  onNotice?: (message: string) => void;
}

export default function PhantomWalletCard({
  workspaceId,
  paymentMethods,
  canManageBilling,
  onMethodsChanged,
  onNotice,
}: PhantomWalletCardProps) {
  const adapterWallet = useWallet();
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const [customPin, setCustomPin] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [walletBusy, setWalletBusy] = useState<string | null>(null);
  const { status: customWalletStatus, refresh: refreshCustomWalletStatus } = useCustomWalletStatus();
  const hasStoredWallet = customWalletStatus === "stored";

  const saveWalletMethod = useCallback(async (address: string, label: string) => {
    if (!canManageBilling || paymentMethods.some((method) => method.detail === address)) return;
    await createPaymentMethod(workspaceId, {
      type: "Crypto Wallet",
      label,
      detail: address,
      expiry: SOLANA_CLUSTER,
      holder: null,
      is_default: paymentMethods.length === 0,
    });
    await onMethodsChanged();
    onNotice?.(`${label} was added as a blockchain wallet method.`);
  }, [canManageBilling, onMethodsChanged, onNotice, paymentMethods, workspaceId]);

  const connectAdapter = async (name: WalletName) => {
    if (isMobile && /phantom|solflare/i.test(name)) {
      openMobileWallet(/solflare/i.test(name) ? "Solflare" : "Phantom");
      return;
    }
    const selected = adapterWallet.wallets.find((entry) => entry.adapter.name === name);
    if (!selected) {
      if (isMobile && /phantom|solflare/i.test(name)) openMobileWallet(/solflare/i.test(name) ? "Solflare" : "Phantom");
      return;
    }
    setWalletBusy(name);
    try {
      adapterWallet.select(name);
      if (!selected.adapter.connected) await selected.adapter.connect();
      const address = selected.adapter.publicKey?.toBase58();
      if (address) await saveWalletMethod(address, selected.adapter.name);
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : "Failed to connect wallet.");
    } finally {
      setWalletBusy(null);
    }
  };

  const unlockCustomWallet = async () => {
    try {
      setCustomError(null);
      if (hasStoredWallet) {
        await customWalletAdapter.unlockWallet(customPin);
      } else {
        try {
          await customWalletAdapter.createWallet(customPin);
        } catch (error) {
          if (error instanceof Error && error.message.includes("already exists")) {
            await customWalletAdapter.unlockWallet(customPin);
          } else {
            throw error;
          }
        }
      }
      adapterWallet.select(CUSTOM_WALLET_NAME);
      const address = customWalletAdapter.publicKey?.toBase58();
      if (address) await saveWalletMethod(address, "SiteSurveyor Wallet");
      setCustomPin("");
      setCustomDialogOpen(false);
      await refreshCustomWalletStatus();
    } catch (error) {
      setCustomError(error instanceof Error ? error.message : "Custom wallet failed.");
      await refreshCustomWalletStatus();
    }
  };

  const availableWallets = adapterWallet.wallets.filter(
    (entry) => entry.readyState === "Installed" || entry.adapter.name === CUSTOM_WALLET_NAME || (isMobile && /phantom|solflare/i.test(entry.adapter.name)),
  );

  return (
    <Card className="mt-4 rounded-2xl border-border/60 bg-card text-foreground">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted text-muted-foreground"><SolanaLogo size={22} /></div>
            <div><CardTitle className="text-base">Blockchain wallet methods</CardTitle><CardDescription>Use any wallet available on the login screen, or create the app wallet.</CardDescription></div>
          </div>
          <span className="rounded-full border border-border/60 bg-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{SOLANA_CLUSTER}</span>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        <div className="grid max-w-4xl gap-3 md:grid-cols-2">
          {availableWallets.map((entry) => {
            const address = entry.adapter.publicKey?.toBase58();
            const saved = address && paymentMethods.some((method) => method.detail === address);
            return (
              <div key={entry.adapter.name} className="rounded-2xl border border-violet-500/30 bg-card p-3 sm:p-4">
                <div className="flex items-center gap-3">
                  {entry.adapter.icon ? <img src={entry.adapter.icon} alt="" className="h-10 w-10 rounded-xl" /> : <WalletCards size={22} />}
                  <div className="min-w-0"><p className="font-semibold truncate">{entry.adapter.name}</p><p className="text-xs text-muted-foreground">{entry.adapter.connected ? "Connected" : "Available"}</p></div>
                </div>
                {entry.adapter.connected && address ? <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2"><code className="truncate text-xs font-medium">{shortenAddress(address)}</code><span className="text-xs text-emerald-600">Connected</span></div> : null}
                {canManageBilling && <Button variant="outline" size="sm" className="mt-3 w-full gap-2" onClick={() => void connectAdapter(entry.adapter.name)} disabled={walletBusy !== null}>{walletBusy === entry.adapter.name && <Loader2 size={14} className="animate-spin" />}{saved ? <Check size={14} /> : <WalletCards size={14} />}{saved ? "Selected wallet method" : entry.adapter.connected ? "Use this wallet" : "Connect and add wallet"}</Button>}
              </div>
            );
          })}
          <div className="rounded-2xl border border-cyan-500/30 bg-card p-3 sm:p-4">
            <div className="flex items-center gap-3"><img src="/logo.svg" alt="SiteSurveyor" className="h-10 w-10 rounded-xl object-contain" /><div><p className="font-semibold">SiteSurveyor Wallet</p><p className="text-xs text-muted-foreground">App-managed wallet</p></div></div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Encrypted locally and available as a selectable blockchain payment method.</p>
            {canManageBilling && <Button variant="outline" size="sm" className="mt-4 w-full gap-2" onClick={() => { setCustomError(null); setCustomDialogOpen(true); }}><LockKeyhole size={15} />{hasStoredWallet ? "Unlock and use wallet" : "Create and use wallet"}</Button>}
          </div>
        </div>
        {!canManageBilling && <p className="mt-4 text-xs text-muted-foreground">Only workspace finance managers can add or change blockchain wallet methods.</p>}
        <div className="mt-3 flex max-w-3xl items-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"><KeyRound size={14} />Your PIN never leaves this device and is not stored by SiteSurveyor.</div>
      </CardContent>
      <DialogTemplate open={customDialogOpen} onOpenChange={setCustomDialogOpen} title={hasStoredWallet ? "Unlock SiteSurveyor Wallet" : "Create SiteSurveyor Wallet"} description="Use a strong PIN to protect this wallet on the current device." size="sm" footer={<><Button variant="outline" onClick={() => setCustomDialogOpen(false)}>Cancel</Button><Button onClick={() => void unlockCustomWallet()} disabled={!customPin} className="gap-2"><LockKeyhole size={15} />{hasStoredWallet ? "Unlock" : "Create wallet"}</Button></>}>
        <div className="space-y-3"><Input autoFocus type="password" placeholder="Wallet PIN" value={customPin} onChange={(event) => setCustomPin(event.target.value)} />{customError ? <FieldError>{customError}</FieldError> : null}</div>
      </DialogTemplate>
    </Card>
  );
}
