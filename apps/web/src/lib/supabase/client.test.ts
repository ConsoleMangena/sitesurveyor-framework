import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn((..._args: unknown[]) => ({ auth: {} })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

async function loadClient(hash = "") {
  vi.resetModules();
  window.history.replaceState({}, "", `/reset-password${hash}`);
  return import("./client.ts");
}

describe("supabase client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses PKCE for an ordinary arrival", async () => {
    await loadClient();

    const options = mockCreateClient.mock.calls[0][2] as {
      auth: { flowType: string };
    };
    expect(options.auth.flowType).toBe("pkce");
  });

  it("uses the implicit flow when the link carries a session in the fragment", async () => {
    await loadClient("#access_token=abc&type=recovery");

    const options = mockCreateClient.mock.calls[0][2] as {
      auth: { flowType: string };
    };
    expect(options.auth.flowType).toBe("implicit");
  });

  it("requests recovery links without a PKCE challenge", async () => {
    const { getRecoveryClient } = await loadClient();
    mockCreateClient.mockClear();

    const client = getRecoveryClient();

    expect(client).toBe(getRecoveryClient());
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    const options = mockCreateClient.mock.calls[0][2] as {
      auth: {
        flowType: string;
        persistSession: boolean;
        detectSessionInUrl: boolean;
      };
    };
    expect(options.auth.flowType).toBe("implicit");
    expect(options.auth.persistSession).toBe(false);
    expect(options.auth.detectSessionInUrl).toBe(false);
  });
});
