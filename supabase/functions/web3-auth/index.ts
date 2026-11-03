/**
 * `web3-auth` — the server side of wallet-based sign-in methods.
 *
 * Supabase Auth owns wallet *sign-in* (`grant_type=web3`, verified by GoTrue
 * itself). What it does not expose is attaching a wallet to an account you are
 * already signed in as, or removing one — so this function does that, and it
 * does it only after re-proving, server-side, that the caller controls the
 * wallet:
 *
 *   nonce   → mint a single-use, time-boxed challenge bound to
 *             (user, chain, address). Requires a session.
 *   consume → verify an EIP-4361 / SIWS message + signature against the
 *             deployment's own origin policy, then atomically burn the
 *             challenge. Produces a short-lived "ownership proof" used by
 *             `unlink`.
 *   link    → verify + burn + attach the wallet to the caller's account
 *             (`link_web3_identity`), which refuses to move a wallet that
 *             already belongs to someone else.
 *   unlink  → detach a wallet, but only with a fresh ownership proof and only
 *             when another sign-in method remains (lockout guard).
 *   link_email / unlink_email → add or remove email+password as a sign-in
 *             method (email sign-in itself is set up by Supabase Auth; these
 *             only maintain the `email` identity that the method list and the
 *             lockout guard are built on).
 *
 * Everything privileged runs here with the service-role key; the browser only
 * ever sends public material (message, signature, address) plus its own
 * session token. No private key material is accepted, stored, or derived.
 */

import {
  adminClient,
  corsHeaders,
  getCaller,
  json,
  type Caller,
} from "../_shared/supabase.ts";
import { checkRateLimit, clientIp } from "../_shared/rate_limit.ts";
import {
  assertMessagePolicy,
  parseSiweMessage,
  parseSiwsMessage,
  type OriginPolicy,
} from "../_shared/siwe.ts";
import {
  normalizeEthereumAddress,
  normalizeSolanaAddress,
  verifyEthereumSignature,
  verifySolanaSignature,
  Web3VerificationError,
} from "../_shared/web3-verify.ts";

type Chain = "ethereum" | "solana";

const CHAINS: Chain[] = ["ethereum", "solana"];

/** How long a minted challenge stays usable. */
const NONCE_TTL_MS = 5 * 60_000;
/** How long a consumed challenge keeps proving wallet ownership for `unlink`. */
const PROOF_TTL_MS = 5 * 60_000;
/** How far back a signed message may date before it is considered stale. */
const DEFAULT_MAX_VALIDITY_MS = 5 * 60_000;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface ActionBody {
  action?: unknown;
  chain?: unknown;
  address?: unknown;
  message?: unknown;
  signature?: unknown;
  email?: unknown;
}

/** An error whose code and status are safe to show the caller. */
class HttpError extends Error {
  readonly code: string;
  readonly status: number;
  readonly headers: Record<string, string>;

  constructor(code: string, message: string, status: number, headers: Record<string, string> = {}) {
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.status = status;
    this.headers = headers;
  }
}

function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: { code: error.code, message: error.message } }, error.status);
  }

  // Signature / address verification failures carry a stable, user-safe code.
  if (error instanceof Web3VerificationError) {
    return json({ error: { code: error.code, message: error.message } }, 400);
  }

  // Errors raised by the SECURITY DEFINER routines carry a stable token as
  // their message; translate them instead of leaking SQL text.
  const message = String((error as { message?: unknown })?.message ?? error ?? "");
  const mapped = mapDatabaseError(message);
  if (mapped) return json({ error: { code: mapped.code, message: mapped.message } }, mapped.status);

  if (message.includes("SUPABASE_SERVICE_ROLE_KEY") || message.includes("SUPABASE_URL")) {
    return json(
      {
        error: {
          code: "SERVER_NOT_CONFIGURED",
          message:
            "Wallet authentication is not configured on this deployment: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing for the web3-auth function.",
        },
      },
      500,
    );
  }

  console.error("[web3-auth] unexpected failure:", message);
  return json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong validating that request." } },
    500,
  );
}

