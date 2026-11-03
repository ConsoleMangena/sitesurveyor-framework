import { describe, expect, it } from "vitest";
import { formatAuthUserFacingError } from "./auth-errors.ts";

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

  describe("redirect-based provider sign-in errors", () => {
    it("explains a GitHub profile fetch failure", () => {
      const out = formatAuthUserFacingError(
        "Error getting user profile from external provider",
      );
      expect(out).toContain("wouldn't hand your profile back");
      expect(out).not.toContain("external provider");
    });

    it("explains a rejected authorization code", () => {
      const out = formatAuthUserFacingError(
        "Unable to exchange external code: abcd1234",
      );
      expect(out).toContain("rejected that sign-in attempt");
      expect(out).not.toContain("abcd1234");
    });

    it("explains a disabled provider", () => {
      expect(formatAuthUserFacingError("Provider is not enabled")).toContain(
        "isn't enabled on this deployment",
      );
    });

    it("explains an expired sign-in state", () => {
      expect(
        formatAuthUserFacingError("For security, this session has been expired."),
      ).toContain("expired");
      expect(formatAuthUserFacingError("OAuth state expired")).toContain(
        "expired",
      );
    });

    it("explains a disallowed redirect", () => {
      expect(
        formatAuthUserFacingError("Redirect is not allowed as an origin"),
      ).toContain("allowed redirect list");
    });

    it("explains a rejected account insert", () => {
      const out = formatAuthUserFacingError("Database error saving new user");
      expect(out).toContain("already attached to another account");
      expect(out).not.toContain("Database error");
    });

    it("leaves an unrecognised provider message intact", () => {
      expect(
        formatAuthUserFacingError("Some future GoTrue wording", "Fallback."),
      ).toContain("Some future GoTrue wording");
    });
  });

  describe("database refusals during account setup", () => {
    it("explains a row-level security rejection", () => {
      const out = formatAuthUserFacingError(
        'new row violates row-level security policy for table "profiles"',
      );
      expect(out).toContain("wouldn't accept the account details");
      expect(out).not.toContain("row-level security policy");
    });

    it("explains an email already owned by another account", () => {
      const out = formatAuthUserFacingError(
        'duplicate key value violates unique constraint "profiles_email_key"',
      );
      expect(out).toContain("already belongs to another SiteSurveyor account");
      expect(out).not.toContain("duplicate key");
    });
  });
});
