import { useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  LockKeyhole,
  WalletCards,
} from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import { useSiteSurveyorWallet } from "../hooks/useSiteSurveyorWallet.ts";
import { CUSTOM_WALLET_NAME, customWalletAdapter } from "../lib/customWalletAdapter.ts";
import { SOLANA_CLUSTER, explorerAccountUrl } from "../lib/config.ts";
import SolanaLogo from "./SolanaLogo.tsx";

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export default function PhantomWalletCard() {
  const wallet = useSiteSurveyorWallet();
  const adapterWallet = useWallet();
  const [copied, setCopied] = useState(false);
  const [customPin, setCustomPin] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);

  const copyAddress = async () => {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access may be unavailable in desktop shells.
    }
  };

  const unlockCustomWallet = async () => {
    try {
      setCustomError(null);
      if (customWalletAdapter.hasStoredWallet()) {
        await customWalletAdapter.unlockWallet(customPin);
      } else {
        await customWalletAdapter.createWallet(customPin);
      }
      adapterWallet.select(CUSTOM_WALLET_NAME);
      setCustomPin("");
      setCustomDialogOpen(false);
    } catch (error) {
      setCustomError(error instanceof Error ? error.message : "Custom wallet failed.");
    }
  };

  return (
    <Card className="mt-4 max-w-4xl overflow-hidden border-slate-200 bg-slate-50 shadow-sm dark:border-slate-700 dark:bg-slate-50">
      <CardHeader className="border-b border-slate-200 bg-white pb-4 text-slate-900 dark:border-slate-200 dark:bg-white dark:text-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-100 dark:text-slate-700">
              <SolanaLogo size={22} />
            </div>
            <div>
              <CardTitle className="text-base">Wallet methods</CardTitle>
              <CardDescription className="text-slate-600">Choose how you connect and settle Solana payments.</CardDescription>
            </div>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            {SOLANA_CLUSTER}
          </span>
        </div>
      </CardHeader>

      <CardContent className="bg-slate-50 p-3 text-slate-900 sm:p-4">
        <div className="grid max-w-3xl gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-violet-200 bg-white p-3 text-slate-900 shadow-sm sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300">
                  <WalletCards size={20} />
                </div>
                <div>
                  <p className="font-semibold">Phantom</p>
                  <p className="text-xs text-slate-600">External wallet</p>
                </div>
              </div>
              <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-950/70 dark:text-violet-300">
                {wallet.connected ? "Connected" : "Available"}
              </span>
            </div>

            {wallet.connected && wallet.address ? (
              <>
                <div className="mt-5 flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  <code className="truncate text-xs font-medium">{shortenAddress(wallet.address)}</code>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void copyAddress()} aria-label="Copy Phantom wallet address">
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(explorerAccountUrl(wallet.address!, SOLANA_CLUSTER), "_blank", "noopener,noreferrer")} aria-label="View Phantom wallet on Solana Explorer">
                      <ExternalLink size={14} />
                    </Button>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => void wallet.disconnect()}>
                  Disconnect Phantom
                </Button>
              </>
            ) : wallet.installed || !wallet.isMobile ? (
              <>
                <p className="text-xs leading-relaxed text-slate-600">Connect Phantom to pay invoices with USDC directly from your external wallet.</p>
                <Button size="sm" className="mt-4 w-full gap-2" onClick={() => void wallet.connect()} disabled={wallet.connecting}>
                  {wallet.connecting && <Loader2 size={14} className="animate-spin" />}
                  <WalletCards size={16} />
                  Connect Phantom
                </Button>
              </>
            ) : (
              <>
                <p className="mt-5 text-xs leading-relaxed text-slate-600">Open this page in the Phantom app to connect on mobile.</p>
                <Button variant="outline" size="sm" className="mt-4 w-full gap-2" onClick={wallet.openMobile}>
                  <ExternalLink size={14} /> Open Phantom
                </Button>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-cyan-200 bg-white p-3 text-slate-900 shadow-sm sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-100">
                  <img src="/logo.svg" alt="SiteSurveyor" className="h-7 w-7 object-contain" />
                </div>
                <div>
                  <p className="font-semibold">SiteSurveyor Wallet</p>
                  <p className="text-xs text-muted-foreground">App-managed wallet</p>
                </div>
              </div>
              <span className="rounded-full bg-cyan-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-700">
                {customWalletAdapter.hasStoredWallet() ? "Secured" : "Not set up"}
              </span>
            </div>

            <p className="mt-5 text-xs leading-relaxed text-slate-600">Encrypted locally and unlocked only when you approve a payment.</p>
            <Button variant="outline" size="sm" className="mt-4 w-full gap-2" onClick={() => { setCustomError(null); setCustomDialogOpen(true); }}>
              <LockKeyhole size={15} />
              {customWalletAdapter.hasStoredWallet() ? "Unlock wallet" : "Create wallet"}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex max-w-3xl items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <KeyRound size={14} className="shrink-0 text-slate-500" />
          Your PIN never leaves this device and is not stored by SiteSurveyor.
        </div>
      </CardContent>

      <DialogTemplate
        open={customDialogOpen}
        onOpenChange={setCustomDialogOpen}
        title={customWalletAdapter.hasStoredWallet() ? "Unlock SiteSurveyor Wallet" : "Create SiteSurveyor Wallet"}
        description="Use a strong PIN to protect this wallet on the current device."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCustomDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void unlockCustomWallet()} disabled={!customPin} className="gap-2">
              <LockKeyhole size={15} />
              {customWalletAdapter.hasStoredWallet() ? "Unlock" : "Create wallet"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            autoFocus
            type="password"
            inputMode="numeric"
            placeholder="Wallet PIN"
            value={customPin}
            onChange={(event) => setCustomPin(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && customPin) void unlockCustomWallet(); }}
          />
          {customError && <p className="text-sm text-destructive">{customError}</p>}
        </div>
      </DialogTemplate>
    </Card>
  );
}
