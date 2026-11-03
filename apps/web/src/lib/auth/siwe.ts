/**
 * Client-side builders for the wallet messages used when *linking* a wallet to
 * an existing account.
 *
 * Wallet sign-in itself goes through Supabase Auth (auth-js builds and
 * verifies those messages), but attaching or removing a wallet needs a
 * signature that this application mints, inspects and burns server-side — so
 * the message has to match, byte for byte, what `supabase/functions/_shared/
 * siwe.ts` parses:
 *
 *   domain wants you to sign in with your {chain} account:
 *   <address>
 *   <blank>
 *   <statement>
 *   <blank>
 *   URI: …
 *   Version: 1
 *   [Chain ID: …]           (Ethereum only)
 *   Nonce: …
 *   Issued At: …
 *
 * The nonce here is a challenge issued by the `web3-auth` Edge Function and
 * bound to (user, chain, address); it is single-use and time-boxed, which is
 * what stops a captured signature from being replayed later.
 */

export type WalletChain = "ethereum" | "solana";

export interface WalletMessageInput {
  /** Host the message is minted for, e.g. `localhost:5174`. Defaults to the page host. */
  domain?: string;
  /** Absolute URI the message is minted for. Defaults to the current page. */
  uri?: string;
  /** Address that will sign the message. */
  address: string;
  /** One-line purpose shown inside the wallet's confirmation prompt. */
  statement?: string;
  /** Single-use challenge from the `web3-auth` function (`action: "nonce"`). */
  nonce: string;
  /** Issued-at timestamp; defaults to now. */
  issuedAt?: Date;
  /** Optional expiry echoed to the server's policy check. */
  expirationTime?: Date;
}

export interface SiweMessageInput extends WalletMessageInput {
  /** EIP-155 chain id. Defaults to 1 (mainnet) — the value does not gate access. */
  chainId?: number;
}

const VERSION = "1";

/** Host used for messages, e.g. `localhost:5174` or `app.example.com`. */
export function authMessageDomain(): string {
  if (typeof window === "undefined") return "localhost";
  return window.location.host;
}

/** Absolute URI used for messages, defaulting to the current page. */
export function authMessageUri(): string {
  if (typeof window === "undefined") return "http://localhost/";
  return window.location.href;
}

/**
 * Alphanumeric challenge token for messages. Safe for both parsers: the
 * server requires ≥8 characters of `[0-9A-Za-z]`.
 */
export function generateMessageNonce(length = 16): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

function iso(value: Date | undefined, fallback: Date): string {
  return (value ?? fallback).toISOString();
}

function normalizeAddress(chain: WalletChain, address: string): string {
  const trimmed = address.trim();
  if (chain === "ethereum") {
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
      throw new Error("That is not a valid Ethereum address.");
    }
    return trimmed.toLowerCase();
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
    throw new Error("That is not a valid Solana address.");
  }
  return trimmed;
}

/**
 * Build an EIP-4361 (Sign-In With Ethereum) message for the link/unlink
 * challenge flows.
 */
export function buildSiweMessage(input: SiweMessageInput): string {
  const domain = input.domain ?? authMessageDomain();
  const uri = input.uri ?? authMessageUri();
  const address = normalizeAddress("ethereum", input.address);
  const chainId = input.chainId ?? 1;
  if (!Number.isInteger(chainId) || chainId < 0) {
    throw new Error("Chain ID must be a non-negative integer.");
  }
  if (!input.nonce || input.nonce.length < 8 || !/^[0-9A-Za-z]+$/.test(input.nonce)) {
    throw new Error("Nonce must be at least 8 alphanumeric characters.");
  }
  if (input.statement?.includes("\n")) {
    throw new Error("Statement must not contain line breaks.");
  }

  const statement = input.statement ? `${input.statement}\n` : "";
  const head =
    `${domain} wants you to sign in with your Ethereum account:\n` +
    `${address}\n\n${statement}`;
  let tail =
    `URI: ${uri}\n` +
    `Version: ${VERSION}\n` +
    `Chain ID: ${chainId}\n` +
    `Nonce: ${input.nonce}\n` +
    `Issued At: ${iso(input.issuedAt, new Date())}`;
  if (input.expirationTime) {
    tail += `\nExpiration Time: ${input.expirationTime.toISOString()}`;
  }
  return `${head}\n${tail}`;
}

/**
 * Build the Sign-In With Solana message used for the link/unlink challenge
 * flows. Layout mirrors EIP-4361 (minus Chain ID) so both chains behave
 * identically.
 */
export function buildSiwsMessage(input: WalletMessageInput): string {
  const domain = input.domain ?? authMessageDomain();
  const uri = input.uri ?? authMessageUri();
  const address = normalizeAddress("solana", input.address);
  if (!input.nonce || input.nonce.length < 8 || !/^[0-9A-Za-z]+$/.test(input.nonce)) {
    throw new Error("Nonce must be at least 8 alphanumeric characters.");
  }
  if (input.statement?.includes("\n")) {
    throw new Error("Statement must not contain line breaks.");
  }

  const statement = input.statement ? `${input.statement}\n` : "";
  const head =
    `${domain} wants you to sign in with your Solana account:\n` +
    `${address}\n\n${statement}`;
  let tail =
    `URI: ${uri}\n` +
    `Version: ${VERSION}\n` +
    `Nonce: ${input.nonce}\n` +
    `Issued At: ${iso(input.issuedAt, new Date())}`;
  if (input.expirationTime) {
    tail += `\nExpiration Time: ${input.expirationTime.toISOString()}`;
  }
  return `${head}\n${tail}`;
}

/** Pick the right builder for a chain. */
export function buildWalletMessage(
  chain: WalletChain,
  input: WalletMessageInput & { chainId?: number },
): string {
  return chain === "ethereum"
    ? buildSiweMessage(input as SiweMessageInput)
    : buildSiwsMessage(input);
}
