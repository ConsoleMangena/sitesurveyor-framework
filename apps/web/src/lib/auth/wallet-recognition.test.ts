import { describe, expect, it } from "vitest";
import {
  isRecognisedWalletAccount,
  missingWalletProfileFields,
  resolveWalletIdentity,
} from "./wallet-recognition.ts";

describe("resolveWalletIdentity", () => {
  it("prefers saved profile fields over auth metadata", () => {
    const identity = resolveWalletIdentity({
      profile: {
        full_name: "Profile Name",
        email: "profile@example.com",
        auth_signup_account_type: "business",
      },
      metadata: {
        full_name: "Metadata Name",
        contact_email: "metadata@example.com",
        account_type: "personal",
      },
      sessionEmail: "session@example.com",
    });

    expect(identity).toEqual({
      name: "Profile Name",
      email: "profile@example.com",
      accountType: "business",
    });
  });

  it("recovers identity from signup metadata when the profile row is empty", () => {
    const identity = resolveWalletIdentity({
      profile: null,
      metadata: {
        full_name: "Legacy Surveyor",
        contact_email: "legacy@example.com",
        account_type: "business",
      },
    });

    expect(identity).toEqual({
      name: "Legacy Surveyor",
      email: "legacy@example.com",
      accountType: "business",
    });
    expect(isRecognisedWalletAccount(identity)).toBe(true);
  });

  it("falls back to the session email for email-auth accounts", () => {
    const identity = resolveWalletIdentity({
      profile: { full_name: "Email User", auth_signup_account_type: "personal" },
      metadata: {},
      sessionEmail: "email-user@example.com",
    });

    expect(identity.email).toBe("email-user@example.com");
    expect(isRecognisedWalletAccount(identity)).toBe(true);
  });

  it("treats blank metadata values as missing", () => {
    const identity = resolveWalletIdentity({
      metadata: { full_name: "   ", contact_email: "", account_type: "  " },
    });

    expect(identity).toEqual({ name: null, email: null, accountType: null });
    expect(isRecognisedWalletAccount(identity)).toBe(false);
  });
});

describe("missingWalletProfileFields", () => {
  it("returns only the columns the profile is missing", () => {
    expect(
      missingWalletProfileFields(
        { full_name: "Saved Name", email: null, auth_signup_account_type: "" },
        {
          name: "Metadata Name",
          email: "metadata@example.com",
          accountType: "personal",
        },
      ),
    ).toEqual({
      email: "metadata@example.com",
      auth_signup_account_type: "personal",
    });
  });

  it("returns an empty patch when the profile is complete", () => {
    expect(
      missingWalletProfileFields(
        {
          full_name: "Saved Name",
          email: "saved@example.com",
          auth_signup_account_type: "business",
        },
        {
          name: "Metadata Name",
          email: "metadata@example.com",
          accountType: "personal",
        },
      ),
    ).toEqual({});
  });
});
