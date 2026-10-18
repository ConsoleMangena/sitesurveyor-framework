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
});
