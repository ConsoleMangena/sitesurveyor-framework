import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SignupPage from "./SignupPage";

vi.mock("../../lib/auth/session.ts", () => ({
  signUpWithEmail: vi.fn(),
}));

function renderSignup() {
  return render(
    <MemoryRouter initialEntries={["/signup"]}>
      <SignupPage />
    </MemoryRouter>,
  );
}

describe("SignupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders account type selection step", () => {
    renderSignup();
    expect(screen.getByText(/choose how you'll use/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^personal /i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^business /i }),
    ).toBeInTheDocument();
  });

  it("shows continue button disabled initially", () => {
    renderSignup();
    const continueBtn = screen.getByRole("button", { name: /continue/i });
    expect(continueBtn).toBeDisabled();
  });

  it("enables continue button after selecting account type", async () => {
    const user = userEvent.setup();
    renderSignup();
    await user.click(screen.getByRole("button", { name: /^personal /i }));
    const continueBtn = screen.getByRole("button", { name: /continue/i });
    expect(continueBtn).not.toBeDisabled();
  });

  it("proceeds to details step after selecting account type", async () => {
    const user = userEvent.setup();
    renderSignup();
    await user.click(screen.getByRole("button", { name: /^personal /i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("can go back to account type selection", async () => {
    const user = userEvent.setup();
    renderSignup();
    await user.click(screen.getByRole("button", { name: /^personal /i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await user.click(screen.getByRole("button", { name: /change account type/i }));
    expect(
      screen.getByRole("button", { name: /^personal /i }),
    ).toBeInTheDocument();
  });

  it("shows password strength indicator", async () => {
    const user = userEvent.setup();
    renderSignup();
    await user.click(screen.getByRole("button", { name: /^personal /i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    const passwordInput = screen.getByLabelText(/^password$/i);
    await user.type(passwordInput, "StrongP@ss1");
    expect(screen.getByText(/strong/i)).toBeInTheDocument();
  });

  it("shows error when submitting empty details form", async () => {
    const user = userEvent.setup();
    renderSignup();
    await user.click(screen.getByRole("button", { name: /^personal /i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await user.click(
      screen.getByRole("button", { name: /create personal account/i }),
    );
    expect(
      screen.getByText(/please fill in all required fields/i),
    ).toBeInTheDocument();
  });

  it("has a working 'Log in' button", async () => {
    const user = userEvent.setup();
    renderSignup();
    const loginBtn = screen.getByRole("button", { name: /log in/i });
    expect(loginBtn).toBeInTheDocument();
    await user.click(loginBtn);
  });
});
