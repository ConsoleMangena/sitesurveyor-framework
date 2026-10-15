import { useCallback, useEffect, useState } from "react";
import {
  connectWallet,
  detectProvider,
  disconnectWallet,
  getConnectedWalletAddress,
  isWalletConnected,
  subscribeWalletChanges,
} from "../lib/provider.ts";

export interface PhantomWalletState {
  /** True when the Phantom extension is installed. */
  installed: boolean;
  /** True when a wallet account is connected. */
  connected: boolean;
  /** Connected wallet address (base58), or null. */
  address: string | null;
  /** Shortened display form of the address. */
  shortAddress: string | null;
  /** True while a connect prompt is in flight. */
  connecting: boolean;
  /** Connect to Phantom (prompts the extension). */
  connect: () => Promise<string>;
  /** Disconnect the current session. */
  disconnect: () => Promise<void>;
}

/**
 * Track the injected Phantom wallet: installed/connected state, address, and
 * connect/disconnect actions. Re-renders on account changes.
 */
export function usePhantomWallet(): PhantomWalletState {
  const [installed, setInstalled] = useState<boolean>(() =>
    Boolean(detectProvider()),
  );
  const [address, setAddress] = useState<string | null>(() =>
    getConnectedWalletAddress(),
  );
  const [connecting, setConnecting] = useState(false);

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

  const shortAddress = address
    ? `${address.slice(0, 4)}…${address.slice(-4)}`
    : null;

  return {
    installed,
    connected: isWalletConnected(),
    address,
    shortAddress,
    connecting,
    connect,
    disconnect,
  };
}
