/**
 * Typed client for the `web3-auth` Edge Function.
 *
 * Supabase Auth owns wallet *sign-in* (GoTrue verifies the SIWE/SIWS
 * signature itself). This function owns everything around it that Auth does
 * not expose: minting single-use challenges, attaching a wallet to an
 * account you are already signed in as, and removing one — each gated by a
 * fresh signature so a stolen session token alone can never re-point or drop
 * a credential.
 *
 * The browser only ever sends public material (message, signature, address)
 * plus its own session token. No private key material is accepted, stored,
 * or derived, here or on the server.
 */

import { supabase } from "../supabase/client.ts";
import { buildWalletMessage, type WalletChain } from "./siwe.ts";

export type { WalletChain };

/** Stable, caller-safe error codes returned by the function. */
export type Web3AuthErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_BODY"
  | "INVALID_MESSAGE"
  | "INVALID_ADDRESS"
  | "INVALID_EMAIL"
  | "ORIGIN_MISMATCH"
  | "CHALLENGE_INVALID"
  | "OWNERSHIP_PROOF_REQUIRED"
  | "LAST_SIGN_IN_METHOD"
  | "WALLET_ALREADY_LINKED"
  | "WALLET_NOT_LINKED"
  | "EMAIL_NOT_ON_ACCOUNT"
  | "EMAIL_NOT_CONFIRMED"
  | "NOT_AUTHENTICATED"
  | "UNSUPPORTED_CHAIN"
  | "UNKNOWN_ACTION"
  | "METHOD_NOT_ALLOWED"
  | "RATE_LIMITED"
  | "SERVER_NOT_CONFIGURED"
  | "SERVER_ERROR"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN";

/** An error whose `code` and `status` are safe to render to the caller. */
export class Web3AuthError extends Error {
  readonly code: Web3AuthErrorCode;
  readonly status: number;

  constructor(code: Web3AuthErrorCode, message: string, status: number) {
    super(message);
    this.name = "Web3AuthError";
    this.code = code;
    this.status = status;
  }
}

interface EdgeErrorBody {
  error?: { code?: unknown; message?: unknown };
}

/** Codes worth a specific sentence in the UI; everything else falls through. */
const KNOWN_CODES = new Set<string>([
  "INVALID_REQUEST",
  "INVALID_BODY",
  "INVALID_MESSAGE",
  "INVALID_ADDRESS",
  "INVALID_EMAIL",
  "ORIGIN_MISMATCH",
  "CHALLENGE_INVALID",
  "OWNERSHIP_PROOF_REQUIRED",
  "LAST_SIGN_IN_METHOD",
  "WALLET_ALREADY_LINKED",
  "WALLET_NOT_LINKED",
  "EMAIL_NOT_ON_ACCOUNT",
  "EMAIL_NOT_CONFIRMED",
  "NOT_AUTHENTICATED",
  "UNSUPPORTED_CHAIN",
  "UNKNOWN_ACTION",
  "METHOD_NOT_ALLOWED",
  "RATE_LIMITED",
  "SERVER_NOT_CONFIGURED",
  "SERVER_ERROR",
  "INTERNAL_ERROR",
]);

/**
 * Pull `{ code, message }` out of a failed `functions.invoke`. supabase-js
 * hands back a `FunctionsHttpError` whose `context` is the raw `Response`;
 * the body has to be read from there because `data` is null on non-2xx.
 */
async function toWeb3AuthError(error: unknown): Promise<Web3AuthError> {
  const response = (error as { context?: Response } | null)?.context;
  if (response && typeof response.json === "function") {
    try {
      const body = (await response.json()) as EdgeErrorBody;
      const rawCode = body?.error?.code;
      const rawMessage = body?.error?.message;
      const code =
        typeof rawCode === "string" && KNOWN_CODES.has(rawCode)
          ? (rawCode as Web3AuthErrorCode)
          : "UNKNOWN";
      const message =
        typeof rawMessage === "string" && rawMessage.trim()
          ? rawMessage
          : "Something went wrong talking to the wallet service.";
      return new Web3AuthError(code, message, response.status);
    } catch {
      // fall through to the generic mapping below
    }
  }

  // No readable body (offline, DNS failure, function not deployed).
  const status = (error as { status?: number } | null)?.status;
  if (typeof status !== "number" || status === 0) {
    return new Web3AuthError(
      "NETWORK_ERROR",
      "Could not reach the wallet service. Check your connection and try again.",
      0,
    );
  }
  return new Web3AuthError(
    "UNKNOWN",
    "The wallet service rejected that request. Please try again.",
    status,
  );
}

/** POST one action to the function and return its JSON payload. */
async function invokeWeb3Auth<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("web3-auth", { body });
  if (error) throw await toWeb3AuthError(error);
  return data as T;
}

// ── action payloads ──────────────────────────────────────────────────────────

export interface NonceResponse {
  nonce: string;
  expiresAt: string;
  chain: WalletChain;
  address: string;
  expiresInMs: number;
}

export interface ConsumeResponse {
  verified: true;
  chain: WalletChain;
  address: string;
}

export interface LinkResponse {
  linked: true;
  chain: WalletChain;
  address: string;
}

export interface UnlinkResponse {
  unlinked: true;
  chain: WalletChain;
  address: string;
}

export interface LinkEmailResponse {
  linked: true;
  email: string;
}

