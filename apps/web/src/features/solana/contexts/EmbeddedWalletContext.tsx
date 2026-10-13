/**
 * Global context for the open-source embedded Solana wallet.
 *
 * The wallet is unlocked per browser session. Any component can read the
 * current unlocked keypair and use it to sign transactions. The encrypted key
 * is persisted server-side.
 */

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useEmbeddedSolanaWallet } from "../lib/useEmbeddedSolanaWallet";
import {
  EmbeddedWalletContext,
  type EmbeddedWalletContextValue,
} from "./EmbeddedWalletContext.ts";

export type { EmbeddedWalletContextValue };

export function EmbeddedWalletProvider({ children }: { children: ReactNode }) {
  const wallet = useEmbeddedSolanaWallet();

  const createWallet = useCallback(
    async (pin: string) => {
      await wallet.createWallet(pin);
    },
    [wallet],
  );

  const importWallet = useCallback(
    async (mnemonic: string, pin: string) => {
      await wallet.importWallet(mnemonic, pin);

    },
    [wallet],
  );

  const changePin = useCallback(
    async (oldPin: string, newPin: string) => {
      await wallet.changePin(oldPin, newPin);
    },
    [wallet],
  );

  const unlockWallet = useCallback(
    async (pin: string) => {
      await wallet.unlockWallet(pin);

    },
    [wallet],
  );

  const lockWallet = useCallback(() => {
    wallet.lockWallet();
  }, [wallet]);

  const sendTokens = useCallback(
    async (params: { token: "SOL" | "USDC"; recipient: string; amount: number }) => {
      const signature = await wallet.sendTokens(params);

      return signature;
    },
    [wallet],
  );

  const verifyPinForDelete = useCallback(
    async (pin: string) => {
      await wallet.verifyPinForDelete(pin);

    },
    [wallet],
  );

  const deleteWallet = useCallback(async () => {
    await wallet.deleteWallet();
  }, [wallet]);

  const value = useMemo(
    () => ({
      ...wallet,
      error: wallet.error,
      createWallet,
      importWallet,
      changePin,
      unlockWallet,
      lockWallet,
      sendTokens,
      verifyPinForDelete,
      deleteWallet,
    }),
    [
      wallet,
      createWallet,
      importWallet,
      changePin,
      unlockWallet,
      lockWallet,
      sendTokens,
      verifyPinForDelete,
      deleteWallet,
    ],
  );

  return (
    <EmbeddedWalletContext.Provider value={value}>
      {children}
    </EmbeddedWalletContext.Provider>
  );
}

