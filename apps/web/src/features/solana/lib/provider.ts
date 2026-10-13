/**
 * Shared Solana wallet provider helpers.
 *
 * We talk directly to the injected window provider (Phantom / Solflare and
 * compatible wallets) rather than pulling in the full wallet-adapter React
 * provider tree. This keeps the auth button and the payment flow on a single,
 * dependency-light code path.
 */

import type { Transaction, VersionedTransaction } from "@solana/web3.js";

export interface SolanaWalletProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  isGlow?: boolean;
  publicKey: { toBase58(): string } | null;
  isConnected?: boolean;
  connect(
    opts?: { onlyIfTrusted?: boolean },
  ): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect?(): Promise<void>;
  signMessage(
    message: Uint8Array,
    encoding: "utf8",
  ): Promise<{ signature: Uint8Array }>;
  /** Phantom-compatible: signs, sends, and returns the tx signature. */
  signAndSendTransaction?(
    transaction: Transaction | VersionedTransaction,
  ): Promise<{ signature: string }>;
  /** Some wallets expose an on/off event emitter. */
  on?(event: string, handler: (...args: unknown[]) => void): void;
  off?(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    solana?: SolanaWalletProvider;
    solflare?: SolanaWalletProvider;
    phantom?: { solana?: SolanaWalletProvider };
    backpack?: SolanaWalletProvider;
    glowSolana?: SolanaWalletProvider;
  }
}

const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((cb) => cb());
}

function attachListeners(provider: SolanaWalletProvider) {
  if (!provider.on) return;
  provider.on("accountChanged", emitChange);
  provider.on("disconnect", emitChange);
}

function detachListeners(provider: SolanaWalletProvider) {
  if (!provider.off) return;
  provider.off("accountChanged", emitChange);
  provider.off("disconnect", emitChange);
}

/** Ensure every provider has stub event methods so the rest of the code is safe. */
function normalizeProvider(provider: SolanaWalletProvider): SolanaWalletProvider {
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

/** Try to pick a usable provider from the various wallet globals. */
function readProvider(): SolanaWalletProvider | null {
  if (typeof window === "undefined") return null;

  const candidates = [
    window.solana,
    window.phantom?.solana,
    window.solflare,
    window.backpack,
    window.glowSolana,
  ];

  // Prefer a provider that already has a public key (connected).
  const connected = candidates.find(
    (p): p is SolanaWalletProvider => Boolean(p?.publicKey),
  );
  if (connected) return normalizeProvider(connected);

  // Otherwise preferPhantom, then Solflare, then any available provider.
  const any = candidates.find(
    (p): p is SolanaWalletProvider => Boolean(p),
  );
  if (any) return normalizeProvider(any);

  return null;
}

/** Listen for wallet-extension initialization events fired after page load. */
function listenForWalletReady(resolve: (provider: SolanaWalletProvider | null) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => resolve(readProvider());

  window.addEventListener("solana#initialized", handler);
  window.addEventListener("phantom#initialized", handler);
  window.addEventListener("solflare#initialized", handler);

  // Some wallets dispatch a more generic event.
  window.addEventListener("wallet#initialized", handler);

  return () => {
    window.removeEventListener("solana#initialized", handler);
    window.removeEventListener("phantom#initialized", handler);
    window.removeEventListener("solflare#initialized", handler);
    window.removeEventListener("wallet#initialized", handler);
  };
}

/** Detect the best available injected Solana wallet, if any. */
export function detectProvider(): SolanaWalletProvider | null {
  const provider = readProvider();
  if (import.meta.env.DEV) {
     
    console.log("[wallet] detection:", getWalletDetectionInfo(), "chosen:", provider ? "yes" : "no");
  }
  return provider;
}

/**
 * Wait for an injected wallet to appear.
 * Wallet extensions sometimes inject a few hundred ms after page load,
 * so we retry briefly before giving up.
 */
export async function waitForProvider(
  timeoutMs = 3000,
  intervalMs = 200,
): Promise<SolanaWalletProvider | null> {
  if (typeof window === "undefined") return null;

  let cleanup: (() => void) | undefined;
  const ready = new Promise<SolanaWalletProvider | null>((resolve) => {
    cleanup = listenForWalletReady((provider) => {
      if (provider) resolve(provider);
    });
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

/** True when the detected wallet reports a connected account. */
export function isWalletConnected(): boolean {
  const provider = detectProvider();
  if (!provider) return false;
  return Boolean(provider.publicKey);
}

/** Current connected wallet address, or null. */
export function getConnectedWalletAddress(): string | null {
  const provider = detectProvider();
  return provider?.publicKey?.toBase58() ?? null;
}

/**
 * Connect to the wallet and return its base58 public key.
 * If the wallet is already connected, returns immediately without prompting.
 */
export async function connectWallet(): Promise<{
  provider: SolanaWalletProvider;
  walletAddress: string;
}> {
  const provider = await waitForProvider();
  if (!provider) {
    throw new Error(
      "No Solana wallet detected. Unlock your embedded wallet, or install Phantom/Solflare and refresh the page.",
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

export interface WalletDetectionInfo {
  solana: boolean;
  phantom: boolean;
  phantomSolana: boolean;
  solflare: boolean;
  backpack: boolean;
  glowSolana: boolean;
}

/** Report which wallet globals are present (useful for debugging). */
export function getWalletDetectionInfo(): WalletDetectionInfo {
  if (typeof window === "undefined") {
    return {
      solana: false,
      phantom: false,
      phantomSolana: false,
      solflare: false,
      backpack: false,
      glowSolana: false,
    };
  }
  return {
    solana: Boolean(window.solana),
    phantom: Boolean(window.phantom),
    phantomSolana: Boolean(window.phantom?.solana),
    solflare: Boolean(window.solflare),
    backpack: Boolean(window.backpack),
    glowSolana: Boolean(window.glowSolana),
  };
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
