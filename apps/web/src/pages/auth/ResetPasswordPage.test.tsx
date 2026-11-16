import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ResetPasswordPage from "./ResetPasswordPage.tsx";

const {
  mockConsumePasswordRecoverySession,
  mockGetCurrentSession,
  mockOnAuthStateChange,
  mockRedeemRecoveryTokenHash,
  mockSetPassword,
} = vi.hoisted(() => ({
  mockConsumePasswordRecoverySession: vi.fn(),
  mockGetCurrentSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
  mockRedeemRecoveryTokenHash: vi.fn(),
  mockSetPassword: vi.fn(),
}));

vi.mock("../../lib/auth/session.ts", () => ({
  consumePasswordRecoverySession: () => mockConsumePasswordRecoverySession(),
  getCurrentSession: () => mockGetCurrentSession(),
  onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
}));

vi.mock("../../lib/auth/recovery.ts", () => ({
  redeemRecoveryTokenHash: (...args: unknown[]) => mockRedeemRecoveryTokenHash(...args),
}));

vi.mock("../../lib/auth/email-auth.ts", () => ({
  setPassword: (...args: unknown[]) => mockSetPassword(...args),
}));

function renderReset(url = "/reset-password") {
  window.history.replaceState({}, "", url);
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/forgot-password" element={<div>Forgot password</div>} />
        <Route path="/workspace" element={<div>App workspace</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnAuthStateChange.mockReturnValue({ unsubscribe: vi.fn() });
    mockConsumePasswordRecoverySession.mockReturnValue(null);
    mockGetCurrentSession.mockResolvedValue(null);
    mockRedeemRecoveryTokenHash.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("enables recovery when Supabase completed the exchange before mount", () => {
    mockConsumePasswordRecoverySession.mockReturnValue({
      user: { id: "user-1" },
    });

    renderReset("/reset-password?code=already-exchanged");

    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  it("enables recovery via getSession when PKCE exchange finished before mount and event was missed", async () => {
    // consumePasswordRecoverySession missed the event, but the session is in
    // localStorage — getCurrentSession() returns it asynchronously.
    mockConsumePasswordRecoverySession.mockReturnValue(null);
    mockGetCurrentSession.mockResolvedValue({ user: { id: "user-1" } });

    renderReset("/reset-password?code=already-exchanged");

    // Form not yet shown — waiting for the async getSession() promise.
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();

    // Let the promise resolve.
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  it("enables recovery only after Supabase emits PASSWORD_RECOVERY", () => {
    renderReset();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();

    const callback = mockOnAuthStateChange.mock.calls[0][0];
    act(() => callback("SIGNED_IN", { user: { id: "user-1" } }));
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();

    act(() => callback("PASSWORD_RECOVERY", { user: { id: "user-1" } }));
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  it("does not accept an old session for a direct visit", () => {
    renderReset();
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Verifying your reset link…")).toBeInTheDocument();
  });

  it("shows an auth error carried in the URL fragment", () => {
    renderReset("/reset-password#error=access_denied&error_description=Reset+link+expired");
    expect(screen.getByText("Reset link expired")).toBeInTheDocument();
    expect(mockOnAuthStateChange).not.toHaveBeenCalled();
  });

  it("does not show an expired error when recovery succeeds before timeout", async () => {
    vi.useFakeTimers();
    mockConsumePasswordRecoverySession.mockReturnValue({
      user: { id: "user-1" },
    });

    renderReset("/reset-password?code=valid-code");
    expect(screen.getByLabelText("New password")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.queryByText(/reset link is invalid or has expired/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("rejects a PKCE code that did not produce a recovery session", async () => {
    vi.useFakeTimers();
    renderReset("/reset-password?code=invalid");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(
      screen.getByText(/can only be completed in the browser that requested it/),
    ).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("redeems a token-hash link and enables the form", async () => {
    renderReset("/reset-password?token_hash=abc123&type=recovery");

    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockRedeemRecoveryTokenHash).toHaveBeenCalledWith("abc123", "recovery");
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
  });

  it("explains a token-hash link that GoTrue rejected", async () => {
    mockRedeemRecoveryTokenHash.mockRejectedValue(
      new Error("Email link is invalid or has expired"),
    );

    renderReset("/reset-password?token_hash=abc123");

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText(/invalid or has expired/)).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });
});
