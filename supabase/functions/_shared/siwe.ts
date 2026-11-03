/**
 * EIP-4361 (Sign-In With Ethereum) and Solana SIWS message parsing for the
 * `web3-auth` Edge Function.
 *
 * The wallet-signed message is the only thing standing between an anonymous
 * caller and a linked account, so parsing here is deliberately strict:
 * anything that does not match the specification is rejected rather than
 * guessed at. Nothing in this file trusts client-supplied fields without
 * checking them against the deployment's own origin and clock.
 */

// ── Ethereum / EIP-4361 ──────────────────────────────────────────────────────

export interface SiweMessage {
  domain: string;
  address: string;
  statement?: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function fail(reason: string): never {
  throw new Error(reason);
}

function readRequired(
  fields: Map<string, string>,
  key: string,
): string {
  const value = fields.get(key);
  if (value === undefined || value === "") {
    fail(`SIWE message is missing the "${key}" field`);
  }
  return value;
}

function parseTimestamp(value: string, field: string): number {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    fail(`SIWE message has an invalid "${field}" timestamp`);
  }
  return ms;
}

/**
 * Parse an EIP-4361 message. Throws with a user-safe reason when malformed.
 */
export function parseSiweMessage(raw: string): SiweMessage {
  if (typeof raw !== "string" || raw.length === 0) {
    fail("Signed message is empty");
  }
  if (raw.length > 20 * 1024) {
    fail("Signed message is too large");
  }
  // A SIWE message never contains a bare carriage return; wallets emit LF.
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  if (lines.length < 8) {
    fail("Signed message is not a valid SIWE message");
  }

  const header = /^(.+) wants you to sign in with your Ethereum account:$/.exec(
    lines[0],
  );
  if (!header) {
    fail("Signed message is missing the domain header");
  }
  const domain = header[1].trim();
  if (!domain) fail("Signed message has an empty domain");

  const address = lines[1].trim();
  if (!ETH_ADDRESS_RE.test(address)) {
    fail("Signed message has an invalid Ethereum address");
  }

  if (lines[2] !== "") {
    fail("Signed message is missing the address separator");
  }

  let index = 3;
  let statement: string | undefined;
  if (lines[index] !== "") {
    statement = lines[index];
    index += 1;
  }
  if (lines[index] !== "") {
    fail("Signed message is missing the statement separator");
  }
  index += 1;

  const fields = new Map<string, string>();
  const resources: string[] = [];
  let inResources = false;

  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "") continue;

    if (line.startsWith("- ")) {
      if (!inResources) {
        fail("Signed message has a resource without a Resources header");
      }
      resources.push(line.slice(2));
      continue;
    }

    // Field lines are "Key: value"; EIP-4361's `Resources:` header is the one
    // exception — it carries no value of its own and introduces the list.
    const separator = line.indexOf(": ");
    let key: string;
    let value: string;
    if (separator !== -1) {
      key = line.slice(0, separator);
      value = line.slice(separator + 2);
    } else if (line.endsWith(":")) {
      key = line.slice(0, -1);
      value = "";
    } else {
      fail("Signed message contains a malformed field line");
    }
    if (fields.has(key)) {
      fail(`Signed message repeats the "${key}" field`);
    }
    fields.set(key, value);
    inResources = key === "Resources";
  }

  const chainIdRaw = readRequired(fields, "Chain ID");
  if (!/^\d+$/.test(chainIdRaw)) {
    fail("Signed message has an invalid Chain ID");
  }

  const nonce = readRequired(fields, "Nonce");
  if (nonce.length < 8) {
    fail("Signed message nonce must be at least 8 characters");
  }
  if (!/^[0-9A-Za-z]+$/.test(nonce)) {
    fail("Signed message nonce must be alphanumeric");
  }

  const version = readRequired(fields, "Version");
  if (version !== "1") {
    fail("Signed message has an unsupported version");
  }

  const uri = readRequired(fields, "URI");
  const issuedAt = readRequired(fields, "Issued At");
  parseTimestamp(issuedAt, "Issued At");

  const expirationTime = fields.get("Expiration Time");
  if (expirationTime) parseTimestamp(expirationTime, "Expiration Time");
  const notBefore = fields.get("Not Before");
  if (notBefore) parseTimestamp(notBefore, "Not Before");

  return {
    domain,
    address: address.toLowerCase(),
    statement,
    uri,
    version,
    chainId: Number(chainIdRaw),
    nonce,
    issuedAt,
    expirationTime,
    notBefore,
    requestId: fields.get("Request ID"),
    resources: resources.length > 0 ? resources : undefined,
  };
}

// ── Solana (SIWS) ────────────────────────────────────────────────────────────

export interface SiwsMessage {
  domain: string;
  address: string;
  statement?: string;
  uri: string;
  version: string;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
}

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Parse the Sign-In With Solana message produced by this application.
 * Layout mirrors EIP-4361 so the two flows behave identically.
 */
