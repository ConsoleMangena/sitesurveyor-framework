import { createContext } from "react";
import type { EmbeddedWallet } from "../lib/embeddedWallet";

export interface EmbeddedWalletContextValue {
  supported: boolean;
  exists: boolean;
  walletAddress: string | null;
  shortAddress: string | null;
  unlocked: boolean;
  unlockedWallet: EmbeddedWallet | null;
  loading: boolean;
  creating: boolean;
  importing: boolean;
  changingPin: boolean;
  unlocking: boolean;
  sending: boolean;
  verifyingDelete: boolean;
  deleting: boolean;
  deletePinVerified: boolean;
  failedAttempts: number;
  lockoutSeconds: number;
  error: string | null;
  balanceError: string | null;
  balances: {
    sol: number;
    solLoading: boolean;
    usdc: number;
    usdcLoading: boolean;
  };
  createWallet: (pin: string) => Promise<void>;
  importWallet: (mnemonic: string, pin: string) => Promise<void>;
  changePin: (oldPin: string, newPin: string) => Promise<void>;
  unlockWallet: (pin: string) => Promise<void>;
  lockWallet: () => void;
  sendTokens: (params: { token: "SOL" | "USDC"; recipient: string; amount: number }) => Promise<string>;
  verifyPinForDelete: (pin: string) => Promise<void>;
  deleteWallet: () => Promise<void>;
  refreshBalances: () => Promise<void>;
}

export const EmbeddedWalletContext = createContext<EmbeddedWalletContextValue | null>(
  null,
);
