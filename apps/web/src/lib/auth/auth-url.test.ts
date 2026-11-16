import { describe, expect, it } from "vitest";
import {
  getAuthUrlError,
  getPasswordRecoveryTokenHash,
  getPasswordRecoveryTokenType,
  hasPkceRecoveryCode,
  isPasswordRecoveryUrl,
  isRecoveryArrivalUrl,
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

  describe("isRecoveryArrivalUrl", () => {
    it("recognizes a dashboard recovery link that fell back to the site root", () => {
      expect(
        isRecoveryArrivalUrl(
          "https://sitesurveyor.tech/#access_token=abc&refresh_token=def&type=recovery",
        ),
      ).toBe(true);
    });

    it("recognizes query-string arrivals on any route", () => {
      expect(
        isRecoveryArrivalUrl(
          "https://sitesurveyor.tech/?token_hash=abc&type=recovery",
        ),
      ).toBe(true);
      expect(
        isRecoveryArrivalUrl("https://sitesurveyor.tech/?type=recovery"),
      ).toBe(true);
      expect(
        isRecoveryArrivalUrl(
          "https://sitesurveyor.tech/?error=access_denied&type=recovery",
        ),
      ).toBe(true);
    });

    it("ignores an OAuth code, a plain visit and other email types", () => {
      expect(
        isRecoveryArrivalUrl("https://sitesurveyor.tech/auth/callback?code=abc"),
      ).toBe(false);
      expect(isRecoveryArrivalUrl("https://sitesurveyor.tech/")).toBe(false);
      expect(
        isRecoveryArrivalUrl(
          "https://sitesurveyor.tech/#access_token=abc&type=signup",
        ),
      ).toBe(false);
      expect(
        isRecoveryArrivalUrl(
          "https://sitesurveyor.tech/verify-email?token_hash=abc&type=signup",
        ),
      ).toBe(false);
    });
  });
});
