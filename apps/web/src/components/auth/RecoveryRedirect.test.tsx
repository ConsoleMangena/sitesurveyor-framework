import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const mockOnAuthStateChange = vi.fn();
const mockHasPending = vi.fn();

vi.mock("../../lib/auth/session", () => ({
  onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
  hasPendingPasswordRecoverySession: () => mockHasPending(),
}));

import RecoveryRedirect from "./RecoveryRedirect.tsx";

/** Records the path the router ends up on. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}</div>;
}

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RecoveryRedirect />
      <Routes>
        <Route path="/" element={<LocationProbe />} />
        <Route path="/reset-password" element={<LocationProbe />} />
        <Route path="/auth/callback" element={<LocationProbe />} />
        <Route path="/workspace" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RecoveryRedirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnAuthStateChange.mockReturnValue({ unsubscribe: vi.fn() });
    mockHasPending.mockReturnValue(false);
    window.history.pushState({}, "", "/");
  });

  it("moves a recovery arrival on the landing page to /reset-password", async () => {
    renderAt(
      "/#access_token=abc&refresh_token=def&type=recovery",
    );

    await waitFor(() => {
      expect(screen.getByTestId("path").textContent).toBe("/reset-password");
    });
  });

  it("moves a token-hash arrival to /reset-password", async () => {
    renderAt("/?token_hash=abc&type=recovery");

    await waitFor(() => {
      expect(screen.getByTestId("path").textContent).toBe("/reset-password");
    });
  });

  it("moves a recovery session that was buffered before mount", async () => {
    mockHasPending.mockReturnValue(true);

    renderAt("/");

    await waitFor(() => {
      expect(screen.getByTestId("path").textContent).toBe("/reset-password");
    });
  });

  it("moves a recovery session that arrives after mount", async () => {
    renderAt("/");

    const callback = mockOnAuthStateChange.mock.calls[0][0] as (
      event: string,
      session: unknown,
    ) => void;
    callback("PASSWORD_RECOVERY", { user: { id: "user-1" } });

    await waitFor(() => {
      expect(screen.getByTestId("path").textContent).toBe("/reset-password");
    });
  });

  it("leaves the reset route alone", async () => {
    mockHasPending.mockReturnValue(true);

    renderAt("/reset-password");

    expect(screen.getByTestId("path").textContent).toBe("/reset-password");
    // Already home: no redirect and no extra subscription.
    expect(mockOnAuthStateChange).not.toHaveBeenCalled();
  });

  it("leaves the OAuth callback alone", async () => {
    renderAt("/auth/callback?code=abc");

    expect(screen.getByTestId("path").textContent).toBe("/auth/callback");
    expect(mockOnAuthStateChange).not.toHaveBeenCalled();
  });

  it("ignores an ordinary visit with no recovery signal", async () => {
    renderAt("/");

    expect(screen.getByTestId("path").textContent).toBe("/");
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it("ignores other auth events", async () => {
    renderAt("/");

    const callback = mockOnAuthStateChange.mock.calls[0][0] as (
      event: string,
      session: unknown,
    ) => void;
    callback("SIGNED_IN", { user: { id: "user-1" } });

    expect(screen.getByTestId("path").textContent).toBe("/");
  });
});
