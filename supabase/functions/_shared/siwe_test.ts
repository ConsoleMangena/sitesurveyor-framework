/**
 * Tests for the EIP-4361 / SIWS message parser and the origin/expiry policy
 * that guards every wallet signature the `web3-auth` function accepts.
 */

import {
  assertMessagePolicy,
  parseSiweMessage,
  parseSiwsMessage,
  type OriginPolicy,
} from "./siwe.ts";
import { assertEquals, assertThrows } from "jsr:@std/assert@1";

const ETH_ADDRESS = "0x52908400098527886E0F7030069857D2E4169EE7";
const SOLANA_ADDRESS = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T"; // base58 of 32 bytes

interface SiweOverrides {
  header?: string;
  address?: string;
  statement?: string | null;
  fields?: Record<string, string>;
  resources?: string[];
}

/** Build a well-formed EIP-4361 message, then apply targeted mutations. */
function buildSiwe(overrides: SiweOverrides = {}): string {
  const lines: string[] = [
    overrides.header ??
      "example.com wants you to sign in with your Ethereum account:",
    overrides.address ?? ETH_ADDRESS,
    "",
  ];

  // With a statement the layout is: address, blank, statement, blank, fields;
  // without one the statement line is still there, just empty.
  lines.push(overrides.statement === null ? "" : overrides.statement ?? "Sign in to SiteSurveyor");
  lines.push("");

  const fields: Record<string, string> = {
    "URI": "https://example.com/login",
    "Version": "1",
    "Chain ID": "1",
    "Nonce": "32891756",
    "Issued At": "2026-01-01T00:00:00.000Z",
    ...overrides.fields,
  };

  if (overrides.resources && overrides.resources.length > 0) {
    fields["Resources"] = "";
  }

  for (const [key, value] of Object.entries(fields)) {
    if (key === "Resources") continue;
    lines.push(`${key}: ${value}`);
  }
  if (overrides.resources) {
    lines.push("Resources:");
    for (const resource of overrides.resources) lines.push(`- ${resource}`);
  }

  return lines.join("\n");
}

interface SiwsOverrides {
  header?: string;
  address?: string;
  statement?: string | null;
  fields?: Record<string, string>;
}

/** Build a well-formed SIWS message mirroring the EIP-4361 layout. */
function buildSiws(overrides: SiwsOverrides = {}): string {
  const lines: string[] = [
    overrides.header ?? "example.com wants you to sign in with your Solana account:",
    overrides.address ?? SOLANA_ADDRESS,
    "",
  ];

  lines.push(overrides.statement === null ? "" : overrides.statement ?? "Sign in to SiteSurveyor");
  lines.push("");

  const fields: Record<string, string> = {
    "URI": "https://example.com/login",
    "Version": "1",
    "Nonce": "32891756",
    "Issued At": "2026-01-01T00:00:00.000Z",
    ...overrides.fields,
  };
  for (const [key, value] of Object.entries(fields)) {
    lines.push(`${key}: ${value}`);
  }

  return lines.join("\n");
}

// ── EIP-4361 parsing ─────────────────────────────────────────────────────────

Deno.test("parseSiweMessage reads every mandatory field", () => {
  const message = parseSiweMessage(buildSiwe());

  assertEquals(message.domain, "example.com");
  assertEquals(message.address, ETH_ADDRESS.toLowerCase());
  assertEquals(message.statement, "Sign in to SiteSurveyor");
  assertEquals(message.uri, "https://example.com/login");
  assertEquals(message.version, "1");
  assertEquals(message.chainId, 1);
  assertEquals(message.nonce, "32891756");
  assertEquals(message.issuedAt, "2026-01-01T00:00:00.000Z");
  assertEquals(message.expirationTime, undefined);
  assertEquals(message.resources, undefined);
});

Deno.test("parseSiweMessage handles a statement-less message", () => {
  const message = parseSiweMessage(buildSiwe({ statement: null }));
  assertEquals(message.statement, undefined);
  assertEquals(message.nonce, "32891756");
});

