import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authRedirectTo,
  getPublicWebOrigin,
  isDesktopShell,
  isMobileShell,
} from "./platform.ts";

describe("platform", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.unstubAllEnvs();
  });

  describe("isDesktopShell", () => {
    it("is false in a plain browser window", () => {
      expect(isDesktopShell()).toBe(false);
    });

    it("is true once Tauri injects its internals", () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      expect(isDesktopShell()).toBe(true);
    });
  });

  describe("isMobileShell", () => {
    it("is false without the mobile build flag", () => {
      expect(isMobileShell()).toBe(false);
    });
  });

  describe("getPublicWebOrigin", () => {
    it("defaults to the hosted web build", () => {
      expect(getPublicWebOrigin()).toBe("https://sitesurveyor.tech");
    });

    it("uses VITE_PUBLIC_APP_URL without a trailing slash", () => {
      vi.stubEnv("VITE_PUBLIC_APP_URL", "https://staging.example.com/");
      expect(getPublicWebOrigin()).toBe("https://staging.example.com");
    });
  });

  describe("authRedirectTo", () => {
    it("returns this origin in the browser", () => {
      expect(authRedirectTo("/auth/callback")).toBe(
        `${window.location.origin}/auth/callback`,
      );
    });

    it("returns the bridge page on the web origin in the desktop shell", () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      // The browser that finishes the flow cannot reach tauri.localhost, so
      // the redirect has to land on the hosted web build instead.
      expect(authRedirectTo("/auth/callback")).toMatch(
        /^https:\/\/[^/]+\/auth\/desktop-callback\.html$/,
      );
    });

    it("uses a separate bridge page for password reset", () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      expect(authRedirectTo("/reset-password")).toMatch(
        /^https:\/\/[^/]+\/auth\/desktop-reset\.html$/,
      );
    });

    it("falls back to the deep link for a path with no bridge page", () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      expect(authRedirectTo("/verify-email")).toBe(
        "sitesurveyor://app/verify-email",
      );
    });

    it("keeps a path that has no leading slash working", () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      expect(authRedirectTo("reset-password")).toMatch(
        /^https:\/\/[^/]+\/auth\/desktop-reset\.html$/,
      );
    });

    it("never sends the browser to an origin it cannot reach", () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      const target = new URL(authRedirectTo("/auth/callback"));
      expect(target.protocol).toBe("https:");
      expect(target.host).not.toContain("tauri");
    });
  });
});
