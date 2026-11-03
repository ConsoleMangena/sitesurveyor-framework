import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import { buildMethodList, parseWeb3ProviderId } from "./methods.ts";

/** Minimal User stand-in: buildMethodList only reads identities + email. */
function makeUser(
  identities: Array<{ id: string; provider: string; email?: string }>,
  overrides: Partial<User> = {},
): User {
  return {
    id: "u-1",
    email: null,
    email_confirmed_at: null,
    user_metadata: {},
    identities: identities.map((identity) => ({
      ...identity,
      identity_data: identity.email ? { email: identity.email } : {},
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      last_sign_in_at: "2026-01-01T00:00:00Z",
    })),
    ...overrides,
  } as unknown as User;
}

describe("parseWeb3ProviderId", () => {
  it("splits a web3 provider id into chain and address", () => {
    expect(
      parseWeb3ProviderId("web3:ethereum:0xAbC0000000000000000000000000000000000001"),
    ).toEqual({
      chain: "ethereum",
      address: "0xAbC0000000000000000000000000000000000001",
    });
  });

  it("parses solana provider ids", () => {
    expect(parseWeb3ProviderId("web3:solana:9xQeAbc")).toEqual({
      chain: "solana",
      address: "9xQeAbc",
    });
  });

  it("ignores non-web3 identities", () => {
    expect(parseWeb3ProviderId("email")).toBeNull();
    expect(parseWeb3ProviderId("github")).toBeNull();
  });
});

describe("buildMethodList", () => {
  it("reports no methods for an empty user", () => {
    const list = buildMethodList(makeUser([]));
    expect(list.methods).toEqual([]);
    expect(list.missingEmail).toBe(true);
  });

  it("lists email sign-in when the identity exists and the address is confirmed", () => {
    const user = makeUser(
      [{ id: "e-1", provider: "email", email: "sam@example.com" }],
      { email: "sam@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" },
    );

    const list = buildMethodList(user);
    expect(list.methods).toHaveLength(1);
    expect(list.methods[0]).toMatchObject({
      kind: "email",
      label: "Email & password",
      detail: "sam@example.com",
    });
    expect(list.missingEmail).toBe(false);
  });

  it("does not offer email sign-in when the address is unconfirmed", () => {
    const user = makeUser(
      [{ id: "e-1", provider: "email", email: "sam@example.com" }],
      // makeUser defaults `email_confirmed_at` to null: not confirmed yet.
      { email: "sam@example.com" },
    );

    const list = buildMethodList(user);
    expect(list.methods).toHaveLength(0);
    expect(list.missingEmail).toBe(true);
  });

  it("honours an explicit hasPassword=false over the identity proxy", () => {
    const user = makeUser(
      [{ id: "e-1", provider: "email", email: "sam@example.com" }],
      { email: "sam@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" },
    );

    expect(buildMethodList(user, { hasPassword: false }).methods).toHaveLength(0);
    expect(buildMethodList(user, { hasPassword: true }).methods).toHaveLength(1);
  });

  it("lists github alongside email", () => {
    const user = makeUser(
      [
        { id: "e-1", provider: "email", email: "sam@example.com" },
        { id: "g-1", provider: "github", email: "sam@users.noreply.github.com" },
      ],
      { email: "sam@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" },
    );

    const list = buildMethodList(user);
    expect(list.methods.map((m) => m.kind)).toEqual(["email", "github"]);
    expect(list.methods[1].detail).toBe("sam@users.noreply.github.com");
  });

  it("expands web3 identities into wallet methods with chain and address", () => {
    const user = makeUser([
      { id: "web3:ethereum:0x1111111111111111111111111111111111111111", provider: "web3" },
      { id: "web3:solana:9xQeSignatureAddressHere", provider: "web3" },
    ]);

    const list = buildMethodList(user);
    expect(list.methods.map((m) => m.kind)).toEqual(["wallet", "wallet"]);
    expect(list.methods[0]).toMatchObject({
      chain: "ethereum",
      address: "0x1111111111111111111111111111111111111111",
      label: "Ethereum wallet",
    });
    expect(list.methods[1]).toMatchObject({
      chain: "solana",
      label: "Solana wallet",
    });
    // Addresses are shortened for display, never shown in full.
    expect(list.methods[0].detail).toMatch(/^0x1111…1111$/);
  });

  it("marks the only method unremovable and everything else removable", () => {
    const single = buildMethodList(
      makeUser([{ id: "g-1", provider: "github" }]),
    );
    expect(single.methods[0].removable).toBe(false);

    const multiple = buildMethodList(
      makeUser([
        { id: "g-1", provider: "github" },
        { id: "web3:solana:9xQeAddress", provider: "web3" },
      ]),
    );
    expect(multiple.methods.every((m) => m.removable)).toBe(true);
    expect(multiple.methods).toHaveLength(2);
  });

  it("flags a missing email even when other methods exist", () => {
    const list = buildMethodList(
      makeUser([{ id: "web3:solana:9xQeAddress", provider: "web3" }]),
    );
    expect(list.missingEmail).toBe(true);
    expect(list.methods).toHaveLength(1);
  });
});