function mapDatabaseError(message: string): { code: string; message: string; status: number } | null {
  if (message.includes("LAST_SIGN_IN_METHOD")) {
    return {
      code: "LAST_SIGN_IN_METHOD",
      message: "That is the only way you can sign in right now. Add another sign-in method first.",
      status: 409,
    };
  }
  if (message.includes("WALLET_ALREADY_LINKED")) {
    return {
      code: "WALLET_ALREADY_LINKED",
      message: "That wallet already belongs to a different SiteSurveyor account.",
      status: 409,
    };
  }
  if (message.includes("WALLET_NOT_LINKED")) {
    return {
      code: "WALLET_NOT_LINKED",
      message: "That wallet is not linked to your account.",
      status: 404,
    };
  }
  if (message.includes("EMAIL_NOT_ON_ACCOUNT")) {
    return {
      code: "EMAIL_NOT_ON_ACCOUNT",
      message: "Confirm that email address on your account before linking it as a sign-in method.",
      status: 409,
    };
  }
  if (message.includes("INVALID_ADDRESS")) {
    return { code: "INVALID_ADDRESS", message: "That wallet address is not valid.", status: 400 };
  }
  if (message.includes("INVALID_EMAIL")) {
    return { code: "INVALID_EMAIL", message: "That email address is not valid.", status: 400 };
  }
  if (message.includes("NOT_AUTHENTICATED")) {
    return { code: "NOT_AUTHENTICATED", message: "Sign in to manage your sign-in methods.", status: 401 };
  }
  if (message.includes("UNSUPPORTED_CHAIN")) {
    return { code: "UNSUPPORTED_CHAIN", message: "That blockchain is not supported.", status: 400 };
  }
  return null;
}

// ── request helpers ──────────────────────────────────────────────────────────

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError("INVALID_REQUEST", `"${field}" is required.`, 400);
  }
  return value;
}

function requireChain(value: unknown): Chain {
  const chain = requireString(value, "chain");
  if (!CHAINS.includes(chain as Chain)) {
    throw new HttpError("UNSUPPORTED_CHAIN", "Only ethereum and solana are supported.", 400);
  }
  return chain as Chain;
}

function normalizeAddress(chain: Chain, raw: unknown): string {
  const address = requireString(raw, "address");
  return chain === "ethereum"
    ? normalizeEthereumAddress(address)
    : normalizeSolanaAddress(address);
}

function linkPurpose(chain: Chain): string {
  return chain === "ethereum" ? "siwe_link" : "siws_link";
}

const RATE_LIMITS: Record<string, { limit: number; windowMs: number }> = {
  nonce: { limit: 30, windowMs: 60_000 },
  consume: { limit: 30, windowMs: 60_000 },
  link: { limit: 10, windowMs: 60_000 },
  unlink: { limit: 10, windowMs: 60_000 },
  link_email: { limit: 5, windowMs: 60_000 },
  unlink_email: { limit: 5, windowMs: 60_000 },
};

function enforceRateLimit(action: string, req: Request, userId?: string): void {
  const limits = RATE_LIMITS[action];
  if (!limits) {
    throw new HttpError("UNKNOWN_ACTION", "Unknown action.", 400);
  }
  const ip = clientIp(req);
  const keys = [`${action}:ip:${ip}`];
  if (userId) keys.push(`${action}:user:${userId}`);

  for (const key of keys) {
    const result = checkRateLimit({ key, ...limits });
    if (!result.allowed) {
      throw new HttpError(
        "RATE_LIMITED",
        `Too many attempts. Try again in ${result.retryAfterSeconds} second${
          result.retryAfterSeconds === 1 ? "" : "s"
        }.`,
        429,
        { "Retry-After": String(result.retryAfterSeconds) },
      );
    }
  }
}

// ── origin / message policy ──────────────────────────────────────────────────

/**
 * Origins this deployment accepts signed messages for. Configured with
 * `AUTH_ALLOWED_ORIGINS` (comma-separated absolute origins); defaults to the
 * local dev server so `deno serve` works out of the box.
 */
