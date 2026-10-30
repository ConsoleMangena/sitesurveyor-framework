import { describe, expect, it } from "vitest";
import type { AppUserContext } from "../../lib/auth/app-user.ts";
import {
  ADMIN_PLATFORM_VIEWS,
  getAccessibleView,
  getAllowedViews,
  getWorkspaceShellAccountLabel,
  mapAppUserToUiUser,
  PLATFORM_ADMIN_FALLBACK_WORKSPACE_ID,
} from "./account.ts";
import type { UiUser } from "./types.ts";

describe("workspace account access helpers", () => {
  it("makes all account features available (no feature gating)", () => {
    expect(getAllowedViews("personal").has("timeTracking")).toBe(true);
    expect(getAllowedViews("business").has("dispatch")).toBe(true);
    expect(getAllowedViews("business").has("team")).toBe(true);
  });

  it("scopes views by account type only", () => {
    // Personal-only views are not available to business and vice versa.
    expect(getAllowedViews("personal").has("contacts")).toBe(true);
    expect(getAllowedViews("business").has("contacts")).toBe(false);
    expect(getAllowedViews("business").has("dispatch")).toBe(true);
    expect(getAllowedViews("personal").has("dispatch")).toBe(false);
  });

  it("falls back to dashboard for views outside the account type", () => {
    expect(getAccessibleView("personal", "dispatch")).toBe("dashboard");
    expect(getAccessibleView("business", "contacts")).toBe("dashboard");
  });

  it("exposes platform admin views only when isPlatformAdmin is true", () => {
    const noAdmin = getAllowedViews("business", false);
    expect(noAdmin.has("admin_overview")).toBe(false);
    expect(noAdmin.has("billing")).toBe(true);

    const admin = getAllowedViews("business", true);
    for (const view of ADMIN_PLATFORM_VIEWS) {
      expect(admin.has(view)).toBe(true);
    }

    expect(getAccessibleView("business", "admin_overview", false)).toBe(
      "dashboard",
    );
    expect(getAccessibleView("business", "admin_overview", true)).toBe(
      "admin_overview",
    );
  });

  it("maps platform admin with no workspace rows using placeholder workspace id", () => {
    const ctx = {
      session: {
        user: {
          id: "00000000-0000-0000-0000-000000000001",
          email: "ops@example.com",
          user_metadata: { account_type: "platform_admin" },
        },
      },
      profile: {
        email: "ops@example.com",
        full_name: "Ops",
        is_platform_admin: true,
        auth_signup_account_type: "platform_admin",
      },
      defaultWorkspace: null,
      workspaces: [],
    } as unknown as AppUserContext;

    const user = mapAppUserToUiUser(ctx);
    expect(user).not.toBeNull();
    expect(user?.workspaceId).toBe(PLATFORM_ADMIN_FALLBACK_WORKSPACE_ID);
    expect(user?.isPlatformAdmin).toBe(true);
    expect(user?.signupAccountType).toBe("platform_admin");
  });

  it("maps signup path from profiles.auth_signup_account_type for personal workspace", () => {
    const ctx = {
      session: {
        user: {
          id: "00000000-0000-0000-0000-000000000002",
          email: "admin-signup@example.com",
          user_metadata: {},
        },
      },
      profile: {
        email: "admin-signup@example.com",
        full_name: "Admin Signup",
        is_platform_admin: false,
        auth_signup_account_type: "platform_admin",
      },
      defaultWorkspace: {
        id: "11111111-1111-1111-1111-111111111111",
        type: "personal",
        name: "Personal",
      },
      workspaces: [
        {
          workspaceId: "11111111-1111-1111-1111-111111111111",
          workspace: {
            id: "11111111-1111-1111-1111-111111111111",
            type: "personal",
            name: "Personal",
          },
        },
      ],
    } as unknown as AppUserContext;

    const user = mapAppUserToUiUser(ctx);
    expect(user?.signupAccountType).toBe("platform_admin");
    expect(user?.accountType).toBe("personal");
  });

  it("falls back signup path to session metadata when profile column is null", () => {
    const ctx = {
      session: {
        user: {
          id: "00000000-0000-0000-0000-000000000003",
          email: "legacy@example.com",
          user_metadata: { account_type: "business" },
        },
      },
      profile: {
        email: "legacy@example.com",
        full_name: "Legacy",
        is_platform_admin: false,
        auth_signup_account_type: null,
      },
      defaultWorkspace: {
        id: "22222222-2222-2222-2222-222222222222",
        type: "business",
        name: "Co",
      },
      workspaces: [
        {
          workspaceId: "22222222-2222-2222-2222-222222222222",
          workspace: {
            id: "22222222-2222-2222-2222-222222222222",
            type: "business",
            name: "Co",
          },
        },
      ],
    } as unknown as AppUserContext;

    expect(mapAppUserToUiUser(ctx)?.signupAccountType).toBe("business");
  });

  it("labels platform signup shell distinctly from personal/business", () => {
    const base: UiUser = {
      id: "11111111-1111-1111-1111-111111111111",
      workspaceId: "w",
      name: "U",
      email: "u@e.com",
      company: "c",
      accountType: "personal",
      signupAccountType: "platform_admin",
      isPlatformAdmin: true,
    };
    expect(getWorkspaceShellAccountLabel(base)).toBe("Platform administration");

    expect(
      getWorkspaceShellAccountLabel({
        ...base,
        signupAccountType: "personal",
        accountType: "personal",
      }),
    ).toBe("Personal account");

    expect(
      getWorkspaceShellAccountLabel({
        ...base,
        signupAccountType: "business",
        accountType: "business",
      }),
    ).toBe("Business account");
  });
});
