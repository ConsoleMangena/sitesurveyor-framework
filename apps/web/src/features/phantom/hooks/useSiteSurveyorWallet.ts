import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { usePhantomWallet } from "./usePhantomWallet.ts";
import { CUSTOM_WALLET_NAME } from "../lib/customWalletAdapter.ts";
import { detectProvider } from "../lib/provider.ts";

export function useSiteSurveyorWallet() {
  const adapter = useWallet();
  const legacy = usePhantomWallet();
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (adapter.publicKey) return;
    if (legacy.address) return;
  }, [adapter.publicKey, legacy.address]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      // Custom wallet: use the wallet-adapter path (requires unlock first)
      if (adapter.wallet?.adapter.name === CUSTOM_WALLET_NAME) {
        await adapter.connect();
        return adapter.publicKey?.toBase58() ?? null;
      }

      // Non-custom wallet: use legacy injected-provider path,
      // but ALSO select it in the wallet-adapter context so that
      // `adapter.sendTransaction`, `adapter.publicKey`, etc. are populated.
      const walletAddress = await legacy.connect();

      // After legacy connects, the injected provider (e.g. Phantom) is approved.
      // Find the matching wallet-adapter entry and select+connect it so the
      // adapter context reflects the active wallet. This makes
      // `adapter.sendTransaction` and `adapter.publicKey` available to callers.
      const provider = detectProvider();
      if (provider && adapter.wallets) {
        // Match by the wallet-adapter's known names. Phantom and Solflare
        // adapters have distinct names; the injected provider exposes `isPhantom`.
        const isPhantomProvider = provider.isPhantom === true;
        const matched = adapter.wallets.find((w) => {
          if (w.adapter.name === CUSTOM_WALLET_NAME) return false;
          if (w.readyState !== "Installed") return false;
          if (isPhantomProvider) return /phantom/i.test(w.adapter.name);
          // Default to first installed non-custom wallet (e.g. Solflare)
          return true;
        });
        if (matched) {
          adapter.select(matched.adapter.name);
          if (!matched.adapter.connected) {
            await matched.adapter.connect();
          }
        }
      }

      return walletAddress;
    } finally {
      setConnecting(false);
    }
  }, [adapter, legacy]);

  const disconnect = useCallback(async () => {
    await legacy.disconnect();
    if (adapter.connected) {
      await adapter.disconnect();
    }
  }, [adapter, legacy]);

  return {
    ...adapter,
    installed: legacy.installed,
    isMobile: legacy.isMobile,
    connected: adapter.connected || legacy.connected,
    address: adapter.publicKey?.toBase58() ?? legacy.address,
    shortAddress: adapter.publicKey
      ? `${adapter.publicKey.toBase58().slice(0, 4)}…${adapter.publicKey.toBase58().slice(-4)}`
      : legacy.shortAddress,
    connecting: connecting || adapter.connecting || legacy.connecting,
    connect,
    disconnect,
    openMobile: legacy.openMobile,
  };
}
