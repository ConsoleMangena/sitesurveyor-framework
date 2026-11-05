import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SignInPage from "./SignInPage.tsx";

const { mockSignInWithEmail, mockEnsureAccountProvisioned } = vi.hoisted(() => ({
  mockSignInWithEmail: vi.fn(),
  mockEnsureAccountProvisioned: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock("../../lib/auth/email-auth.ts", () => ({
  signInWithEmail: (...args: unknown[]) => mockSignInWithEmail(...args),
}));

vi.mock("../../lib/auth/provisioning.ts", () => ({
  ensureAccountProvisioned: (...args: unknown[]) =>
    mockEnsureAccountProvisioned(...args),
}));

const AUTH_USER = { id: "user-1", email: "sam@example.com" };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<SignInPage />} />
        <Route path="/" element={<div>App home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillForm(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
}

describe("SignInPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureAccountProvisioned.mockResolvedValue(undefined);
  });

  it("renders the email form plus GitHub and wallet options", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Welcome back to the field." }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^github$/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /continue with wallet/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /forgot password/i }),
    ).toHaveAttribute("href", "/forgot-password");
    expect(
      screen.getByRole("link", { name: /create an account/i }),
    ).toHaveAttribute("href", "/signup");
  });

  it("shows validation errors and never calls auth when the form is empty", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Enter your email address.")).toBeInTheDocument();
    expect(await screen.findByText("Enter your password.")).toBeInTheDocument();
    expect(mockSignInWithEmail).not.toHaveBeenCalled();
    expect(screen.queryByText("App home")).not.toBeInTheDocument();
  });

  it("rejects a malformed email address", async () => {
    renderPage();

    fillForm("not-an-email", "hunter2");
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(mockSignInWithEmail).not.toHaveBeenCalled();
  });

  it("signs in, provisions the account, then routes to the app", async () => {
    mockSignInWithEmail.mockResolvedValue({ session: {}, user: AUTH_USER });
    renderPage();

    fillForm("sam@example.com", "correct horse");
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByText("App home")).toBeInTheDocument(),
    );
    expect(mockSignInWithEmail).toHaveBeenCalledWith({
      email: "sam@example.com",
      password: "correct horse",
    });
    expect(mockEnsureAccountProvisioned).toHaveBeenCalledWith(AUTH_USER);
  });

  it("shows a busy state while the request is in flight", async () => {
    let release!: (value: unknown) => void;
    mockSignInWithEmail.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    renderPage();

    fillForm("sam@example.com", "correct horse");
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByText("Signing in…")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Email")).toBeDisabled();

    release({ session: {}, user: AUTH_USER });
    await waitFor(() =>
      expect(screen.getByText("App home")).toBeInTheDocument(),
    );
  });

  it("surfaces the server message when sign-in fails", async () => {
    mockSignInWithEmail.mockRejectedValue(
      new Error("Invalid login credentials"),
    );
    renderPage();

    fillForm("sam@example.com", "wrong password");
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      await screen.findByText("Invalid login credentials"),
    ).toBeInTheDocument();
    expect(mockEnsureAccountProvisioned).not.toHaveBeenCalled();
    expect(screen.queryByText("App home")).not.toBeInTheDocument();
  });

  it("blocks sign-in when provisioning cannot complete", async () => {
    mockSignInWithEmail.mockResolvedValue({ session: {}, user: AUTH_USER });
    mockEnsureAccountProvisioned.mockRejectedValue(
      new Error("Add your details to continue."),
    );
    renderPage();

    fillForm("sam@example.com", "correct horse");
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(
      await screen.findByText("Add your details to continue."),
    ).toBeInTheDocument();
    expect(screen.queryByText("App home")).not.toBeInTheDocument();
  });
});
