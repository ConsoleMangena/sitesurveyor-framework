import { base58 } from "@scure/base";
import nacl from "tweetnacl";

import type { SolanaCluster } from "./config.ts";

/**
 * Solflare's mobile provider API (https://docs.solflare.com/solflare/technical/deeplinks).
 *
 * Unlike the `browse` link, the connect and signMessage methods open Solflare's
 * approval sheet and redirect back to this app, so authentication stays in
 * SiteSurveyor instead of moving into Solflare's in-app browser.
 *
 * Payloads are encrypted with NaCl box: X25519 key exchange plus
 * XSalsa20-Poly1305. Public keys, nonces, ciphertext and signatures travel as
 * base58 strings.
 */

const SOLFLARE_URL_BASE = "https://solflare.com/ul/v1";

export const SOLFLARE_FLOW_PARAM = "solflare_flow";
export const SOLFLARE_RETURN_PARAM = "solflare_return";

const SOLFLARE_RESPONSE_PARAMS = [
  "solflare_encryption_public_key",
  "nonce",
  "data",
  "errorCode",
  "errorMessage",
] as const;

export type SolflareReturnStage = "connect" | "sign";

export interface SolflareDappKeyPair {
  publicKey: string;
  secretKey: string;
}

export interface SolflareRedirectBase {
  flowId: string | null;
}

export type SolflareRedirect =
  | (SolflareRedirectBase & {
      kind: "connect";
      solflareEncryptionPublicKey: string | null;
      nonce: string | null;
      data: string | null;
    })
  | (SolflareRedirectBase & {
      kind: "sign";
      nonce: string | null;
      data: string | null;
    })
  | (SolflareRedirectBase & {
      kind: "error";
      errorCode: string;
      errorMessage: string | null;
    });

export interface SolflareConnectResponse {
  public_key: string;
  session: string;
}

export interface SolflareSignMessageResponse {
  signature: string;
}

export function createSolflareDappKeyPair(): SolflareDappKeyPair {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: base58.encode(keyPair.publicKey),
    secretKey: base58.encode(keyPair.secretKey),
  };
}

export function deriveSolflareSharedSecret(
  solflareEncryptionPublicKey: string,
  dappSecretKey: string,
): string {
  const sharedSecret = nacl.box.before(
    base58.decode(solflareEncryptionPublicKey),
    base58.decode(dappSecretKey),
  );
  return base58.encode(sharedSecret);
}

export function encryptSolflarePayload(
  payload: unknown,
  sharedSecret: string,
): { nonce: string; payload: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const encrypted = nacl.box.after(
    new TextEncoder().encode(JSON.stringify(payload)),
    nonce,
    base58.decode(sharedSecret),
  );
  return { nonce: base58.encode(nonce), payload: base58.encode(encrypted) };
}

export function decryptSolflarePayload<T>(
  data: string,
  nonce: string,
  sharedSecret: string,
): T {
  const decrypted = nacl.box.open.after(
    base58.decode(data),
    base58.decode(nonce),
    base58.decode(sharedSecret),
  );
  if (!decrypted) {
    throw new Error("Solflare's response could not be decrypted.");
  }
  return JSON.parse(new TextDecoder().decode(decrypted)) as T;
}

export function buildSolflareConnectUrl({
  dappEncryptionPublicKey,
  redirectLink,
  cluster,
}: {
  dappEncryptionPublicKey: string;
  redirectLink: string;
  cluster: SolanaCluster;
}): string {
  const params = new URLSearchParams({
    app_url: window.location.origin,
    dapp_encryption_public_key: dappEncryptionPublicKey,
    redirect_link: redirectLink,
    cluster,
  });
  return `${SOLFLARE_URL_BASE}/connect?${params.toString()}`;
}

