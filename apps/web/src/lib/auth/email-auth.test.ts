import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMainReset, mockRecoveryReset } = vi.hoisted(() => ({
  mockMainReset: vi.fn(),
  mockRecoveryReset: vi.fn(),
}));

vi.mock("../supabase/client.ts", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: mockMainReset,
    },
  },
  getRecoveryClient: () => ({
    auth: {
      resetPasswordForEmail: mockRecoveryReset,
    },
  }),
}));

import { sendPasswordReset } from "./email-auth.ts";

describe("sendPasswordReset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecoveryReset.mockResolvedValue({ data: {}, error: null });
  });

  it("asks for a link that any browser can open", async () => {
    await sendPasswordReset("  User@Example.com ");

    expect(mockRecoveryReset).toHaveBeenCalledTimes(1);
    expect(mockMainReset).not.toHaveBeenCalled();

    const [email, options] = mockRecoveryReset.mock.calls[0] as [
      string,
      { redirectTo: string },
    ];
    expect(email).toBe("user@example.com");
    expect(options.redirectTo).toContain("/reset-password");
  });

  it("surfaces a rejected request", async () => {
    mockRecoveryReset.mockResolvedValue({
      data: {},
      error: { message: "Too many requests" },
    });

    await expect(sendPasswordReset("user@example.com")).rejects.toThrow(
      "Too many requests",
    );
  });
});