function originPolicy(): OriginPolicy {
  const raw =
    Deno.env.get("AUTH_ALLOWED_ORIGINS")?.trim() || "http://localhost:5174";
  const allowedOrigins = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0) {
    throw new HttpError(
      "SERVER_NOT_CONFIGURED",
      "No allowed origins are configured for signed wallet messages (AUTH_ALLOWED_ORIGINS).",
      500,
    );
  }

  const allowedDomains = new Set<string>();
  for (const origin of allowedOrigins) {
    try {
      const url = new URL(origin);
      allowedDomains.add(url.host);
      allowedDomains.add(url.hostname);
    } catch {
      throw new HttpError(
        "SERVER_NOT_CONFIGURED",
        `AUTH_ALLOWED_ORIGINS contains a value that is not an origin: ${origin}`,
        500,
      );
    }
  }

  const configuredValidity = Number(Deno.env.get("AUTH_MESSAGE_MAX_VALIDITY_MS"));
  const maxValidityMs =
    Number.isFinite(configuredValidity) && configuredValidity > 0
      ? configuredValidity
      : DEFAULT_MAX_VALIDITY_MS;

  return { allowedDomains: [...allowedDomains], allowedOrigins, maxValidityMs };
}

/** The browser origin this request came from, when it declares one. */
function requestOrigin(req: Request): string | null {
  const origin = req.headers.get("Origin");
  if (!origin || origin === "null") return null;
  return origin;
}

interface VerifiedProof {
  chain: Chain;
  address: string;
  nonce: string;
  domain: string;
  statement?: string;
}

/**
 * Parse, policy-check and cryptographically verify a signed wallet message.
 * Throws `HttpError` when anything about it cannot be trusted.
 */
function verifySignedMessage(params: {
  chain: Chain;
  message: string;
  signature: string;
  req: Request;
}): VerifiedProof {
  const policy = originPolicy();

  if (params.chain === "ethereum") {
    const parsed = guard(() => {
      const message = parseSiweMessage(params.message);
      assertMessagePolicy(message, policy);
      return message;
    });
    assertRequestOrigin(params.req, parsed.uri);
    const address = normalizeEthereumAddress(parsed.address);
    verifyEthereumSignature({
      message: params.message,
      signature: params.signature,
      expectedAddress: address,
    });
    return {
      chain: "ethereum",
      address,
      nonce: parsed.nonce,
      domain: parsed.domain,
      statement: parsed.statement,
    };
  }

  const parsed = guard(() => {
    const message = parseSiwsMessage(params.message);
    assertMessagePolicy(message, policy);
    return message;
  });
  assertRequestOrigin(params.req, parsed.uri);
  const address = normalizeSolanaAddress(parsed.address);
  verifySolanaSignature({
    message: params.message,
    signature: params.signature,
    expectedAddress: address,
  });
  return {
    chain: "solana",
    address,
    nonce: parsed.nonce,
    domain: parsed.domain,
    statement: parsed.statement,
  };
}

/**
 * The SIWE/SIWS parsers throw plain `Error`s with deliberately user-readable
 * reasons. Re-tag them as caller-safe HTTP errors; anything already tagged
 * (e.g. an origin-policy failure) passes through untouched.
 */
function guard<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const reason = String((error as { message?: unknown })?.message ?? error ?? "");
    throw new HttpError(
      "INVALID_MESSAGE",
      reason || "That signed message could not be read.",
      400,
    );
  }
}

function assertRequestOrigin(req: Request, messageUri: string): void {
  const origin = requestOrigin(req);
  if (!origin) return;
  let uriOrigin: string;
  try {
    uriOrigin = new URL(messageUri).origin;
  } catch {
    throw new HttpError("INVALID_MESSAGE", "Signed message URI is not a valid URL.", 400);
  }
  if (origin !== uriOrigin) {
    throw new HttpError(
      "ORIGIN_MISMATCH",
      "This request came from a different origin than the signed message.",
      403,
    );
  }
}