export function buildSolflareSignMessageUrl({
  dappEncryptionPublicKey,
  nonce,
  payload,
  redirectLink,
}: {
  dappEncryptionPublicKey: string;
  nonce: string;
  payload: string;
  redirectLink: string;
}): string {
  const params = new URLSearchParams({
    dapp_encryption_public_key: dappEncryptionPublicKey,
    nonce,
    redirect_link: redirectLink,
    payload,
  });
  return `${SOLFLARE_URL_BASE}/signMessage?${params.toString()}`;
}

/** Build the return URL Solflare appends its response parameters to. */
export function buildSolflareRedirectLink(
  stage: SolflareReturnStage,
  flowId: string,
  href = window.location.href,
): string {
  const url = new URL(href);
  for (const param of SOLFLARE_RESPONSE_PARAMS) {
    url.searchParams.delete(param);
  }
  url.searchParams.delete(SOLFLARE_FLOW_PARAM);
  url.searchParams.delete(SOLFLARE_RETURN_PARAM);
  url.searchParams.set(SOLFLARE_FLOW_PARAM, flowId);
  url.searchParams.set(SOLFLARE_RETURN_PARAM, stage);
  return url.toString();
}

/**
 * Safely parse query parameters from a search string or full URL, handling:
 * 1. Double question marks ("?a=b?c=d") caused by mobile wallet universal links
 *    blindly appending "?param=val" to return URLs with existing query strings.
 * 2. Hash-appended parameters ("#param=val" or "...#top?param=val").
 */
export function extractSolflareParams(searchOrHref?: string): URLSearchParams {
  if (!searchOrHref) return new URLSearchParams();
  let s = searchOrHref;
  const firstDelim = s.search(/[?#]/);
  if (firstDelim !== -1) {
    s = s.substring(firstDelim + 1);
  }
  s = s.replace(/[?#]/g, "&");
  return new URLSearchParams(s);
}

export function readSolflareRedirect(search: string): SolflareRedirect | null {
  const params = extractSolflareParams(search);
  const flowId = params.get(SOLFLARE_FLOW_PARAM);
  const errorCode = params.get("errorCode");
  if (errorCode) {
    return {
      kind: "error",
      flowId,
      errorCode,
      errorMessage: params.get("errorMessage"),
    };
  }

  const explicitStage = params.get(SOLFLARE_RETURN_PARAM);
  const solflareEncryptionPublicKey = params.get("solflare_encryption_public_key");
  const nonce = params.get("nonce");
  const data = params.get("data");

  // Connect stage: explicit stage or Solflare's encryption public key returned
  if (explicitStage === "connect" || Boolean(solflareEncryptionPublicKey)) {
    if (!solflareEncryptionPublicKey && !nonce && !data) {
      return null;
    }
    return {
      kind: "connect",
      flowId,
      solflareEncryptionPublicKey,
      nonce,
      data,
    };
  }

  // Sign stage: explicit stage or signature payload returned (nonce + data without encryption key)
  if (explicitStage === "sign" || (Boolean(nonce) && Boolean(data))) {
    return {
      kind: "sign",
      flowId,
      nonce,
      data,
    };
  }

  return null;
}

/** Remove Solflare's response parameters so a reload cannot replay them. */
export function stripSolflareRedirectParams(href = window.location.href): void {
  try {
    const url = new URL(href);
    const paramsToRemove = new Set([
      ...SOLFLARE_RESPONSE_PARAMS,
      SOLFLARE_FLOW_PARAM,
      SOLFLARE_RETURN_PARAM,
    ]);
    const cleanParams = new URLSearchParams();
    const raw = url.search + (url.hash ? "&" + url.hash : "");
    const extracted = extractSolflareParams(raw);
    extracted.forEach((value, key) => {
      if (!paramsToRemove.has(key as never)) {
        cleanParams.set(key, value);
      }
    });
    const newSearch = cleanParams.toString() ? `?${cleanParams.toString()}` : "";
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${newSearch}`,
    );
  } catch {
    /* ignore in non-browser environments */
  }
}
