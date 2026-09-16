import { describe, expect, it } from "vitest";
import {
  formatAuthRateLimitMessage,
  formatAuthUserFacingError,
  isEmailNotConfirmedError,
} from "./auth-errors.ts";

describe("formatAuthRateLimitMessage", () => {
  it("detects message substring", () => {
    expect(
      formatAuthRateLimitMessage(new Error("Email rate limit exceeded")),
    ).toContain("SMTP");
  });

  it("detects HTTP 429 status", () => {
    const err = Object.assign(new Error("Too Many Requests"), { status: 429 });
    expect(formatAuthRateLimitMessage(err)).toContain("SMTP");
  });

  it("returns null for unrelated errors", () => {
    expect(formatAuthRateLimitMessage(new Error("Invalid login"))).toBeNull();
  });
});

describe("formatAuthUserFacingError", () => {
  it("uses fallback for unknown errors", () => {
    expect(formatAuthUserFacingError(null, "Fallback.")).toBe("Fallback.");
  });

  it("uses string errors directly", () => {
    expect(formatAuthUserFacingError("Network failure")).toContain(
      "Network failure",
    );
  });

  it("extracts nested error messages", () => {
    const err = { error: { message: "Nested failure" } };
    expect(formatAuthUserFacingError(err)).toContain("Nested failure");
  });

  it("parses JSON-wrapped messages", () => {
    const err = { message: '{"message":"Wrapped json"}' };
    expect(formatAuthUserFacingError(err)).toContain("Wrapped json");
  });

  it("maps user_already_exists to a helpful message", () => {
    const err = Object.assign(new Error("User already registered"), {
      code: "user_already_exists",
    });
    expect(formatAuthUserFacingError(err)).toContain("already exists");
  });

  it("returns auth code/status when message is empty", () => {
    const err = { code: "unknown_auth_error", status: 400 };
    const out = formatAuthUserFacingError(err);
    expect(out).toContain("unknown_auth_error");
    expect(out).toContain("400");
  });

  it("does not render empty objects", () => {
    const out = formatAuthUserFacingError({}, "Fallback.");
    expect(out).not.toBe("{}");
    expect(out).toBe("Fallback.");
  });
});

describe("isEmailNotConfirmedError", () => {
  it("detects Supabase error code", () => {
    const err = Object.assign(new Error("anything"), {
      code: "email_not_confirmed",
    });
    expect(isEmailNotConfirmedError(err)).toBe(true);
  });

  it("detects classic 'Email not confirmed' message", () => {
    expect(isEmailNotConfirmedError(new Error("Email not confirmed"))).toBe(
      true,
    );
  });

  it("returns false for unrelated errors", () => {
    expect(
      isEmailNotConfirmedError(new Error("Invalid login credentials")),
    ).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isEmailNotConfirmedError(null)).toBe(false);
    expect(isEmailNotConfirmedError(undefined)).toBe(false);
  });
});
