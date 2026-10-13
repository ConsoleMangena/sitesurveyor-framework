/**
 * React hook for the open-source embedded Solana wallet.
 *
 * The wallet keypair is decrypted in browser memory only while the wallet is
 * unlocked. The encrypted payload is fetched from / saved to Supabase. The
 * wallet stays unlocked for the browser session until the user explicitly
 * locks it. To survive page reloads and provider remounts, the unlocked wallet
 * snapshot is also kept in sessionStorage for the current browser session and
 * cleared on lock, delete, or sign-out.
 */

import { useCallback, useEffect, useState } from "react";
import { useAsyncAction } from "../../../hooks/useAsyncAction.ts";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  base64ToBuffer,
  bufferToBase64,
  changeEncryptedWalletPin,
  createEncryptedWallet,
  decryptEmbeddedWallet,
  importEncryptedWalletFromMnemonic,
  isEmbeddedWalletSupported,
  type EmbeddedWallet,
} from "./embeddedWallet";
import {
  loadEmbeddedWallet,
  saveEmbeddedWallet,
  deleteEmbeddedWallet,
} from "../../../lib/repositories/embeddedWallets";
import { getConnection, sendTokens } from "../payments/solanaPay";
import { saveWalletActivity } from "./walletHistory";
import {
  SOLANA_CLUSTER,
  SOLANA_RPC_URL,
  SOLANA_USDC_MINT,
  USDC_DECIMALS,
} from "./config";
import {
  isTauri,
  tauriGetBalance,
  tauriGetAccountInfo,
  tauriGetTokenAccountBalance,
} from "./tauriRpc";

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

/** Number of failed unlock attempts before temporary lockout. */
const MAX_FAILED_ATTEMPTS = 3;
/** Base lockout duration in milliseconds. Doubles on each consecutive failure. */
const LOCKOUT_BASE_MS = 30_000;

const SESSION_WALLET_KEY = "sitesurveyor:embedded-wallet:session";

/** Lock the wallet after this many milliseconds of user inactivity. */
const INACTIVITY_LOCK_MS = 5 * 60 * 1000;

interface SessionWalletSnapshot {
  walletAddress: string;
  secretKeyBase64: string;
  mnemonic?: string;
}

function saveSessionWallet(wallet: EmbeddedWallet): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const snapshot: SessionWalletSnapshot = {
      walletAddress: wallet.walletAddress,
      secretKeyBase64: bufferToBase64(wallet.keypair.secretKey),
      mnemonic: wallet.mnemonic,
    };
    sessionStorage.setItem(SESSION_WALLET_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage errors (e.g. private mode).
  }
}

function loadSessionWallet(expectedAddress?: string | null): EmbeddedWallet | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_WALLET_KEY);
    if (!raw) return null;
    const snapshot: SessionWalletSnapshot = JSON.parse(raw);
    if (!snapshot.walletAddress || !snapshot.secretKeyBase64) return null;
    if (expectedAddress && snapshot.walletAddress !== expectedAddress) return null;
    const secretKey = base64ToBuffer(snapshot.secretKeyBase64);
    const keypair = Keypair.fromSecretKey(secretKey);
    if (keypair.publicKey.toBase58() !== snapshot.walletAddress) return null;
    return {
      publicKey: keypair.publicKey,
      keypair,
      walletAddress: snapshot.walletAddress,
      mnemonic: snapshot.mnemonic,
    };
  } catch {
    return null;
  }
}

function clearSessionWallet(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_WALLET_KEY);
  } catch {
    // Ignore storage errors.
  }
}

function getAssociatedTokenAddress(mint: PublicKey, owner: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return address;
}

export interface EmbeddedWalletBalances {
  sol: number;
  solLoading: boolean;
  usdc: number;
  usdcLoading: boolean;
}

