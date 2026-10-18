import { describe, expect, it, vi } from "vitest";

vi.mock("../supabase/client.ts", () => ({
  supabase: { auth: {} },
  isOnline: () => true,
}));

import { loadStoredSession } from "./session.ts";

describe("session", () => {
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
});