Deno.test("parseSiweMessage reads optional timestamps and resources", () => {
  const message = parseSiweMessage(
    buildSiwe({
      fields: {
        "Expiration Time": "2026-01-01T00:05:00.000Z",
        "Not Before": "2025-12-31T23:59:00.000Z",
        "Request ID": "req-1",
      },
      resources: ["https://example.com/terms", "https://example.com/privacy"],
    }),
  );

  assertEquals(message.expirationTime, "2026-01-01T00:05:00.000Z");
  assertEquals(message.notBefore, "2025-12-31T23:59:00.000Z");
  assertEquals(message.requestId, "req-1");
  assertEquals(message.resources, [
    "https://example.com/terms",
    "https://example.com/privacy",
  ]);
});

Deno.test("parseSiweMessage rejects a wrong domain header", () => {
  assertThrows(
    () => parseSiweMessage(buildSiwe({ header: "example.com asks you to sign in" })),
    Error,
    "domain header",
  );
});

Deno.test("parseSiweMessage rejects a non-Ethereum address", () => {
  assertThrows(
    () => parseSiweMessage(buildSiwe({ address: "not-an-address" })),
    Error,
    "Ethereum address",
  );
});

Deno.test("parseSiweMessage rejects a missing statement separator", () => {
  // A statement directly followed by fields (no blank line between them).
  const malformed = [
    "example.com wants you to sign in with your Ethereum account:",
    ETH_ADDRESS,
    "",
    "Sign in to SiteSurveyor",
    "URI: https://example.com/login",
    "Version: 1",
    "Chain ID: 1",
    "Nonce: 32891756",
    "Issued At: 2026-01-01T00:00:00.000Z",
  ].join("\n");
  assertThrows(() => parseSiweMessage(malformed), Error, "separator");
});

Deno.test("parseSiweMessage rejects a short nonce", () => {
  assertThrows(
    () => parseSiweMessage(buildSiwe({ fields: { "Nonce": "abc" } })),
    Error,
    "nonce",
  );
});

Deno.test("parseSiweMessage rejects a non-alphanumeric nonce", () => {
  assertThrows(
    () => parseSiweMessage(buildSiwe({ fields: { "Nonce": "abcd-efgh" } })),
    Error,
    "nonce",
  );
});

Deno.test("parseSiweMessage rejects an unsupported version", () => {
  assertThrows(
    () => parseSiweMessage(buildSiwe({ fields: { "Version": "2" } })),
    Error,
    "version",
  );
});

Deno.test("parseSiweMessage rejects a non-numeric chain id", () => {
  assertThrows(
    () => parseSiweMessage(buildSiwe({ fields: { "Chain ID": "mainnet" } })),
    Error,
    "Chain ID",
  );
});

Deno.test("parseSiweMessage rejects a duplicated field", () => {
  const duplicated = `${buildSiwe()}\nNonce: 32891756`;
  assertThrows(() => parseSiweMessage(duplicated), Error, "repeats");
});

Deno.test("parseSiweMessage rejects an unparseable issued-at timestamp", () => {
  assertThrows(
    () => parseSiweMessage(buildSiwe({ fields: { "Issued At": "yesterday" } })),
    Error,
    "Issued At",
  );
});

Deno.test("parseSiweMessage rejects an oversized payload", () => {
  const huge = `${buildSiwe()}\n- ${"x".repeat(30 * 1024)}`;
  assertThrows(() => parseSiweMessage(huge), Error, "large");
});

Deno.test("parseSiweMessage rejects an empty message", () => {
  assertThrows(() => parseSiweMessage(""), Error, "empty");
});

// ── SIWS parsing ─────────────────────────────────────────────────────────────

Deno.test("parseSiwsMessage reads every mandatory field", () => {
  const message = parseSiwsMessage(buildSiws());

  assertEquals(message.domain, "example.com");
  assertEquals(message.address, SOLANA_ADDRESS);
  assertEquals(message.statement, "Sign in to SiteSurveyor");
  assertEquals(message.uri, "https://example.com/login");
  assertEquals(message.version, "1");
  assertEquals(message.nonce, "32891756");
  assertEquals(message.issuedAt, "2026-01-01T00:00:00.000Z");
});

Deno.test("parseSiwsMessage handles a statement-less message", () => {
  const message = parseSiwsMessage(buildSiws({ statement: null }));
  assertEquals(message.statement, undefined);
  assertEquals(message.address, SOLANA_ADDRESS);
});

Deno.test("parseSiwsMessage rejects a non-Solana address", () => {
  assertThrows(
    () => parseSiwsMessage(buildSiws({ address: ETH_ADDRESS })),
    Error,
    "Solana address",
  );
});

