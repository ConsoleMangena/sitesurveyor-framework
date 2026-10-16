import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { usePhantomWallet } from "./usePhantomWallet.ts";

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
      await adapter.connect();
      return adapter.publicKey?.toBase58() ?? null;
    } finally {
      setConnecting(false);
    }
  }, [adapter]);

  return {
    ...adapter,
    installed: legacy.installed,
    isMobile: legacy.isMobile,
    address: adapter.publicKey?.toBase58() ?? legacy.address,
    shortAddress: adapter.publicKey
      ? `${adapter.publicKey.toBase58().slice(0, 4)}…${adapter.publicKey.toBase58().slice(-4)}`
      : legacy.shortAddress,
    connecting: connecting || adapter.connecting,
    connect,
    openMobile: legacy.openMobile,
  };
}
