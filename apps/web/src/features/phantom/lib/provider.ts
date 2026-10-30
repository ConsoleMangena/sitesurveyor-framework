import type { Transaction, VersionedTransaction } from "@solana/web3.js";

export interface PhantomWalletProvider {
  isPhantom?: boolean;
  publicKey: { toBase58(): string } | null;
  isConnected?: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect?(): Promise<void>;
  signAndSendTransaction?(transaction: Transaction | VersionedTransaction): Promise<{ signature: string }>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  off?(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window { phantom?: { solana?: PhantomWalletProvider } }
}

const listeners = new Set<() => void>();
function emitChange() { listeners.forEach((cb) => cb()); }
function attachListeners(provider: PhantomWalletProvider) { provider.on?.("accountChanged", emitChange); provider.on?.("disconnect", emitChange); }
function detachListeners(provider: PhantomWalletProvider) { provider.off?.("accountChanged", emitChange); provider.off?.("disconnect", emitChange); }
function normalizeProvider(provider: PhantomWalletProvider): PhantomWalletProvider {
  if (!provider.on) {
    const anyP = provider as PhantomWalletProvider & { addEventListener?: unknown; removeEventListener?: unknown };
    provider.on = typeof anyP.addEventListener === "function"
      ? (event, handler) => (anyP.addEventListener as (event: string, handler: (...args: unknown[]) => void) => void)(event, handler)
      : () => {};
    provider.off = typeof anyP.removeEventListener === "function"
      ? (event, handler) => (anyP.removeEventListener as (event: string, handler: (...args: unknown[]) => void) => void)(event, handler)
      : () => {};
  }
  return provider;
}

function readProvider(): PhantomWalletProvider | null {
  if (typeof window === "undefined") return null;
  const provider = window.phantom?.solana;
  return provider ? normalizeProvider(provider) : null;
}

export function isMobileBrowser(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
export function phantomMobileBrowseUrl(url = typeof window !== "undefined" ? window.location.href : ""): string {
  return `https://phantom.app/ul/browse/${encodeURIComponent(url)}`;
}
export function openPhantomMobile(url = typeof window !== "undefined" ? window.location.href : ""): void {
  if (typeof window !== "undefined") window.location.assign(phantomMobileBrowseUrl(url));
}


export type MobileWalletName = "Phantom" | "Solflare";

export function openMobileWallet(name: MobileWalletName): void {
  if (typeof window === "undefined") return;
  const url = window.location.href;
  if (name === "Solflare") {
    window.location.assign(`https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}`);
    return;
  }
  openPhantomMobile(url);
}

export function detectProvider(): PhantomWalletProvider | null { return readProvider(); }

export async function waitForProvider(timeoutMs = 3000, intervalMs = 200): Promise<PhantomWalletProvider | null> {
  if (typeof window === "undefined") return null;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const provider = readProvider();
    if (provider) return provider;
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
  return readProvider();
}

export function subscribeWalletChanges(callback: () => void): () => void {
  listeners.add(callback);
  const provider = detectProvider();
  if (provider) attachListeners(provider);
  return () => { listeners.delete(callback); if (provider) detachListeners(provider); };
}
export function isWalletConnected(): boolean { return Boolean(detectProvider()?.publicKey); }
export function getConnectedWalletAddress(): string | null { return detectProvider()?.publicKey?.toBase58() ?? null; }

export async function connectWallet(): Promise<{ provider: PhantomWalletProvider; walletAddress: string }> {
  const provider = await waitForProvider();
  if (!provider) throw new Error("Phantom wallet not detected. Open this page in the Phantom app on mobile, or install the Phantom extension.");
  if (provider.publicKey) return { provider, walletAddress: provider.publicKey.toBase58() };
  try {
    const { publicKey } = await provider.connect({ onlyIfTrusted: true });
    attachListeners(provider);
    return { provider, walletAddress: publicKey.toBase58() };
  } catch {
    const { publicKey } = await provider.connect();
    attachListeners(provider);
    return { provider, walletAddress: publicKey.toBase58() };
  }
}
export async function disconnectWallet(): Promise<void> { const provider = detectProvider(); if (provider?.disconnect) await provider.disconnect(); emitChange(); }
export function isUserRejection(err: unknown): boolean { const message = err instanceof Error ? err.message : String(err); return message.includes("User rejected") || message.includes("cancelled") || message.includes("canceled"); }
