import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSignInWithWeb3 = vi.fn();
const mockUpdateUser = vi.fn();
const mockUpsert = vi.fn();
const mockRpc = vi.fn();

vi.mock("../supabase/client.ts", () => ({
  supabase: {
    auth: {
      signInWithWeb3: (...args: unknown[]) => mockSignInWithWeb3(...args),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
    from: () => ({
      upsert: (...args: unknown[]) => mockUpsert(...args),
    }),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
  isOnline: () => true,
}));

import {
  loadStoredSession,
  signInWithSolanaWallet,
  signUpWithSolanaWallet,
} from "./session.ts";

describe("session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loadStoredSession returns null when no sb- auth token exists", () => {
    localStorage.clear();
    expect(loadStoredSession()).toBeNull();
  });

  it("loadStoredSession parses a stored sb- auth token entry", () => {
    localStorage.clear();
    localStorage.setItem(
      "sb-test-auth-token",
      JSON.stringify({
        access_token: "at",
        refresh_token: "rt",
        expires_at: 1,
        user: { id: "u1" },
      }),
    );
    const session = loadStoredSession();
    expect(session?.access_token).toBe("at");
    expect(session?.user?.id).toBe("u1");
  });

  it("signInWithSolanaWallet delegates to supabase.auth.signInWithWeb3 with solana chain", async () => {
    mockSignInWithWeb3.mockResolvedValueOnce({
      data: { session: { access_token: "tok" }, user: { id: "sol-user-1" } },
      error: null,
    });

    const dummyWallet = { publicKey: { toBase58: () => "8xK3..." } };
    const res = await signInWithSolanaWallet(dummyWallet, { statement: "Custom SIWS statement" });

    expect(mockSignInWithWeb3).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: "solana",
        wallet: dummyWallet,
        statement: "Custom SIWS statement",
        options: expect.objectContaining({
          url: window.location.origin,
        }),
      }),
    );
    expect(res.user?.id).toBe("sol-user-1");
  });

  it("signInWithSolanaWallet hides wallet signIn so auth-js signs the SIWS message", async () => {
    mockSignInWithWeb3.mockResolvedValueOnce({
      data: { session: { access_token: "tok" }, user: { id: "mwa-user" } },
      error: null,
    });

    const signIn = vi.fn(async () => {
      throw new Error("Sign in failed, no sign in result returned by wallet");
    });
    const signMessage = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const publicKey = { toBase58: () => "MWAWalletAddress" };
    const mwaAdapter = { publicKey, signIn, signMessage, name: "Mobile Wallet Adapter" };

    await signInWithSolanaWallet(mwaAdapter);

    const passedWallet = mockSignInWithWeb3.mock.calls[0]?.[0]?.wallet as {
      publicKey: typeof publicKey;
      signMessage: (message: Uint8Array, encoding?: string) => Promise<Uint8Array>;
      signIn?: unknown;
    };
    expect(passedWallet).not.toBe(mwaAdapter);
    expect(passedWallet.signIn).toBeUndefined();
    expect(passedWallet.publicKey).toBe(publicKey);

    const message = new Uint8Array([9, 9]);
    await expect(passedWallet.signMessage(message, "utf8")).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(signMessage).toHaveBeenCalledWith(message, "utf8");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("signUpWithSolanaWallet authorizes, updates metadata, and upserts profile", async () => {
    mockSignInWithWeb3.mockResolvedValueOnce({
      data: { session: { access_token: "tok" }, user: { id: "new-user-42" } },
      error: null,
    });
    mockUpdateUser.mockResolvedValueOnce({ data: {}, error: null });
    mockUpsert.mockResolvedValueOnce({ data: {}, error: null });
    mockRpc.mockResolvedValueOnce({ data: "ws-new-id", error: null });

    const dummyWallet = { publicKey: { toBase58: () => "9yL4..." } };
    const res = await signUpWithSolanaWallet(dummyWallet, {
      fullName: "Jane Doe, PLS",
      accountType: "business",
      companyName: "Acme Surveying Ltd",
      email: "jane@acmesurvey.com",
    });

    expect(mockSignInWithWeb3).toHaveBeenCalled();
    expect(mockUpdateUser).toHaveBeenCalledWith({
      data: expect.objectContaining({
        full_name: "Jane Doe, PLS",
        account_type: "business",
        company: "Acme Surveying Ltd",
      }),
    });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "new-user-42",
        full_name: "Jane Doe, PLS",
        auth_signup_account_type: "business",
        company_name: "Acme Surveying Ltd",
        email: "jane@acmesurvey.com",
      }),
      { onConflict: "id" },
    );
    expect(mockRpc).toHaveBeenCalledWith("create_business_workspace", {
      workspace_name: "Acme Surveying Ltd",
    });
    expect(res.user?.id).toBe("new-user-42");
  });
});