// ── nonce lifecycle ──────────────────────────────────────────────────────────

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function issueNonce(params: {
  userId: string;
  chain: Chain;
  address: string;
  ip: string;
}): Promise<{ nonce: string; expiresAt: string; chain: Chain; address: string }> {
  const db = adminClient();
  const nonce = randomNonce();
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString();

  const { error } = await db.from("auth_nonces").insert({
    nonce,
    purpose: linkPurpose(params.chain),
    user_id: params.userId,
    chain: params.chain,
    address: params.address,
    client_hash: await sha256Hex(params.ip),
    expires_at: expiresAt,
  });
  if (error) {
    console.error("[web3-auth] could not store challenge:", error.message);
    throw new HttpError(
      "SERVER_ERROR",
      "Could not create a sign-in challenge. Check that the unified_auth_methods migration has been applied.",
      500,
    );
  }

  // Opportunistic housekeeping; never worth failing the request over.
  if (Math.random() < 0.05) {
    try {
      await db.rpc("prune_auth_nonces");
    } catch {
      // ignore
    }
  }

  return { nonce, expiresAt, chain: params.chain, address: params.address };
}

/**
 * Atomically burn a challenge. Exactly one caller can win this update, which
 * is what makes a captured message+signature single-use.
 */
async function consumeNonce(params: {
  proof: VerifiedProof;
  userId: string;
}): Promise<void> {
  const db = adminClient();
  const now = new Date().toISOString();

  const { data, error } = await db
    .from("auth_nonces")
    .update({ consumed_at: now })
    .eq("nonce", params.proof.nonce)
    .eq("purpose", linkPurpose(params.proof.chain))
    .eq("chain", params.proof.chain)
    .eq("address", params.proof.address)
    .eq("user_id", params.userId)
    .is("consumed_at", null)
    .gt("expires_at", now)
    .select("nonce");

  if (error) {
    console.error("[web3-auth] could not consume challenge:", error.message);
    throw new HttpError("SERVER_ERROR", "Could not validate that sign-in challenge.", 500);
  }
  if (!data || data.length !== 1) {
    throw new HttpError(
      "CHALLENGE_INVALID",
      "That sign-in challenge was already used or has expired. Please try again.",
      400,
    );
  }
}

/** Look for a recently consumed challenge proving the caller owns a wallet. */
async function findRecentProof(params: {
  userId: string;
  chain: Chain;
  address: string;
}): Promise<boolean> {
  const db = adminClient();
  const cutoff = new Date(Date.now() - PROOF_TTL_MS).toISOString();

  const { data, error } = await db
    .from("auth_nonces")
    .select("nonce")
    .eq("user_id", params.userId)
    .eq("purpose", linkPurpose(params.chain))
    .eq("chain", params.chain)
    .eq("address", params.address)
    .not("consumed_at", "is", null)
    .gte("consumed_at", cutoff)
    .limit(1);

  if (error) {
    console.error("[web3-auth] could not read ownership proof:", error.message);
    throw new HttpError("SERVER_ERROR", "Could not confirm wallet ownership.", 500);
  }
  return Boolean(data && data.length > 0);
}

// ── actions ──────────────────────────────────────────────────────────────────

async function handleNonce(req: Request, body: ActionBody, caller: Caller): Promise<Response> {
  enforceRateLimit("nonce", req, caller.id);
  const chain = requireChain(body.chain);
  const address = normalizeAddress(chain, body.address);
  const result = await issueNonce({
    userId: caller.id,
    chain,
    address,
    ip: clientIp(req),
  });
  return json({ ...result, expiresInMs: NONCE_TTL_MS });
}

async function handleConsume(req: Request, body: ActionBody, caller: Caller): Promise<Response> {
  enforceRateLimit("consume", req, caller.id);
  const chain = requireChain(body.chain);
  const proof = verifySignedMessage({
    chain,
    message: requireString(body.message, "message"),
    signature: requireString(body.signature, "signature"),
    req,
  });
  await consumeNonce({ proof, userId: caller.id });
  return json({ verified: true, chain: proof.chain, address: proof.address });
}

async function handleLink(req: Request, body: ActionBody, caller: Caller): Promise<Response> {
  enforceRateLimit("link", req, caller.id);
  const chain = requireChain(body.chain);
  const proof = verifySignedMessage({
    chain,
    message: requireString(body.message, "message"),
    signature: requireString(body.signature, "signature"),
    req,
  });
  await consumeNonce({ proof, userId: caller.id });

  const db = adminClient();
  const { error } = await db.rpc("link_web3_identity", {
    p_user_id: caller.id,
    p_chain: proof.chain,
    p_address: proof.address,
    p_identity_data: {
      domain: proof.domain,
      statement: proof.statement ?? "",
      network: "",
    },
  });
  if (error) throw error;

  return json({ linked: true, chain: proof.chain, address: proof.address });
}

