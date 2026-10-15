/**
 * Phantom wallet provider helpers.
 *
 * Talks directly to the injected window.phantom.solana provider rather than
 * pulling in the wallet-adapter React provider tree. Payments and wallet
 * connection go through a single, dependency-light code path.
 */

import type { Transaction, VersionedTransaction } from "@solana/web3.js";

export interface PhantomWalletProvider {
  isPhantom?: boolean;
  publicKey: { toBase58(): string } | null;
  isConnected?: boolean;
  connect(
    opts?: { onlyIfTrusted?: boolean },
  ): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect?(): Promise<void>;
  /** Phantom-compatible: signs, sends, and returns the tx signature. */
  signAndSendTransaction?(
    transaction: Transaction | VersionedTransaction,
  ): Promise<{ signature: string }>;
  /** Some providers expose an on/off event emitter. */
  on?(event: string, handler: (...args: unknown[]) => void): void;
  off?(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    phantom?: { solana?: PhantomWalletProvider };
  }
}

const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((cb) => cb());
}

function attachListeners(provider: PhantomWalletProvider) {
  if (!provider.on) return;
  provider.on("accountChanged", emitChange);
  provider.on("disconnect", emitChange);
}

function detachListeners(provider: PhantomWalletProvider) {
  if (!provider.off) return;
  provider.off("accountChanged", emitChange);
  provider.off("disconnect", emitChange);
}

/** Ensure every provider has stub event methods so the rest of the code is safe. */
function normalizeProvider(
  provider: PhantomWalletProvider,
): PhantomWalletProvider {
  if (!provider.on) {
    // Some providers use addEventListener instead of on/off.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyP = provider as any;
    if (typeof anyP.addEventListener === "function") {
      provider.on = (event: string, handler: (...args: unknown[]) => void) => {
        anyP.addEventListener(event, handler);
      };
      provider.off = (event: string, handler: (...args: unknown[]) => void) => {
        anyP.removeEventListener(event, handler);
      };
    } else {
      provider.on = () => {};
      provider.off = () => {};
    }
  }
  return provider;
}

/** Read the injected Phantom provider, if present. */
function readProvider(): PhantomWalletProvider | null {
  if (typeof window === "undefined") return null;
  const provider = window.phantom?.solana;
  if (!provider) return null;
  return normalizeProvider(provider);
}

/** Detect the injected Phantom wallet, if installed. */
export function detectProvider(): PhantomWalletProvider | null {
  return readProvider();
}

/**
 * Wait for Phantom to inject its provider.
 * Extensions sometimes inject a few hundred ms after page load,
 * so we retry briefly before giving up.
 */
export async function waitForProvider(
  timeoutMs = 3000,
  intervalMs = 200,
): Promise<PhantomWalletProvider | null> {
  if (typeof window === "undefined") return null;

  let cleanup: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    const handler = () => resolve();
    window.addEventListener("phantom#initialized", handler, { once: true });
    window.addEventListener("wallet#initialized", handler, { once: true });
    cleanup = () => {
      window.removeEventListener("phantom#initialized", handler);
      window.removeEventListener("wallet#initialized", handler);
    };
  });

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const provider = readProvider();
    if (provider) {
      cleanup?.();
      return provider;
    }
    await Promise.race([
      new Promise((res) => window.setTimeout(res, intervalMs)),
      ready,
    ]);
    const eventProvider = readProvider();
    if (eventProvider) {
      cleanup?.();
      return eventProvider;
    }
  }

  cleanup?.();
  return readProvider();
}

/** Subscribe to wallet account/disconnect changes. Returns unsubscribe. */
export function subscribeWalletChanges(callback: () => void): () => void {
  listeners.add(callback);
  const provider = detectProvider();
  if (provider) attachListeners(provider);
  return () => {
    listeners.delete(callback);
    if (provider) detachListeners(provider);
  };
}

/** True when the injected wallet reports a connected account. */
export function isWalletConnected(): boolean {
  const provider = detectProvider();
  return Boolean(provider?.publicKey);
}

/** Current connected wallet address, or null. */
export function getConnectedWalletAddress(): string | null {
  const provider = detectProvider();
  return provider?.publicKey?.toBase58() ?? null;
}

/**
 * Connect to Phantom and return its base58 public key.
 * If already connected, returns immediately without prompting.
 */
export async function connectWallet(): Promise<{
  provider: PhantomWalletProvider;
  walletAddress: string;
}> {
  const provider = await waitForProvider();
  if (!provider) {
    throw new Error(
      "Phantom wallet not detected. Install the Phantom extension and refresh the page.",
    );
  }

  // Already connected — no need to prompt.
  if (provider.publicKey) {
    attachListeners(provider);
    return { provider, walletAddress: provider.publicKey.toBase58() };
  }

  try {
    const { publicKey } = await provider.connect({ onlyIfTrusted: true });
    attachListeners(provider);
    return { provider, walletAddress: publicKey.toBase58() };
  } catch {
    // Trusted auto-connect not allowed or no prior connection.
    // Fall back to an explicit prompt.
    const { publicKey } = await provider.connect();
    attachListeners(provider);
    return { provider, walletAddress: publicKey.toBase58() };
  }
}

/** Disconnect from the current wallet, if supported by the provider. */
export async function disconnectWallet(): Promise<void> {
  const provider = detectProvider();
  if (provider?.disconnect) {
    await provider.disconnect();
  }
  emitChange();
}

/** True when the rejection came from the user dismissing a wallet prompt. */
export function isUserRejection(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("User rejected") ||
    message.includes("cancelled") ||
    message.includes("canceled")
  );
}
