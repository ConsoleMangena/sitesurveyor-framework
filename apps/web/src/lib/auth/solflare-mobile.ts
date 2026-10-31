import { base58 } from "@scure/base";

import { SOLANA_CLUSTER } from "../../features/phantom/lib/config.ts";
import {
  buildSolflareConnectUrl,
  buildSolflareRedirectLink,
  buildSolflareSignMessageUrl,
  createSolflareDappKeyPair,
  decryptSolflarePayload,
  deriveSolflareSharedSecret,
  encryptSolflarePayload,
  readSolflareRedirect,
  stripSolflareRedirectParams,
  type SolflareConnectResponse,
  type SolflareSignMessageResponse,
} from "../../features/phantom/lib/solflareDeeplink.ts";
import type { SolanaSignUpInput } from "./session.ts";

/**
 * Mobile Solflare sign-in through the Solflare app instead of its browser.
 *
 * The connect and signMessage deeplinks each reload this page, so the flow is
 * persisted across both returns: the dapp keypair, wallet session and SIWS
 * message survive the app switch in localStorage.
 */

const STORAGE_KEY = "sitesurveyor.solflare-mobile-auth";
const FLOW_TTL_MS = 15 * 60 * 1000;

export interface SolflareMobileStart {
  intent: "signin" | "signup";
  statement: string;
  signup?: SolanaSignUpInput;
}

interface PendingSolflareFlow {
  id: string;
  stage: "connect" | "sign";
  createdAt: number;
  dappPublicKey: string;
  dappSecretKey: string;
  intent: "signin" | "signup";
  statement: string;
  signup?: SolanaSignUpInput;
  sharedSecret?: string;
  walletAddress?: string;
  session?: string;
  message?: string;
}

export type SolflareMobileAuthOutcome =
  | { status: "awaiting-signature" }
  | {
      status: "completed";
      intent: "signin" | "signup";
      signup?: SolanaSignUpInput;
      message: string;
      signature: Uint8Array;
    }
  | { status: "error"; message: string };

const EXPIRED_MESSAGE =
  "This Solflare request expired. Sign in again to reconnect your wallet.";
const UNVERIFIED_RESPONSE_MESSAGE =
  "Solflare returned a response SiteSurveyor couldn't verify. Please try again.";

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isSignupInput(value: unknown): value is SolanaSignUpInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<SolanaSignUpInput>;
  return (
    typeof input.fullName === "string" &&
    (input.accountType === "personal" || input.accountType === "business")
  );
}

function loadPendingFlow(): PendingSolflareFlow | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSolflareFlow>;
    if (
      typeof parsed.id !== "string" ||
      (parsed.stage !== "connect" && parsed.stage !== "sign") ||
      typeof parsed.createdAt !== "number" ||
      typeof parsed.dappPublicKey !== "string" ||
      typeof parsed.dappSecretKey !== "string" ||
      (parsed.intent !== "signin" && parsed.intent !== "signup") ||
      typeof parsed.statement !== "string" ||
      (parsed.intent === "signup" && !isSignupInput(parsed.signup))
    ) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed as PendingSolflareFlow;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function savePendingFlow(flow: PendingSolflareFlow): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flow));
  } catch {
    /* storage can be unavailable in private webviews; the flow then restarts */
  }
}