export interface UseEmbeddedSolanaWalletResult {
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
  balances: EmbeddedWalletBalances;
  error: string | null;
  balanceError: string | null;
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

export function useEmbeddedSolanaWallet(): UseEmbeddedSolanaWalletResult {
  const [supported] = useState(() => isEmbeddedWalletSupported());
  const [exists, setExists] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [unlockedWallet, setUnlockedWallet] = useState<EmbeddedWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [changingPin, setChangingPin] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifyingDelete, setVerifyingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePinVerified, setDeletePinVerified] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<EmbeddedWalletBalances>({
    sol: 0,
    solLoading: false,
    usdc: 0,
    usdcLoading: false,
  });
  const [balanceError, setBalanceError] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stored = await loadEmbeddedWallet();
      if (stored) {
        setExists(true);
        setWalletAddress(stored.walletAddress);
        // Restore an unlocked session wallet so the user does not have to
        // re-enter their PIN after a page reload or provider remount.
        const sessionWallet = loadSessionWallet(stored.walletAddress);
        if (sessionWallet) {
          setUnlockedWallet(sessionWallet);
        }
      } else {
        setExists(false);
        setWalletAddress(null);
        setUnlockedWallet(null);
        clearSessionWallet();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useAsyncAction(loadWallet, [loadWallet]);

  const refreshBalances = useCallback(async () => {
    const address = unlockedWallet?.walletAddress ?? walletAddress;
    if (!address) {
      setBalances({ sol: 0, solLoading: false, usdc: 0, usdcLoading: false });
      setBalanceError(null);
      return;
    }

    setBalances((b) => ({ ...b, solLoading: true, usdcLoading: true }));
    setBalanceError(null);

    if (isTauri()) {
      try {
        const sol = await tauriGetBalance(address);

        try {
          const mint = new PublicKey(SOLANA_USDC_MINT);
          const owner = new PublicKey(address);
          const ata = getAssociatedTokenAddress(mint, owner);
          const { exists } = await tauriGetAccountInfo(ata.toBase58());
          if (!exists) {
            setBalances({ sol, solLoading: false, usdc: 0, usdcLoading: false });
            return;
          }
          const tokenBalance = await tauriGetTokenAccountBalance(ata.toBase58());
          const usdc = Number(tokenBalance.amount) / 10 ** USDC_DECIMALS;
          setBalances({ sol, solLoading: false, usdc, usdcLoading: false });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[embedded-wallet] Failed to fetch USDC balance:", msg, {
            address,
            mint: SOLANA_USDC_MINT,
            rpcUrl: SOLANA_RPC_URL,
          });
          setBalanceError(`USDC balance unavailable: ${msg}`);
          setBalances({ sol, solLoading: false, usdc: 0, usdcLoading: false });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[embedded-wallet] Failed to fetch SOL balance:", msg, {
          address,
          rpcUrl: SOLANA_RPC_URL,
        });
        setBalanceError(`SOL balance unavailable: ${msg}`);
        setBalances((b) => ({
          ...b,
          solLoading: false,
          usdcLoading: false,
        }));
      }
      return;
    }