async function handleUnlink(req: Request, body: ActionBody, caller: Caller): Promise<Response> {
  enforceRateLimit("unlink", req, caller.id);
  const chain = requireChain(body.chain);
  const address = normalizeAddress(chain, body.address);

  const proven = await findRecentProof({ userId: caller.id, chain, address });
  if (!proven) {
    throw new HttpError(
      "OWNERSHIP_PROOF_REQUIRED",
      "Sign the message with that wallet again to prove you still control it before removing it.",
      403,
    );
  }

  const db = adminClient();
  const { error } = await db.rpc("unlink_web3_identity", {
    p_user_id: caller.id,
    p_chain: chain,
    p_address: address,
  });
  if (error) throw error;

  // The proof has done its job; drop every consumed challenge for this wallet
  // so it cannot be replayed as proof later. Best effort — challenges expire.
  const { error: cleanupError } = await db
    .from("auth_nonces")
    .delete()
    .eq("user_id", caller.id)
    .eq("chain", chain)
    .eq("address", address)
    .not("consumed_at", "is", null);
  if (cleanupError) {
    console.warn("[web3-auth] could not clear spent proofs:", cleanupError.message);
  }

  return json({ unlinked: true, chain, address });
}

async function handleLinkEmail(req: Request, body: ActionBody, caller: Caller): Promise<Response> {
  enforceRateLimit("link_email", req, caller.id);
  const email = requireString(body.email, "email").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new HttpError("INVALID_EMAIL", "That email address is not valid.", 400);
  }

  if (!caller.email || caller.email.toLowerCase() !== email) {
    throw new HttpError(
      "EMAIL_NOT_ON_ACCOUNT",
      "Add and confirm that email address on your account first.",
      409,
    );
  }
  if (!caller.emailConfirmed) {
    throw new HttpError(
      "EMAIL_NOT_CONFIRMED",
      "Confirm that email address first — open the verification link we sent you.",
      409,
    );
  }

  const db = adminClient();
  const { error } = await db.rpc("link_email_identity", {
    p_user_id: caller.id,
    p_email: email,
  });
  if (error) throw error;

  return json({ linked: true, email });
}

async function handleUnlinkEmail(_req: Request, _body: ActionBody, caller: Caller): Promise<Response> {
  enforceRateLimit("unlink_email", _req, caller.id);
  const db = adminClient();
  const { error } = await db.rpc("unlink_email_signin", { p_user_id: caller.id });
  if (error) throw error;
  return json({ unlinked: true });
}

// ── entry point ──────────────────────────────────────────────────────────────

const ACTIONS = new Set([
  "nonce",
  "consume",
  "link",
  "unlink",
  "link_email",
  "unlink_email",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(
      { error: { code: "METHOD_NOT_ALLOWED", message: "Use POST for this endpoint." } },
      405,
    );
  }

  let body: ActionBody;
  try {
    body = await req.json();
  } catch {
    return json(
      { error: { code: "INVALID_BODY", message: "Request body must be a JSON object." } },
      400,
    );
  }

  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (!ACTIONS.has(action)) {
      throw new HttpError("UNKNOWN_ACTION", "Unknown action.", 400);
    }

    // Every action manages the caller's own account, so a valid session is
    // the minimum bar; wallet *sign-in* itself never reaches this function.
    const caller = await getCaller(req);
    if (!caller) {
      throw new HttpError(
        "NOT_AUTHENTICATED",
        "Sign in to manage your sign-in methods.",
        401,
      );
    }

    switch (action) {
      case "nonce":
        return await handleNonce(req, body, caller);
      case "consume":
        return await handleConsume(req, body, caller);
      case "link":
        return await handleLink(req, body, caller);
      case "unlink":
        return await handleUnlink(req, body, caller);
      case "link_email":
        return await handleLinkEmail(req, body, caller);
      case "unlink_email":
        return await handleUnlinkEmail(req, body, caller);
      default:
        throw new HttpError("UNKNOWN_ACTION", "Unknown action.", 400);
    }
  } catch (error) {
    return errorResponse(error);
  }
});