function clearPendingFlow(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function isFresh(flow: PendingSolflareFlow): boolean {
  return Date.now() - flow.createdAt <= FLOW_TTL_MS;
}

/**
 * Build the Sign-In With Solana message exactly as @supabase/auth-js does for
 * `signMessage` wallets. The server verifies this text, so it must be signed
 * verbatim by Solflare.
 */
export function createSiwsMessage({
  address,
  statement,
  issuedAt,
  url = window.location.origin,
}: {
  address: string;
  statement: string;
  issuedAt: string;
  url?: string;
}): string {
  const target = new URL(url);
  return [
    `${target.host} wants you to sign in with your Solana account:`,
    address,
    ...(statement ? ["", statement, ""] : [""]),
    "Version: 1",
    `URI: ${target.href}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export function startSolflareMobileAuth(start: SolflareMobileStart): boolean {
  if (typeof window === "undefined") return false;
  const keyPair = createSolflareDappKeyPair();
  const flow: PendingSolflareFlow = {
    id: randomId(),
    stage: "connect",
    createdAt: Date.now(),
    dappPublicKey: keyPair.publicKey,
    dappSecretKey: keyPair.secretKey,
    intent: start.intent,
    statement: start.statement,
    signup: start.signup,
  };
  savePendingFlow(flow);
  window.location.assign(
    buildSolflareConnectUrl({
      dappEncryptionPublicKey: flow.dappPublicKey,
      redirectLink: buildSolflareRedirectLink("connect", flow.id),
      cluster: SOLANA_CLUSTER,
    }),
  );
  return true;
}

export function shouldResumeSolflareAuth(search: string): boolean {
  return readSolflareRedirect(search) !== null;
}

export function hasPendingSolflareSignature(): boolean {
  const flow = loadPendingFlow();
  return Boolean(flow && flow.stage === "sign" && isFresh(flow));
}

export function cancelSolflareMobileAuth(): void {
  clearPendingFlow();
}

export function resumeSolflareMobileAuth(
  search: string,
): SolflareMobileAuthOutcome | null {
  const redirect = readSolflareRedirect(search);
  if (!redirect) return null;

  stripSolflareRedirectParams();

  if (redirect.kind === "error") {
    const pending = loadPendingFlow();
    if (!redirect.flowId || pending?.id === redirect.flowId) {
      clearPendingFlow();
    }
    const rejected = /reject|cancel|denied/i.test(
      `${redirect.errorCode} ${redirect.errorMessage ?? ""}`,
    );
    return {
      status: "error",
      message: rejected
        ? "Solflare authorization was cancelled."
        : redirect.errorMessage ||
          "Solflare could not complete the request. Please try again.",
    };
  }

  const pending = loadPendingFlow();
  if (
    !pending ||
    (redirect.flowId && redirect.flowId !== pending.id) ||
    !isFresh(pending)
  ) {
    clearPendingFlow();
    return { status: "error", message: EXPIRED_MESSAGE };
  }

  try {
    if (redirect.kind === "connect") {
      if (
        pending.stage !== "connect" ||
        !redirect.solflareEncryptionPublicKey ||
        !redirect.nonce ||
        !redirect.data
      ) {
        throw new Error("Incomplete Solflare connect response.");
      }

      const sharedSecret = deriveSolflareSharedSecret(
        redirect.solflareEncryptionPublicKey,
        pending.dappSecretKey,
      );
      const response = decryptSolflarePayload<Partial<SolflareConnectResponse>>(
        redirect.data,
        redirect.nonce,
        sharedSecret,
      );
      if (
        typeof response.public_key !== "string" ||
        typeof response.session !== "string"
      ) {
        throw new Error("Solflare did not return a wallet address.");
      }

      savePendingFlow({
        ...pending,
        stage: "sign",
        sharedSecret,
        walletAddress: response.public_key,
        session: response.session,
        message: createSiwsMessage({
          address: response.public_key,
          statement: pending.statement,
          issuedAt: new Date().toISOString(),
        }),
      });
      return { status: "awaiting-signature" };
    }

    if (
      pending.stage !== "sign" ||
      !pending.sharedSecret ||
      !pending.message ||
      !redirect.nonce ||
      !redirect.data
    ) {
      throw new Error("Incomplete Solflare signature response.");
    }

    const response = decryptSolflarePayload<Partial<SolflareSignMessageResponse>>(
      redirect.data,
      redirect.nonce,
      pending.sharedSecret,
    );
    if (typeof response.signature !== "string") {
      throw new Error("Solflare did not return a signature.");
    }
    const signature = base58.decode(response.signature);

    clearPendingFlow();
    return {
      status: "completed",
      intent: pending.intent,
      signup: pending.signup,
      message: pending.message,
      signature,
    };
  } catch (err) {
    clearPendingFlow();
    console.warn("[solflare-mobile] Could not read the Solflare response:", err);
    return { status: "error", message: UNVERIFIED_RESPONSE_MESSAGE };
  }
}

export function continueSolflareMobileAuth(): boolean {
  if (typeof window === "undefined") return false;
  const pending = loadPendingFlow();
  if (
    !pending ||
    pending.stage !== "sign" ||
    !isFresh(pending) ||
    !pending.sharedSecret ||
    !pending.session ||
    !pending.message
  ) {
    if (pending && !isFresh(pending)) clearPendingFlow();
    return false;
  }

  const { nonce, payload } = encryptSolflarePayload(
    {
      message: base58.encode(new TextEncoder().encode(pending.message)),
      session: pending.session,
      display: "utf8",
    },
    pending.sharedSecret,
  );

  window.location.assign(
    buildSolflareSignMessageUrl({
      dappEncryptionPublicKey: pending.dappPublicKey,
      nonce,
      payload,
      redirectLink: buildSolflareRedirectLink("sign", pending.id),
    }),
  );
  return true;
}