export interface UnlinkEmailResponse {
  unlinked: true;
}

/**
 * Mint a single-use, time-boxed challenge bound to (user, chain, address).
 * The nonce is embedded in the message the wallet signs, which is what makes
 * a captured signature single-use instead of replayable.
 */
export async function requestWalletNonce(input: {
  chain: WalletChain;
  address: string;
}): Promise<NonceResponse> {
  return invokeWeb3Auth<NonceResponse>({
    action: "nonce",
    chain: input.chain,
    address: input.address,
  });
}

/** Burn a challenge after verifying the signed message. Used by `unlink`. */
export async function consumeWalletChallenge(input: {
  chain: WalletChain;
  message: string;
  signature: string;
}): Promise<ConsumeResponse> {
  return invokeWeb3Auth<ConsumeResponse>({
    action: "consume",
    chain: input.chain,
    message: input.message,
    signature: input.signature,
  });
}

/** Verify + burn + attach a wallet to the caller's own account. */
export async function linkWallet(input: {
  chain: WalletChain;
  message: string;
  signature: string;
}): Promise<LinkResponse> {
  return invokeWeb3Auth<LinkResponse>({
    action: "link",
    chain: input.chain,
    message: input.message,
    signature: input.signature,
  });
}

/**
 * Detach a wallet. Requires a fresh ownership proof: the caller must have
 * signed and `consume`d a challenge for this exact wallet moments earlier,
 * so a hijacked session cannot silently drop a credential.
 */
export async function unlinkWallet(input: {
  chain: WalletChain;
  address: string;
}): Promise<UnlinkResponse> {
  return invokeWeb3Auth<UnlinkResponse>({
    action: "unlink",
    chain: input.chain,
    address: input.address,
  });
}

/**
 * Mark email+password as a sign-in method. Email sign-in itself is set up by
 * Supabase Auth; this only maintains the `email` identity the method list
 * and the lockout guard are built on.
 */
export async function linkEmailMethod(email: string): Promise<LinkEmailResponse> {
  return invokeWeb3Auth<LinkEmailResponse>({ action: "link_email", email });
}

/** Remove email+password as a sign-in method (server enforces the guard). */
export async function unlinkEmailMethod(): Promise<UnlinkEmailResponse> {
  return invokeWeb3Auth<UnlinkEmailResponse>({ action: "unlink_email" });
}

// ── sign-in with an injected Ethereum wallet ─────────────────────────────────

/**
 * Sign in with an Ethereum wallet through Supabase Auth's native `web3`
 * grant (Ethereum SIWE).
 *
 * GoTrue's `Web3Grant` performs **no** nonce-store validation — it accepts
 * whatever nonce the client passes — so this wrapper generates the nonce
 * here and hands it to Auth, mirroring the Solana pattern the app already
 * uses. That is enough for GoTrue to mint and verify the message; the
 * single-use, server-stored nonce is what the *link/unlink* flows need, and
 * those go through `web3-auth` instead.
 */
export async function signInWithEthereumWallet(input: {
  provider: {
    request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  };
  statement?: string;
  nonce: string;
  chainId?: number;
}): Promise<{ session: unknown; user: unknown }> {
  const { data, error } = await supabase.auth.signInWithWeb3({
    chain: "ethereum",
    wallet: input.provider as never,
    statement: input.statement,
    options: {
      signInWithEthereum: {
        nonce: input.nonce,
        ...(input.chainId !== undefined ? { chainId: input.chainId } : {}),
      },
    },
  } as never);

  if (error) throw error;
  return { session: data.session, user: data.user };
}

// ── link / unlink orchestration ──────────────────────────────────────────────

export interface WalletChallenge {
  nonce: string;
  message: string;
  expiresAt: string;
}

/**
 * Mint a challenge and build the exact message the wallet must sign for it.
 * Returns both so the caller only has to ask the wallet to sign.
 */
export async function createWalletChallenge(input: {
  chain: WalletChain;
  address: string;
  statement: string;
  chainId?: number;
}): Promise<WalletChallenge> {
  const { nonce, expiresAt } = await requestWalletNonce(input);
  const message = buildWalletMessage(input.chain, {
    address: input.address,
    statement: input.statement,
    nonce,
    ...(input.chain === "ethereum" && input.chainId !== undefined
      ? { chainId: input.chainId }
      : {}),
  });
  return { nonce, message, expiresAt };
}

/** Sign a prepared challenge and attach the wallet to the caller's account. */
export async function signAndLinkWallet(input: {
  chain: WalletChain;
  address: string;
  statement: string;
  sign: (message: string) => Promise<string>;
  chainId?: number;
}): Promise<LinkResponse> {
  const challenge = await createWalletChallenge(input);
  const signature = await input.sign(challenge.message);
  return linkWallet({ chain: input.chain, message: challenge.message, signature });
}

/**
 * Sign a prepared challenge and burn it, producing the short-lived ownership
 * proof that `unlink` insists on.
 */
export async function signAndConsumeWalletChallenge(input: {
  chain: WalletChain;
  address: string;
  statement: string;
  sign: (message: string) => Promise<string>;
  chainId?: number;
}): Promise<ConsumeResponse> {
  const challenge = await createWalletChallenge(input);
  const signature = await input.sign(challenge.message);
  return consumeWalletChallenge({
    chain: input.chain,
    message: challenge.message,
    signature,
  });
}
