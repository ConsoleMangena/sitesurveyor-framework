/**
 * React hook for the externally-connected Solana wallet (Phantom/Solflare).
 *
 * Keeps UI state in sync with the injected wallet and exposes the current
 * address, SOL/USDC balances, and explicit connect/disconnect actions.
 */

import { useCallback, useEffect, useState } from "react";
import { useAsyncAction } from "../../../hooks/useAsyncAction.ts";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  connectWallet,
  detectProvider,
  disconnectWallet,
  getConnectedWalletAddress,
  isWalletConnected,
  subscribeWalletChanges,
  waitForProvider,
  type SolanaWalletProvider,
} from "./provider";
import { getConnection } from "../payments/solanaPay";
import {
  SOLANA_USDC_MINT,
  USDC_DECIMALS,
} from "./config";

// Well-known program IDs.
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

function getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return address;
}

export interface WalletBalances {
  sol: number;
  solLoading: boolean;
  usdc: number;
  usdcLoading: boolean;
}

export interface UseSolanaWalletResult {
  provider: SolanaWalletProvider | null;
  installed: boolean;
  connected: boolean;
  walletAddress: string | null;
  shortAddress: string | null;
  connecting: boolean;
  disconnecting: boolean;
  balances: WalletBalances;
  error: string | null;
  connect: () => Promise<string>;
  disconnect: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  refreshInstalled: () => Promise<void>;
}

export function useSolanaWallet(): UseSolanaWalletResult {
  const [provider, setProvider] = useState<SolanaWalletProvider | null>(null);
  const [installed, setInstalled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<WalletBalances>({
    sol: 0,
    solLoading: false,
    usdc: 0,
    usdcLoading: false,
  });

  const refreshInstalled = useCallback(async () => {
    const p = await waitForProvider();
    setProvider(p);
    setInstalled(Boolean(p));
    setConnected(isWalletConnected());
    setWalletAddress(getConnectedWalletAddress());
  }, []);

  const refreshState = useCallback(() => {
    const currentProvider = detectProvider();
    setProvider(currentProvider);
    setInstalled(Boolean(currentProvider));
    setConnected(isWalletConnected());
    setWalletAddress(getConnectedWalletAddress());
  }, []);

  useEffect(() => {
    let mounted = true;
    void waitForProvider().then(() => {
      if (!mounted) return;
      refreshInstalled();
    });
    const unsubscribe = subscribeWalletChanges(refreshState);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [refreshState, refreshInstalled]);

  const refreshBalances = useCallback(async () => {
    const address = getConnectedWalletAddress();
    if (!address) {
      setBalances((b) => ({
        ...b,
        sol: 0,
        usdc: 0,
        solLoading: false,
        usdcLoading: false,
      }));
      return;
    }

    setBalances((b) => ({ ...b, solLoading: true, usdcLoading: true }));
    const owner = new PublicKey(address);
    const conn = getConnection();

    try {
      const lamports = await conn.getBalance(owner, "confirmed");
      const sol = lamports / LAMPORTS_PER_SOL;

      try {
        const mint = new PublicKey(SOLANA_USDC_MINT);
        const ata = getAssociatedTokenAddress(mint, owner);
        const accountInfo = await conn.getAccountInfo(ata, "confirmed");
        if (!accountInfo) {
          setBalances({ sol, solLoading: false, usdc: 0, usdcLoading: false });
          return;
        }
        const tokenBalance = await conn.getTokenAccountBalance(ata, "confirmed");
        const usdc =
          Number(tokenBalance.value.amount) / 10 ** USDC_DECIMALS;
        setBalances({
          sol,
          solLoading: false,
          usdc,
          usdcLoading: false,
        });
      } catch {
        setBalances({ sol, solLoading: false, usdc: 0, usdcLoading: false });
      }
    } catch {
      setBalances((b) => ({
        ...b,
        solLoading: false,
        usdcLoading: false,
      }));
    }
  }, []);

  useAsyncAction(refreshBalances, [walletAddress, refreshBalances]);

  // Poll balances every 15s while connected.
  useEffect(() => {
    if (!connected) return;
    const id = window.setInterval(() => void refreshBalances(), 15000);
    return () => window.clearInterval(id);
  }, [connected, refreshBalances]);

  const connect = useCallback(async (): Promise<string> => {
    setError(null);
    setConnecting(true);
    try {
      const { walletAddress: addr } = await connectWallet();
      setConnected(true);
      setWalletAddress(addr);
      await refreshBalances();
      return addr;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setConnecting(false);
    }
  }, [refreshBalances]);

  const disconnect = useCallback(async () => {
    setError(null);
    setDisconnecting(true);
    try {
      await disconnectWallet();
      setConnected(false);
      setWalletAddress(null);
      setBalances({ sol: 0, solLoading: false, usdc: 0, usdcLoading: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setDisconnecting(false);
    }
  }, []);

  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-6)}`
    : null;

  return {
    provider,
    installed,
    connected,
    walletAddress,
    shortAddress,
    connecting,
    disconnecting,
    balances,
    error,
    connect,
    disconnect,
    refreshBalances,
    refreshInstalled,
  };
}
