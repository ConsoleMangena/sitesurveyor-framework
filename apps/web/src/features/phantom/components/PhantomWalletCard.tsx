import { useState } from "react";
import { Check, Copy, Loader2, ExternalLink, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePhantomWallet } from "../hooks/usePhantomWallet.ts";
import { SOLANA_CLUSTER, explorerAccountUrl } from "../lib/config.ts";

/**
 * Phantom wallet connection card. Shows install state, lets the user connect
 * or disconnect, and displays the connected address with copy/explorer links.
 */
export default function PhantomWalletCard() {
  const wallet = usePhantomWallet();
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard failures
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-primary/10 text-primary">
            <Unplug size={15} />
          </div>
          <div>
            <CardTitle className="text-base">Solana Wallet</CardTitle>
            <CardDescription>
              Pay invoices and marketplace orders with your Phantom wallet.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!wallet.installed && wallet.isMobile ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">Open this page in the Phantom app to connect your wallet on Android or iOS.</p>
            <Button variant="outline" size="sm" className="gap-2" onClick={wallet.openMobile}>
              <ExternalLink size={14} /> Open in Phantom
            </Button>
          </div>
        ) : !wallet.installed ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">
              Phantom wallet is not installed. Install the browser extension to
              pay with SOL or USDC.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() =>
                window.open("https://phantom.app/download", "_blank", "noopener,noreferrer")
              }
            >
              <ExternalLink size={14} />
              Get Phantom
            </Button>
          </div>
        ) : wallet.connected && wallet.address ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Connected</span>
              <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
                {wallet.address}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => void copyAddress()}
                aria-label="Copy wallet address"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() =>
                  window.open(
                    explorerAccountUrl(wallet.address!, SOLANA_CLUSTER),
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
                aria-label="View wallet on Solana Explorer"
              >
                <ExternalLink size={14} />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void wallet.disconnect()}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              size="sm"
              className="gap-2"
              onClick={() => void wallet.connect()}
              disabled={wallet.connecting}
            >
              {wallet.connecting && (
                <Loader2 size={14} className="animate-spin" />
              )}
              Connect Phantom
            </Button>
            <p className="text-xs text-muted-foreground">
              Connect your Phantom wallet to pay invoices and marketplace
              orders on Solana.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