Deno.test("parseSiwsMessage rejects a base58 address with an illegal character", () => {
  // '0', 'O', 'I' and 'l' are excluded from the base58 alphabet.
  assertThrows(
    () => parseSiwsMessage(buildSiws({ address: `0${SOLANA_ADDRESS.slice(1)}` })),
    Error,
    "Solana address",
  );
});

Deno.test("parseSiwsMessage rejects a message that is too short to be SIWS", () => {
  assertThrows(() => parseSiwsMessage("too short"), Error, "length");
});

// ── origin / expiry policy ───────────────────────────────────────────────────

const POLICY: OriginPolicy = {
  allowedDomains: ["example.com"],
  allowedOrigins: ["https://example.com"],
  maxValidityMs: 5 * 60_000,
};

function policyMessage(overrides: Partial<{
  domain: string;
  uri: string;
  issuedAt: string;
  expirationTime: string;
  notBefore: string;
}> = {}) {
  return {
    domain: overrides.domain ?? "example.com",
    uri: overrides.uri ?? "https://example.com/login",
    issuedAt: overrides.issuedAt ?? "2026-01-01T00:00:00.000Z",
    expirationTime: overrides.expirationTime,
    notBefore: overrides.notBefore,
  };
}

const NOW = new Date("2026-01-01T00:00:30.000Z");

Deno.test("assertMessagePolicy accepts a message minted moments ago on this origin", () => {
  assertMessagePolicy(policyMessage(), POLICY, NOW); // must not throw
});

Deno.test("assertMessagePolicy rejects a message minted over an unexpected scheme", () => {
  // Same host, wrong scheme: the domain checks pass but the origin check must
  // still refuse a downgrade to plain HTTP.
  assertThrows(
    () =>
      assertMessagePolicy(
        policyMessage({ uri: "http://example.com/login" }),
        POLICY,
        NOW,
      ),
    Error,
    "different application",
  );
});

Deno.test("assertMessagePolicy rejects a domain that disagrees with the URI", () => {
  assertThrows(
    () => assertMessagePolicy(policyMessage({ domain: "evil.example.net" }), POLICY, NOW),
    Error,
    "does not match",
  );
});

Deno.test("assertMessagePolicy rejects a URI host outside the allowed domains", () => {
  assertThrows(
    () => assertMessagePolicy(
      policyMessage({ uri: "https://other.example.org/login", domain: "other.example.org" }),
      POLICY,
      NOW,
    ),
    Error,
    "does not match this deployment",
  );
});

Deno.test("assertMessagePolicy rejects a message issued in the future", () => {
  assertThrows(
    () => assertMessagePolicy(policyMessage({ issuedAt: "2026-01-01T00:02:00.000Z" }), POLICY, NOW),
    Error,
    "future",
  );
});

Deno.test("assertMessagePolicy rejects a message older than the validity window", () => {
  const old = new Date(NOW.getTime() - 6 * 60_000).toISOString();
  assertThrows(
    () => assertMessagePolicy(policyMessage({ issuedAt: old }), POLICY, NOW),
    Error,
    "expired",
  );
});

Deno.test("assertMessagePolicy rejects an expired expiration time", () => {
  assertThrows(
    () => assertMessagePolicy(
      policyMessage({ expirationTime: "2025-12-31T23:59:00.000Z" }),
      POLICY,
      NOW,
    ),
    Error,
    "expired",
  );
});

Deno.test("assertMessagePolicy rejects a message that is not valid yet", () => {
  assertThrows(
    () => assertMessagePolicy(
      policyMessage({ notBefore: "2026-01-01T00:10:00.000Z" }),
      POLICY,
      NOW,
    ),
    Error,
    "not valid yet",
  );
});

Deno.test("assertMessagePolicy accepts localhost for local development", () => {
  const localPolicy: OriginPolicy = {
    allowedDomains: [],
    allowedOrigins: ["http://localhost:5174"],
    maxValidityMs: 5 * 60_000,
  };
  assertMessagePolicy(
    {
      domain: "localhost:5174",
      uri: "http://localhost:5174/login",
      issuedAt: "2026-01-01T00:00:00.000Z",
    },
    localPolicy,
    NOW,
  ); // must not throw
});

Deno.test("assertMessagePolicy rejects an unparseable URI", () => {
  assertThrows(
    () => assertMessagePolicy(policyMessage({ uri: "not a url" }), POLICY, NOW),
    Error,
    "not a valid URL",
  );
});
