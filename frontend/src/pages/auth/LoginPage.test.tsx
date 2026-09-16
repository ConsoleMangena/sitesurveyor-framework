import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "./LoginPage";

vi.mock("../../lib/auth/session.ts", () => ({
  signInWithEmail: vi.fn(),
  resendSignupConfirmation: vi.fn(),
}));

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders email and password fields", () => {
    renderLogin();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it("renders sign-in button", () => {
    renderLogin();
    expect(
      screen.getByRole("button", { name: /log in/i }),
    ).toBeInTheDocument();
  });

  it("shows error when submitting empty form", async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole("button", { name: /log in/i }));
    expect(screen.getByText(/please fill in all fields/i)).toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    renderLogin();
    const passwordInput = screen.getByLabelText(/^password$/i);
    expect(passwordInput).toHaveAttribute("type", "password");

    const toggle = screen.getByRole("button", { name: /show password/i });
    await user.click(toggle);
    expect(passwordInput).toHaveAttribute("type", "text");

    const hideToggle = screen.getByRole("button", { name: /hide password/i });
    await user.click(hideToggle);
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("allows typing email and password", async () => {
    const user = userEvent.setup();
    renderLogin();
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/^password$/i);

    await user.type(emailInput, "test@example.com");
    await user.type(passwordInput, "password123");

    expect(emailInput).toHaveValue("test@example.com");
    expect(passwordInput).toHaveValue("password123");
  });

  it("calls navigate to /signup when clicking 'Sign up'", async () => {
    const user = userEvent.setup();
    renderLogin();
    const signupLink = screen.getByRole("link", { name: /sign up/i });
    expect(signupLink).toBeInTheDocument();
    await user.click(signupLink);
  });

  it("calls navigate to /forgot-password when clicking 'Forgot password?'", async () => {
    const user = userEvent.setup();
    renderLogin();
    const forgotBtn = screen.getByRole("button", { name: /forgot password/i });
    expect(forgotBtn).toBeInTheDocument();
    await user.click(forgotBtn);
  });
});