export function parseSiwsMessage(raw: string): SiwsMessage {
  if (typeof raw !== "string" || raw.length === 0) {
    fail("Signed message is empty");
  }
  if (raw.length < 64 || raw.length > 20 * 1024) {
    fail("Signed message has an unexpected length");
  }
  const lines = raw.replace(/\r\n/g, "\n").split("\n");

  const header = /^(.+) wants you to sign in with your Solana account:$/.exec(
    lines[0],
  );
  if (!header) {
    fail("Signed message is missing the domain header");
  }
  const domain = header[1].trim();

  const address = (lines[1] ?? "").trim();
  if (!SOLANA_ADDRESS_RE.test(address)) {
    fail("Signed message has an invalid Solana address");
  }
  if (lines[2] !== "") {
    fail("Signed message is missing the address separator");
  }

  let index = 3;
  let statement: string | undefined;
  if (lines[index] !== "" && lines[index] !== undefined) {
    statement = lines[index];
    index += 1;
  }
  if (lines[index] !== "") {
    fail("Signed message is missing the statement separator");
  }
  index += 1;

  const fields = new Map<string, string>();
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "") continue;
    const separator = line.indexOf(": ");
    if (separator === -1) {
      fail("Signed message contains a malformed field line");
    }
    const key = line.slice(0, separator);
    if (fields.has(key)) {
      fail(`Signed message repeats the "${key}" field`);
    }
    fields.set(key, line.slice(separator + 2));
  }

  const nonce = readRequired(fields, "Nonce");
  if (nonce.length < 8 || !/^[0-9A-Za-z]+$/.test(nonce)) {
    fail("Signed message nonce must be at least 8 alphanumeric characters");
  }
  const version = readRequired(fields, "Version");
  if (version !== "1") {
    fail("Signed message has an unsupported version");
  }
  const uri = readRequired(fields, "URI");
  const issuedAt = readRequired(fields, "Issued At");
  parseTimestamp(issuedAt, "Issued At");
  const expirationTime = fields.get("Expiration Time");
  if (expirationTime) parseTimestamp(expirationTime, "Expiration Time");

  return {
    domain,
    address,
    statement,
    uri,
    version,
    nonce,
    issuedAt,
    expirationTime,
  };
}

// ── Shared policy checks ─────────────────────────────────────────────────────

export interface OriginPolicy {
  /** Hosts (optionally `host:port`) this deployment signs messages for. */
  allowedDomains: string[];
  /** Absolute origins, e.g. `https://example.com` — checked against `uri`. */
  allowedOrigins: string[];
  /** Maximum accepted age of a signed message, in milliseconds. */
  maxValidityMs: number;
}

/**
 * Enforce the parts of a signed message the server must never take on trust:
 * it was minted for *this* deployment, it has not expired, and it was not
 * issued so far in the future that a stolen message stays valid indefinitely.
 */
export function assertMessagePolicy(
  message: {
    domain: string;
    uri: string;
    issuedAt: string;
    expirationTime?: string;
    notBefore?: string;
  },
  policy: OriginPolicy,
  now: Date = new Date(),
): void {
  const uriParts = safeParseUrl(message.uri);
  if (!uriParts) fail("Signed message URI is not a valid URL");

  // The advertised `domain` and the URI the message was minted for must agree,
  // otherwise a message minted for one surface could be replayed on another
  // that shares an allowed origin.
  const domain = message.domain.trim().toLowerCase();
  if (domain !== uriParts.host.toLowerCase() && domain !== uriParts.hostname.toLowerCase()) {
    fail("Signed message domain does not match its URI");
  }

  const uriOrigin = uriParts.origin;

  const hostname = uriParts.hostname;
  const isLocalhost = hostname === "localhost";
  const host = uriParts.host;
  if (
    !isLocalhost &&
    !policy.allowedDomains.includes(host) &&
    !policy.allowedDomains.includes(hostname)
  ) {
    fail("Signed message domain does not match this deployment");
  }

  if (!policy.allowedOrigins.includes(uriOrigin)) {
    fail("Signed message was issued for a different application");
  }

  const issuedAtMs = Date.parse(message.issuedAt);
  if (issuedAtMs - now.getTime() > 60_000) {
    fail("Signed message was issued in the future");
  }
  if (now.getTime() - issuedAtMs > policy.maxValidityMs) {
    fail("Signed message has expired");
  }

  if (message.expirationTime) {
    const expiresMs = Date.parse(message.expirationTime);
    if (now.getTime() > expiresMs) {
      fail("Signed message has expired");
    }
  }
  if (message.notBefore) {
    const notBeforeMs = Date.parse(message.notBefore);
    if (now.getTime() < notBeforeMs) {
      fail("Signed message is not valid yet");
    }
  }
}

function safeParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
