import { useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, Loader2, WalletCards } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSiteSurveyorWallet } from "../hooks/useSiteSurveyorWallet.ts";
import { CUSTOM_WALLET_NAME, customWalletAdapter } from "../lib/customWalletAdapter.ts";
import { SOLANA_CLUSTER, explorerAccountUrl } from "../lib/config.ts";
import SolanaLogo from "./SolanaLogo.tsx";

export default function PhantomWalletCard() {
  const wallet = useSiteSurveyorWallet();
  const adapterWallet = useWallet();
  const [copied, setCopied] = useState(false);
  const [customPin, setCustomPin] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  const copyAddress = async () => {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard may be unavailable */ }
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
    } catch (error) {
      setCustomError(error instanceof Error ? error.message : "Custom wallet failed.");
    }
  };

  return (
    <Card className="mt-4 overflow-hidden border-violet-500/20 bg-gradient-to-br from-violet-500/[0.08] via-background to-cyan-500/[0.06] shadow-sm">
      <CardHeader className="border-b border-violet-500/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-primary/10 text-primary"><SolanaLogo size={22} /></div>
          <div><CardTitle className="text-base">Solana Wallet</CardTitle><CardDescription>Use Phantom or create a custom SiteSurveyor wallet.</CardDescription></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 border-b pb-4">
          <p className="text-sm font-medium">SiteSurveyor Wallet</p>
          <p className="text-xs text-muted-foreground">An app-created wallet encrypted with your PIN. The PIN and decrypted key stay in memory.</p>
          <div className="flex flex-wrap gap-2">
            <input className="h-9 min-w-[220px] flex-1 rounded-md border bg-background px-3 text-sm" type="password" placeholder="Wallet PIN" value={customPin} onChange={(event) => setCustomPin(event.target.value)} />
            <Button variant="outline" size="sm" className="gap-2" onClick={() => void unlockCustomWallet()} disabled={!customPin || wallet.connecting}><KeyRound size={14} />{customWalletAdapter.hasStoredWallet() ? "Unlock custom wallet" : "Create custom wallet"}</Button>
          </div>
          {customError && <p className="text-sm text-destructive">{customError}</p>}
        </div>
        {!wallet.installed && wallet.isMobile ? (
          <div className="flex flex-col items-start gap-2"><p className="text-sm text-muted-foreground">Open this page in the Phantom app to connect on mobile.</p><Button variant="outline" size="sm" className="gap-2" onClick={wallet.openMobile}><ExternalLink size={14} /> Open in Phantom</Button></div>
        ) : wallet.connected && wallet.address ? (
          <div className="space-y-3"><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">Connected</span><code className="rounded bg-muted px-2 py-1 font-mono text-xs">{wallet.address}</code><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void copyAddress()} aria-label="Copy wallet address">{copied ? <Check size={14} /> : <Copy size={14} />}</Button><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(explorerAccountUrl(wallet.address!, SOLANA_CLUSTER), "_blank", "noopener,noreferrer")} aria-label="View wallet on Solana Explorer"><ExternalLink size={14} /></Button></div><Button variant="outline" size="sm" onClick={() => void wallet.disconnect()}>Disconnect</Button></div>
        ) : (
          <div className="space-y-2"><Button size="sm" className="gap-2" onClick={() => void wallet.connect()} disabled={wallet.connecting}>{wallet.connecting && <Loader2 size={14} className="animate-spin" />}<WalletCards size={18} />Connect to Phantom</Button><p className="text-xs text-muted-foreground">Connect Phantom to pay invoices and marketplace orders on Solana.</p></div>
        )}
      </CardContent>
    </Card>
  );
}
