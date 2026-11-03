/**
 * Browser access to injected Ethereum wallets (MetaMask, Coinbase Wallet,
 * Brave, Rabby, …).
 *
 * Discovery follows EIP-6963 ("Multi Provider Discovery"): wallets announce
 * themselves on the page, which avoids the injection race where several
 * extensions fight over `window.ethereum`. `window.ethereum` remains the
 * fallback for wallets that only implement EIP-1193.
 *
 * Signing uses EIP-1193 `personal_sign`, which every wallet implements — the
 * signature comes back as `0x…` (65 bytes: r, s, v) and is verified
 * server-side against the address in the message. No key material ever
 * touches this module: the wallet keeps the key and only returns a signature.
 */

/** The EIP-1193 provider surface this app relies on. */
export interface EthereumProvider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
}

/** EIP-6963 announcement: provider plus the metadata needed to render a choice. */
export interface DiscoveredEthereumProvider {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: EthereumProvider;
}

type AnnounceDetail = CustomEvent<DiscoveredEthereumProvider>;

const announcements = new Map<string, DiscoveredEthereumProvider>();
let listening = false;

function startListening(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("eip6963:announceProvider", (event) => {
    const detail = (event as AnnounceDetail).detail;
    if (detail?.info?.uuid && detail.provider) {
      announcements.set(detail.info.uuid, detail);
    }
  });
}

/** Discover EIP-6963 providers and fall back to `window.ethereum`. */
export function discoverEthereumProviders(): DiscoveredEthereumProvider[] {
  if (typeof window === "undefined") return [];

  startListening();
  // Wallets answer this synchronously-ish when they hear it.
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  const found = [...announcements.values()];

  const legacy = (window as { ethereum?: EthereumProvider }).ethereum;
  if (
    legacy &&
    typeof legacy.request === "function" &&
    !found.some((entry) => entry.provider === legacy)
  ) {
    found.unshift({
      info: {
        uuid: "injected",
        name: (legacy as { isMetaMask?: boolean }).isMetaMask
          ? "MetaMask"
          : "Browser wallet",
        icon: "",
        rdns: "injected",
      },
      provider: legacy,
    });
  }

  return found;
}

/**
 * Ask a provider for its accounts, prompting the wallet to connect if needed.
 * Returns the checksummed-free lower-case addresses.
 */
export async function requestEthereumAccounts(
  provider: EthereumProvider,
): Promise<string[]> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("The wallet did not return any accounts.");
  }
  return accounts.filter(
    (account): account is string =>
      typeof account === "string" && /^0x[0-9a-fA-F]{40}$/.test(account),
  );
}

/** Current chain id from the wallet, as a number (EIP-155). */
export async function getEthereumChainId(
  provider: EthereumProvider,
): Promise<number> {
  const raw = await provider.request({ method: "eth_chainId" });
  const chainId = typeof raw === "string" ? parseInt(raw, 16) : Number(raw);
  if (!Number.isInteger(chainId) || chainId < 0) {
    throw new Error("The wallet returned an unreadable chain id.");
  }
  return chainId;
}

function toHexUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Sign `message` with `personal_sign`. Returns the `0x`-prefixed 65-byte
 * signature exactly as the wallet produced it.
 */
export async function personalSign(
  provider: EthereumProvider,
  address: string,
  message: string,
): Promise<string> {
  const signature = await provider.request({
    method: "personal_sign",
    params: [toHexUtf8(message), address],
  });
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    throw new Error("The wallet returned an unreadable signature.");
  }
  return signature;
}

/** True when the wallet is rejecting user-facing prompts (user closed them). */
export function isEthereumUserRejection(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  if (code === 4001 || code === "ACTION_REJECTED") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /user rejected|user denied|rejected the request/i.test(message);
}
