import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AccountSecurityPage from "./AccountSecurityPage.tsx";

const { mockGetCurrentUser } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
}));

const AUTH_USER = {
  id: "user-1",
  email: "sam@example.com",
  email_confirmed_at: "2026-01-04T09:00:00Z",
  user_metadata: { full_name: "Sam Vance" },
  app_metadata: { provider_names: ["email", "github"] },
  identities: [],
};

vi.mock("../../lib/auth/session.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/auth/session.ts")>()),
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
  signOut: async () => undefined,
}));

vi.mock("../../lib/auth/auth-store", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: { id: "user-1", name: "Sam Vance", email: "sam@example.com" },
      setUser: vi.fn(),
      setAuthLoading: vi.fn(),
    }),
}));

// The method list is covered by its own module; here it only needs to be
// stable enough to render the register the sheet wraps.
vi.mock("../../lib/auth/methods.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/auth/methods.ts")>()),
  buildMethodList: () => ({
    methods: [
      {
        kind: "email",
        id: "email:sam@example.com",
        label: "Email & password",
        detail: "sam@example.com",
        removable: true,
      },
      {
        kind: "github",
        id: "github-identity-1",
        label: "GitHub",
        detail: "sam@users.noreply.github.com",
        removable: true,
      },
    ],
    canAddMore: true,
    missingEmail: false,
  }),
}));

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({
    wallet: null,
    wallets: [],
    select: vi.fn(),
    connect: vi.fn(),
    publicKey: null,
  }),
}));

vi.mock("../../features/phantom/lib/customWalletAdapter.ts", () => ({
  CUSTOM_WALLET_NAME: "SiteSurveyor Wallet",
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/account/security"]}>
      <AccountSecurityPage />
    </MemoryRouter>,
  );
}

describe("AccountSecurityPage", () => {
  beforeEach(() => {
    mockGetCurrentUser.mockReset();
  });

  it("renders the sheet with the account strip and the method register", async () => {
    mockGetCurrentUser.mockResolvedValue(AUTH_USER);
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Account security" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Choose how you sign in to SiteSurveyor."),
    ).toBeInTheDocument();
    expect(screen.getByText("Sam Vance")).toBeInTheDocument();
  });

  it("lists each credential as a row of the register, not a nested card", async () => {
    mockGetCurrentUser.mockResolvedValue(AUTH_USER);
    renderPage();

    expect(
      await screen.findByRole("heading", { name: /sign-in methods/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /how you sign in/i }),
    ).toBeInTheDocument();

    const rows = screen
      .getAllByRole("listitem")
      .map((row) => row.textContent);
    expect(rows.some((text) => /Email & password/.test(text ?? ""))).toBe(true);
    expect(rows.some((text) => /GitHub/.test(text ?? ""))).toBe(true);

    expect(
      screen.getByRole("button", { name: /sign out/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to workspace/i }),
    ).toHaveAttribute("href", "/workspace");
  });
});
