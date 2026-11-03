import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AuthCallbackPage from "./AuthCallbackPage.tsx";

const { mockGetCurrentSession, mockEnsureAccountProvisioned, ProvisioningError } =
  vi.hoisted(() => {
    class ProvisioningError extends Error {
      readonly blocker: string;

      constructor(blocker: string, message: string) {
        super(message);
        this.name = "ProvisioningError";
        this.blocker = blocker;
      }
    }
    return {
      mockGetCurrentSession: vi.fn(),
      mockEnsureAccountProvisioned: vi.fn(),
      ProvisioningError,
    };
  });

vi.mock("../../lib/auth/session.ts", () => ({
  getCurrentSession: (...args: unknown[]) => mockGetCurrentSession(...args),
}));

vi.mock("../../lib/auth/provisioning.ts", () => ({
  ProvisioningError,
  ensureAccountProvisioned: (...args: unknown[]) =>
    mockEnsureAccountProvisioned(...args),
}));

function githubUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "sam@example.com",
    user_metadata: { full_name: "Sam Ranger" },
    identities: [],
    ...overrides,
  };
}

function renderCallback(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/signup" element={<div>Sign up screen</div>} />
        <Route path="/login" element={<div>Sign in screen</div>} />
        <Route path="/" element={<div>App home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuthCallbackPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentSession.mockResolvedValue({ user: githubUser() });
    mockEnsureAccountProvisioned.mockResolvedValue({ created: true });
  });

  it("waits for the session, provisions the account and hands over", async () => {
    renderCallback();

    expect(await screen.findByText("App home")).toBeInTheDocument();
    expect(mockEnsureAccountProvisioned).toHaveBeenCalledTimes(1);
  });

  it("turns GoTrue's provider error into an actionable explanation", async () => {
    renderCallback(
      "?error=server_error&error_description=Error+getting+user+profile+from+external+provider",
    );

    expect(
      await screen.findByRole("heading", {
        name: "Sign-in could not be completed",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/hand your profile back to SiteSurveyor/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/external provider/)).toBeNull();
  });

  it("tells a user whose GitHub app is not enabled what to do", async () => {
    renderCallback("?error_description=Provider+is+not+enabled");

    expect(await screen.findByText(/isn't enabled on this deployment/)).toBeInTheDocument();
  });

  it("sends a private-email GitHub account to add an address instead of failing", async () => {
    mockGetCurrentSession.mockResolvedValue({
      user: githubUser({ email: undefined }),
    });
    mockEnsureAccountProvisioned.mockRejectedValue(
      new ProvisioningError("EMAIL_REQUIRED", "Add an email address."),
    );

    renderCallback();

    expect(
      await screen.findByRole("heading", { name: "Add an email address" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/keeps its email address private/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Add an email address" }),
    ).toHaveAttribute("href", "/signup");
    expect(
      screen.queryByRole("heading", { name: "Sign-in could not be completed" }),
    ).toBeNull();
  });

  it("changes the wording when GitHub reported an address the session lost", async () => {
    mockGetCurrentSession.mockResolvedValue({
      user: githubUser({
        email: undefined,
        identities: [
          {
            id: "identity-1",
            provider: "github",
            created_at: "2026-11-03T00:00:00Z",
            identity_data: { email: "sam@example.com" },
          },
        ],
      }),
    });
    mockEnsureAccountProvisioned.mockRejectedValue(
      new ProvisioningError("EMAIL_REQUIRED", "Add an email address."),
    );

    renderCallback();

    expect(
      await screen.findByText(/couldn't read an email address off that sign-in/),
    ).toBeInTheDocument();
  });

  it("keeps a nameless account on the finish-setup path", async () => {
    mockEnsureAccountProvisioned.mockRejectedValue(
      new ProvisioningError("DETAILS_REQUIRED", "Add your name."),
    );

    renderCallback();

    expect(
      await screen.findByRole("heading", { name: "A few details to finish" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /finish setting up/i }),
    ).toHaveAttribute("href", "/signup");
  });

  it("still reports genuine provisioning failures", async () => {
    mockEnsureAccountProvisioned.mockRejectedValue(new Error("Backend is down"));

    renderCallback();

    expect(await screen.findByText("Backend is down")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Sign-in could not be completed" }),
    ).toBeInTheDocument();
  });
});
