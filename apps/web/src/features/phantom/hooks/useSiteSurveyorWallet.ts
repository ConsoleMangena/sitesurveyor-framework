import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { usePhantomWallet } from "./usePhantomWallet.ts";
import { CUSTOM_WALLET_NAME } from "../lib/customWalletAdapter.ts";

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
      if (adapter.wallet?.adapter.name === CUSTOM_WALLET_NAME) {
        await adapter.connect();
        return adapter.publicKey?.toBase58() ?? null;
      }
      return await legacy.connect();
    } finally {
      setConnecting(false);
    }
  }, [legacy]);

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
