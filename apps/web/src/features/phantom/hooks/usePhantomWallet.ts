import { useCallback, useEffect, useState } from "react";
import {
  connectWallet,
  detectProvider,
  disconnectWallet,
  getConnectedWalletAddress,
  isWalletConnected,
  isMobileBrowser,
  openMobileWallet,
  type MobileWalletName,
  subscribeWalletChanges,
} from "../lib/provider.ts";

export interface PhantomWalletState {
  installed: boolean;
  isMobile: boolean;
  connected: boolean;
  address: string | null;
  shortAddress: string | null;
  connecting: boolean;
  connect: () => Promise<string>;
  openMobile: () => void;
  disconnect: () => Promise<void>;
}

export function usePhantomWallet(): PhantomWalletState {
  const [installed, setInstalled] = useState<boolean>(() => Boolean(detectProvider()));
  const [address, setAddress] = useState<string | null>(() => getConnectedWalletAddress());
  const [connecting, setConnecting] = useState(false);
  const isMobile = isMobileBrowser();

  useEffect(() => {
    return subscribeWalletChanges(() => {
      setInstalled(Boolean(detectProvider()));
      setAddress(getConnectedWalletAddress());
    });
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const { walletAddress } = await connectWallet();
      setAddress(walletAddress);
      return walletAddress;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectWallet();
    setAddress(null);
  }, []);

  return {
    installed,
    isMobile,
    connected: isWalletConnected(),
    address,
    shortAddress: address ? `${address.slice(0, 4)}…${address.slice(-4)}` : null,
    connecting,
    connect,
  openMobile: (name: MobileWalletName = "Phantom") => openMobileWallet(name),
    disconnect,
  };
}
