import { describe, expect, it } from "vitest";
import {
  getAuthUrlError,
  getPasswordRecoveryTokenHash,
  getPasswordRecoveryTokenType,
  hasPkceRecoveryCode,
  isPasswordRecoveryUrl,
} from "./auth-url.ts";

describe("auth URL handling", () => {
  it("reads OAuth errors returned in the fragment", () => {
    expect(
      getAuthUrlError(
        "http://tauri.localhost/auth/callback#error=access_denied&error_description=User+cancelled+sign-in",
      ),
    ).toBe("User cancelled sign-in");
  });

  it("does not decode an already-decoded error a second time", () => {
    expect(
      getAuthUrlError(
        "http://tauri.localhost/auth/callback?error_description=Progress+100%25+complete",
      ),
    ).toBe("Progress 100% complete");
  });

  it("recognizes both PKCE and implicit recovery links", () => {
    expect(
      isPasswordRecoveryUrl("http://tauri.localhost/reset-password?code=abc"),
    ).toBe(true);
    expect(
      isPasswordRecoveryUrl(
        "http://tauri.localhost/reset-password#access_token=abc&type=recovery",
      ),
    ).toBe(true);
    expect(isPasswordRecoveryUrl("http://tauri.localhost/reset-password")).toBe(
      false,
    );
  });

  it("recognizes a recovery link that carries a token hash", () => {
    expect(
      isPasswordRecoveryUrl(
        "http://tauri.localhost/reset-password?token_hash=abc&type=recovery",
      ),
    ).toBe(true);
    expect(
      getPasswordRecoveryTokenHash(
        "http://tauri.localhost/reset-password?token_hash=abc&type=recovery",
      ),
    ).toBe("abc");
    expect(
      getPasswordRecoveryTokenHash("http://tauri.localhost/reset-password"),
    ).toBeNull();
  });

  it("reads the verification type a token-hash link declares", () => {
    expect(
      getPasswordRecoveryTokenType(
        "http://tauri.localhost/reset-password?token_hash=abc&type=email",
      ),
    ).toBe("email");
    expect(
      getPasswordRecoveryTokenType(
        "http://tauri.localhost/reset-password?token_hash=abc",
      ),
    ).toBe("recovery");
  });

  it("spots a PKCE code that was never exchanged", () => {
    expect(
      hasPkceRecoveryCode("http://tauri.localhost/reset-password?code=abc"),
    ).toBe(true);
    expect(
      hasPkceRecoveryCode(
        "http://tauri.localhost/reset-password#access_token=abc&type=recovery",
      ),
    ).toBe(false);
  });
});