    const owner = new PublicKey(address);
    let conn: Connection;
    try {
      conn = getConnection();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[embedded-wallet] Failed to create Solana connection:", msg, { rpcUrl: SOLANA_RPC_URL });
      setBalanceError(`Solana connection failed: ${msg}`);
      setBalances((b) => ({ ...b, solLoading: false, usdcLoading: false }));
      return;
    }

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
        const usdc = Number(tokenBalance.value.amount) / 10 ** USDC_DECIMALS;
        setBalances({ sol, solLoading: false, usdc, usdcLoading: false });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[embedded-wallet] Failed to fetch USDC balance:", msg, {
          address,
          mint: SOLANA_USDC_MINT,
          rpcUrl: SOLANA_RPC_URL,
        });
        setBalanceError(`USDC balance unavailable: ${msg}`);
        setBalances({ sol, solLoading: false, usdc: 0, usdcLoading: false });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[embedded-wallet] Failed to fetch SOL balance:", msg, {
        address,
        rpcUrl: SOLANA_RPC_URL,
      });
      setBalanceError(`SOL balance unavailable: ${msg}`);
      setBalances((b) => ({
        ...b,
        solLoading: false,
        usdcLoading: false,
      }));
    }
  }, [unlockedWallet, walletAddress]);

  useAsyncAction(refreshBalances, [walletAddress, unlockedWallet, refreshBalances]);

  useEffect(() => {
    if (!walletAddress) return;
    const id = window.setInterval(() => void refreshBalances(), 15000);
    return () => window.clearInterval(id);
  }, [walletAddress, refreshBalances]);

  // Count down lockout seconds for the UI.
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  useEffect(() => {
    if (!lockoutUntil) return;
    const tick = () => {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setLockoutSeconds(remaining > 0 ? remaining : 0);
    };
    const immediateId = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(immediateId);
      window.clearInterval(id);
    };
  }, [lockoutUntil]);

  const createWallet = useCallback(
    async (pin: string) => {
      if (!pin) throw new Error("Enter a PIN to secure the wallet.");
      setError(null);
      setFailedAttempts(0);
      setLockoutUntil(null);
      setDeletePinVerified(false);
      setCreating(true);
      try {
        const { encryptedWallet, mnemonic } = await createEncryptedWallet(pin);
        await saveEmbeddedWallet(encryptedWallet);
        const wallet = await decryptEmbeddedWallet(pin, encryptedWallet);
        const unlocked = { ...wallet, mnemonic };
        setExists(true);
        setWalletAddress(wallet.walletAddress);
        setUnlockedWallet(unlocked);
        saveSessionWallet(unlocked);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setCreating(false);
      }
    },
    [],
  );

  const importWallet = useCallback(
    async (mnemonic: string, pin: string) => {
      if (!mnemonic.trim()) throw new Error("Enter your 12-word seed phrase.");
      if (!pin) throw new Error("Enter a PIN to secure the imported wallet.");
      setError(null);
      setFailedAttempts(0);
      setLockoutUntil(null);
      setDeletePinVerified(false);
      setImporting(true);
      try {
        const { encryptedWallet } = await importEncryptedWalletFromMnemonic(
          mnemonic,
          pin,
        );
        await saveEmbeddedWallet(encryptedWallet);
        const wallet = await decryptEmbeddedWallet(pin, encryptedWallet);
        const unlocked = { ...wallet, mnemonic: wallet.mnemonic };
        setExists(true);
        setWalletAddress(wallet.walletAddress);
        setUnlockedWallet(unlocked);
        saveSessionWallet(unlocked);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setImporting(false);
      }
    },
    [],
  );

  const changePin = useCallback(
    async (oldPin: string, newPin: string) => {
      if (!oldPin) throw new Error("Enter your current PIN.");
      if (!newPin) throw new Error("Enter a new PIN.");
      setError(null);
      setChangingPin(true);
      try {
        const stored = await loadEmbeddedWallet();
        if (!stored) throw new Error("No embedded wallet found.");
        const reencrypted = await changeEncryptedWalletPin(oldPin, newPin, stored);
        await saveEmbeddedWallet(reencrypted);
        const wallet = await decryptEmbeddedWallet(newPin, reencrypted);
        setUnlockedWallet(wallet);
        saveSessionWallet(wallet);
        setFailedAttempts(0);
        setLockoutUntil(null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setChangingPin(false);
      }
    },
    [],
  );

  const unlockWallet = useCallback(
    async (pin: string) => {
      if (!pin) throw new Error("Enter your wallet PIN.");
      if (lockoutUntil && lockoutUntil > Date.now()) {
        const seconds = Math.ceil((lockoutUntil - Date.now()) / 1000);
        throw new Error(
          `Too many failed attempts. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`,
        );
      }
      setError(null);
      setUnlocking(true);
      try {
        const stored = await loadEmbeddedWallet();
        if (!stored) throw new Error("No embedded wallet found. Create one first.");
        const wallet = await decryptEmbeddedWallet(pin, stored);
        setUnlockedWallet(wallet);
        saveSessionWallet(wallet);
        setFailedAttempts(0);
        setLockoutUntil(null);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        const nextFailed = failedAttempts + 1;
        setFailedAttempts(nextFailed);
        if (nextFailed >= MAX_FAILED_ATTEMPTS) {
          const multiplier = Math.max(1, nextFailed - MAX_FAILED_ATTEMPTS + 1);
          const until = Date.now() + LOCKOUT_BASE_MS * multiplier;
          setLockoutUntil(until);
        }
        throw err;
      } finally {
        setUnlocking(false);
      }
    },
    [failedAttempts, lockoutUntil],
  );

  const lockWallet = useCallback(() => {
    setUnlockedWallet(null);
    setDeletePinVerified(false);
    setError(null);
    clearSessionWallet();
  }, []);

  // Auto-lock after user inactivity when the wallet is unlocked.
  useEffect(() => {
    if (!unlockedWallet) return;
    let timeoutId = window.setTimeout(() => {
      lockWallet();
    }, INACTIVITY_LOCK_MS);

    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        lockWallet();
      }, INACTIVITY_LOCK_MS);
    };

    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    for (const event of events) {
      window.addEventListener(event, resetTimer, { passive: true });
    }
    return () => {
      window.clearTimeout(timeoutId);
      for (const event of events) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [unlockedWallet, lockWallet]);

  const sendTokensFromWallet = useCallback(
    async (params: {
      token: "SOL" | "USDC";
      recipient: string;
      amount: number;
    }): Promise<string> => {
      if (!unlockedWallet) {
        throw new Error("Unlock your wallet to send tokens.");
      }
      setSending(true);
      setError(null);
      try {
        const { signature } = await sendTokens({
          keypair: unlockedWallet.keypair,
          ...params,
        });
        saveWalletActivity({
          type: "send",
          label: `Sent ${params.token}`,
          signature,
          amount: params.amount.toString(),
          token: params.token,
          detail: params.recipient,
          network: SOLANA_CLUSTER,
        });
        void refreshBalances();
        return signature;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        throw err;
      } finally {
        setSending(false);
      }
    },
    [unlockedWallet, refreshBalances],
  );

  const verifyPinForDelete = useCallback(
    async (pin: string) => {
      if (!pin) throw new Error("Enter your PIN to continue.");
      if (lockoutUntil && lockoutUntil > Date.now()) {
        const seconds = Math.ceil((lockoutUntil - Date.now()) / 1000);
        throw new Error(
          `Too many failed attempts. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`,
        );
      }
      setError(null);
      setVerifyingDelete(true);
      try {
        const stored = await loadEmbeddedWallet();
        if (!stored) throw new Error("No embedded wallet found.");
        await decryptEmbeddedWallet(pin, stored);
        setFailedAttempts(0);
        setLockoutUntil(null);
        setDeletePinVerified(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        const nextFailed = failedAttempts + 1;
        setFailedAttempts(nextFailed);
        if (nextFailed >= MAX_FAILED_ATTEMPTS) {
          const multiplier = Math.max(1, nextFailed - MAX_FAILED_ATTEMPTS + 1);
          const until = Date.now() + LOCKOUT_BASE_MS * multiplier;
          setLockoutUntil(until);
        }
        throw err;
      } finally {
        setVerifyingDelete(false);
      }
    },
    [failedAttempts, lockoutUntil],
  );

  const deleteWallet = useCallback(async () => {
    setError(null);
    setDeleting(true);
    try {
      await deleteEmbeddedWallet();
      setExists(false);
      setWalletAddress(null);
      setUnlockedWallet(null);
      setDeletePinVerified(false);
      setFailedAttempts(0);
      setLockoutUntil(null);
      setBalances({ sol: 0, solLoading: false, usdc: 0, usdcLoading: false });
      clearSessionWallet();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setDeleting(false);
    }
  }, []);

  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-6)}`
    : null;

  return {
    supported,
    exists,
    walletAddress,
    shortAddress,
    unlocked: Boolean(unlockedWallet),
    unlockedWallet,
    loading,
    creating,
    importing,
    changingPin,
    unlocking,
    sending,
    verifyingDelete,
    deleting,
    deletePinVerified,
    failedAttempts,
    lockoutSeconds,
    balances,
    error,
    balanceError,
    createWallet,
    importWallet,
    changePin,
    unlockWallet,
    lockWallet,
    sendTokens: sendTokensFromWallet,
    verifyPinForDelete,
    deleteWallet,
    refreshBalances,
  };
}
