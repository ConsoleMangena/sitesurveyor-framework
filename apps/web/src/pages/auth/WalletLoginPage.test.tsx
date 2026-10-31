import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WalletLoginPage from "./WalletLoginPage.tsx";
import { SOLANA_SIGN_IN_STATEMENT } from "../../lib/auth/session.ts";
import {
  SOLANA_CLUSTER,
  SOLANA_CLUSTER_LABEL,
} from "../../features/phantom/lib/config.ts";

const mockConnect = vi.fn();
const mockSelect = vi.fn();
const mockDisconnect = vi.fn();
const mockSignInWithSolanaWallet = vi.fn();
const mockSignUpWithSolanaWallet = vi.fn();
const mockSignInWithSolanaSignature = vi.fn();
const mockSignUpWithSolanaSignature = vi.fn();
const { mockSignOut, mockGetSignInProfile, mockRepairSignInProfile } =
  vi.hoisted(() => ({
    mockSignOut: vi.fn(),
    mockGetSignInProfile: vi.fn(),
    mockRepairSignInProfile: vi.fn(async (..._args: unknown[]) => undefined),
  }));
const mockWalletState = vi.hoisted(() => ({ connected: true }));

const {
  mockStartSolflare,
  mockContinueSolflare,
  mockResumeSolflare,
  mockShouldResumeSolflare,
  mockHasPendingSolflare,
  mockCancelSolflare,
} = vi.hoisted(() => ({
  mockStartSolflare: vi.fn(() => true),
  mockContinueSolflare: vi.fn(() => true),
  mockResumeSolflare: vi.fn<() => unknown>(() => null),
  mockShouldResumeSolflare: vi.fn(() => false),
  mockHasPendingSolflare: vi.fn(() => false),
  mockCancelSolflare: vi.fn(),
}));

const { mockWallets, mockAdapterConnect, resetMockWallets } =
  vi.hoisted(() => {
    const mockAdapterConnect = vi.fn();
    const makeWallets = () => [
      {
        adapter: {
          name: "Brave Wallet",
          icon: "data:image/svg+xml;base64,mock",
          connect: mockAdapterConnect,
        },
        readyState: "Installed",
      },
      {
        adapter: {
          name: "Phantom",
          icon: "data:image/svg+xml;base64,mock",
          connect: mockAdapterConnect,
        },
        readyState: "Installed",
      },
      {
        adapter: {
          name: "Backpack",
          icon: "data:image/svg+xml;base64,mock",
          connect: mockAdapterConnect,
        },
        readyState: "Loadable",
      },
      {
        adapter: { name: "SiteSurveyor Wallet", icon: "/logo.svg", connect: mockAdapterConnect },
        readyState: "Loadable",
      },
    ];
    const mockWallets = makeWallets();
    return {
      mockWallets,
      mockAdapterConnect,
      resetMockWallets: () => {
        mockWallets.splice(0, mockWallets.length, ...makeWallets());
      },
    };
  });

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <WalletLoginPage />
    </MemoryRouter>,
  );
}

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({
    wallet: mockWalletState.connected
      ? {
          adapter: {
            name: "Brave Wallet",
            icon: "data:image/svg+xml;base64,mock",
          },
        }
      : null,
    wallets: mockWallets,
    select: mockSelect,
    connect: mockConnect,
    connected: mockWalletState.connected,
    connecting: false,
    disconnect: mockDisconnect,
    publicKey: mockWalletState.connected
      ? {
          toBase58: () => "8xK3ABCDEFGHIJKLM4jP9",
        }
      : null,
  }),
}));

vi.mock("../../lib/auth/solflare-mobile.ts", () => ({
  startSolflareMobileAuth: mockStartSolflare,
  continueSolflareMobileAuth: mockContinueSolflare,
  resumeSolflareMobileAuth: mockResumeSolflare,
  shouldResumeSolflareAuth: mockShouldResumeSolflare,
  hasPendingSolflareSignature: mockHasPendingSolflare,
  cancelSolflareMobileAuth: mockCancelSolflare,
}));

vi.mock("../../features/phantom/lib/customWalletAdapter.ts", () => ({
  CUSTOM_WALLET_NAME: "SiteSurveyor Wallet",
}));

vi.mock("../../lib/auth/session.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/auth/session.ts")>()),
  signInWithSolanaWallet: (...args: unknown[]) => mockSignInWithSolanaWallet(...args),
  signUpWithSolanaWallet: (...args: unknown[]) => mockSignUpWithSolanaWallet(...args),
  signInWithSolanaSignature: (...args: unknown[]) =>
    mockSignInWithSolanaSignature(...args),
  signUpWithSolanaSignature: (...args: unknown[]) =>
    mockSignUpWithSolanaSignature(...args),
  signOut: async (...args: unknown[]) => mockSignOut(...args),
}));

vi.mock("../../lib/repositories/profiles.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/repositories/profiles.ts")>()),
  getSignInProfile: (...args: unknown[]) => mockGetSignInProfile(...args),
  repairSignInProfile: (...args: unknown[]) =>
    mockRepairSignInProfile(...args),
}));

// A complete account lets the Sign In flow pass wallet recognition by default.
mockGetSignInProfile.mockResolvedValue({
  full_name: "Sam Surveyor",
  email: "sam@example.com",
  auth_signup_account_type: "personal",
});

vi.mock("../../lib/auth/auth-store", () => ({
  useAuthStore: () => vi.fn(),
}));

describe("WalletLoginPage (Brave Wallet Styling & Web3 Auth)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockWallets();
    setUserAgent(DESKTOP_UA);
    mockWalletState.connected = true;
    mockShouldResumeSolflare.mockReturnValue(false);
    mockHasPendingSolflare.mockReturnValue(false);
    mockStartSolflare.mockReturnValue(true);
    mockContinueSolflare.mockReturnValue(true);
    mockResumeSolflare.mockReturnValue(null);
  });

  it("renders SiteSurveyor Web3 gateway branding and default Sign In tab", () => {
    renderPage();

    expect(screen.getByText("SiteSurveyor")).toBeInTheDocument();
    expect(screen.getByText(/Solana Web3 Authentication/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in with brave wallet/i })).toBeInTheDocument();
  });

  it("links to the public market", () => {
    renderPage();

    expect(
      screen.getByRole("link", { name: /go to public market/i }),
    ).toHaveAttribute("href", "/market");
  });

  it("shows the configured Solana cluster in the network pill", () => {
    renderPage();

    expect(
      screen.getByText(SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER]),
    ).toBeInTheDocument();
  });

  it("displays connected address pill with truncate format and copy button", () => {
    renderPage();

    expect(screen.getByText("8xK3...4jP9")).toBeInTheDocument();
    expect(screen.getByLabelText("Copy wallet address")).toBeInTheDocument();
    expect(screen.getByTitle("Disconnect wallet")).toBeInTheDocument();
  });

  it("switches to Create Account tab and displays Personal / Business account options", () => {
    renderPage();

    const createTab = screen.getByRole("tab", { name: /create account/i });
    fireEvent.click(createTab);

    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("Business Firm")).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account & authorize/i })).toBeInTheDocument();
  });

  it("toggles business account scope and displays required firm name field", () => {
    renderPage();

    fireEvent.click(screen.getByRole("tab", { name: /create account/i }));

    const businessCard = screen.getByText("Business Firm").closest(".web3-type-card");
    expect(businessCard).toBeInTheDocument();
    if (businessCard) fireEvent.click(businessCard);

    expect(screen.getByLabelText(/survey firm \/ organization name/i)).toBeInTheDocument();
  });

  it("lists MetaMask as an install fallback alongside detected wallets", () => {
    mockWalletState.connected = false;
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("MetaMask")).toBeInTheDocument();
    expect(screen.getByText("Phantom")).toBeInTheDocument();
    expect(screen.getByText("Solflare")).toBeInTheDocument();
    expect(screen.getAllByText("Install extension")).toHaveLength(2);
  });

  it("does not offer the SiteSurveyor Wallet as a sign-in method", () => {
    mockWalletState.connected = false;
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));

    expect(
      within(screen.getByRole("dialog")).queryByText("SiteSurveyor Wallet"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/encrypted local vault/i)).not.toBeInTheDocument();
  });

  it("does not select or persist an uninstalled wallet", () => {
    mockWalletState.connected = false;
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));
    fireEvent.click(screen.getByRole("button", { name: /^backpack/i }));

    expect(mockSelect).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole("dialog")).getByText(
        /backpack is not installed in this browser/i,
      ),
    ).toBeInTheDocument();
  });

  it("calls signInWithSolanaWallet when Sign In button clicked", async () => {
    mockSignInWithSolanaWallet.mockResolvedValueOnce({
      session: { access_token: "tok" },
      user: { id: "u-1" },
    });

    renderPage();

    const signInBtn = screen.getByRole("button", { name: /sign in with brave wallet/i });
    fireEvent.click(signInBtn);

    await waitFor(() =>
      expect(mockSignInWithSolanaWallet).toHaveBeenCalled(),
    );
    await waitFor(() => expect(mockGetSignInProfile).toHaveBeenCalled());
  });

  it("rejects a wallet that has no recognised account", async () => {
    mockSignInWithSolanaWallet.mockResolvedValueOnce({
      session: { access_token: "tok" },
      user: { id: "u-unknown" },
    });
    mockGetSignInProfile.mockResolvedValueOnce(null);

    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: /sign in with brave wallet/i }),
    );

    expect(
      await screen.findByText(/wallet not recognised/i),
    ).toBeInTheDocument();
    expect(mockSignOut).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /create an account/i }));

    expect(await screen.findByText("Create your account")).toBeInTheDocument();
  });

  it("recovers an account whose profile row is missing but metadata is complete", async () => {
    mockSignInWithSolanaWallet.mockResolvedValueOnce({
      session: { access_token: "tok" },
      user: {
        id: "u-legacy",
        email: null,
        user_metadata: {
          full_name: "Legacy Surveyor",
          contact_email: "legacy@example.com",
          account_type: "business",
          company: "Legacy Surveying Ltd",
        },
      },
    });
    mockGetSignInProfile.mockResolvedValueOnce({
      full_name: null,
      email: null,
      auth_signup_account_type: null,
    });

    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: /sign in with brave wallet/i }),
    );

    await waitFor(() =>
      expect(mockRepairSignInProfile).toHaveBeenCalledWith("u-legacy", {
        full_name: "Legacy Surveyor",
        email: "legacy@example.com",
        auth_signup_account_type: "business",
      }),
    );
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(screen.queryByText(/wallet not recognised/i)).not.toBeInTheDocument();
  });

  it("explains an incomplete account and prefills the finish-setup form", async () => {
    mockSignInWithSolanaWallet.mockResolvedValueOnce({
      session: { access_token: "tok" },
      user: {
        id: "u-partial",
        email: null,
        user_metadata: {
          full_name: "Partial Surveyor",
          account_type: "personal",
        },
      },
    });
    mockGetSignInProfile.mockResolvedValueOnce(null);

    renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: /sign in with brave wallet/i }),
    );

    expect(
      await screen.findByText(/missing its contact email/i),
    ).toBeInTheDocument();
    expect(mockSignOut).toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: /finish account setup/i }),
    );

    expect(await screen.findByText("Finish your account")).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toHaveValue(
      "Partial Surveyor",
    );
    expect(
      screen.getByRole("button", { name: /finish setup & authorize/i }),
    ).toBeInTheDocument();
  });
});

describe("WalletLoginPage (mobile app approval)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockWallets();
    setUserAgent(MOBILE_UA);
    mockWalletState.connected = false;
    mockShouldResumeSolflare.mockReturnValue(false);
    mockHasPendingSolflare.mockReturnValue(false);
    mockStartSolflare.mockReturnValue(true);
    mockContinueSolflare.mockReturnValue(true);
    mockResumeSolflare.mockReturnValue(null);
  });

  it("keeps Phantom off mobile and offers Solflare's app approval", () => {
    mockWallets.find((w) => w.adapter.name === "Phantom")!.readyState = "Loadable";

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).queryByText("Phantom")).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("Approve in the Solflare app"),
    ).toBeInTheDocument();
  });

  it("hides the MetaMask install row on mobile", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));

    expect(within(screen.getByRole("dialog")).queryByText("MetaMask")).not.toBeInTheDocument();
  });

  it("starts Solflare's approval sheet instead of opening its browser", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^solflare/i,
      }),
    );

    expect(mockStartSolflare).toHaveBeenCalledWith({
      intent: "signin",
      statement: SOLANA_SIGN_IN_STATEMENT,
    });
    expect(mockSelect).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /opening solflare\. approve the connection and the signature request in the app/i,
      ),
    ).toBeInTheDocument();
  });

  it("does not offer Phantom on mobile even when its adapter is detected", () => {
    // The mock registers Phantom as installed, as it would be inside its own
    // in-app browser.
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByText("Phantom")).not.toBeInTheDocument();
  });
});

describe("WalletLoginPage (Android wallet app via MWA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockWallets();
    setUserAgent(ANDROID_UA);
    mockWalletState.connected = false;
    mockShouldResumeSolflare.mockReturnValue(false);
    mockHasPendingSolflare.mockReturnValue(false);
    mockStartSolflare.mockReturnValue(true);
    mockContinueSolflare.mockReturnValue(true);
    mockResumeSolflare.mockReturnValue(null);
    mockWallets.find((w) => w.adapter.name === "Phantom")!.readyState = "Loadable";
    mockWallets.push({
      adapter: {
        name: "Mobile Wallet Adapter",
        icon: "data:image/svg+xml;base64,mock",
        connect: mockAdapterConnect,
      },
      readyState: "Installed",
    });
  });

  it("surfaces the wallet-app row and routes it through MWA", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Wallet app")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/no browser extension needed/i),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("Phantom")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /^wallet app/i }));

    expect(mockSelect).toHaveBeenCalledWith("Mobile Wallet Adapter");
    await waitFor(() => expect(mockAdapterConnect).toHaveBeenCalled());
    expect(mockStartSolflare).not.toHaveBeenCalled();
  });

  it("routes the Solflare row through the Solflare app on Android too", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^solflare/i }));

    expect(mockStartSolflare).toHaveBeenCalledWith({
      intent: "signin",
      statement: SOLANA_SIGN_IN_STATEMENT,
    });
    expect(mockSelect).not.toHaveBeenCalledWith("Mobile Wallet Adapter");
  });

  it("tells the user which network the wallet app must be on", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(new RegExp(`change network → ${SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER]}`, "i")),
    ).toBeInTheDocument();
  });

  it("explains a wallet-app network mismatch without a Phantom fallback", async () => {
    mockAdapterConnect.mockRejectedValueOnce(
      new Error(
        "Incorrect mode. You are trying to use devnet but Phantom is not in devnet mode.",
      ),
    );

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^wallet app/i }));

    expect(
      await within(dialog).findByText(/is on a different network/i),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: /continue in/i }),
    ).not.toBeInTheDocument();
  });

  it("prefers the wallet app over the missing-extension error when signing in", async () => {
    mockWallets.forEach((w) => {
      if (w.adapter.name !== "Mobile Wallet Adapter") w.readyState = "Loadable";
    });
    mockSignInWithSolanaWallet.mockResolvedValueOnce({
      session: { access_token: "tok" },
      user: { id: "u-1" },
    });

    renderPage();
    fireEvent.click(
      screen.getByRole("button", { name: /connect wallet & sign in/i }),
    );

    await waitFor(() =>
      expect(mockSignInWithSolanaWallet).toHaveBeenCalled(),
    );
    expect(mockSelect).toHaveBeenCalledWith("Mobile Wallet Adapter");
    expect(mockStartSolflare).not.toHaveBeenCalled();
  });
});

describe("WalletLoginPage (Solflare mobile return)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockWallets();
    setUserAgent(MOBILE_UA);
    mockWalletState.connected = false;
    mockShouldResumeSolflare.mockReturnValue(false);
    mockHasPendingSolflare.mockReturnValue(false);
    mockStartSolflare.mockReturnValue(true);
    mockContinueSolflare.mockReturnValue(true);
    mockResumeSolflare.mockReturnValue(null);
    mockGetSignInProfile.mockResolvedValue({
      full_name: "Sam Surveyor",
      email: "sam@example.com",
      auth_signup_account_type: "personal",
    });
  });

  it("finishes the session with the signature Solflare returned", async () => {
    const message = "app.test wants you to sign in with your Solana account:\n9xQe";
    const signature = new Uint8Array([1, 2, 3]);
    mockShouldResumeSolflare.mockReturnValue(true);
    mockResumeSolflare.mockReturnValue({
      status: "completed",
      intent: "signin",
      message,
      signature,
    });
    mockSignInWithSolanaSignature.mockResolvedValueOnce({
      session: { access_token: "tok" },
      user: { id: "sol-user-9" },
    });

    renderPage();

    await waitFor(() =>
      expect(mockSignInWithSolanaSignature).toHaveBeenCalledWith(
        message,
        signature,
      ),
    );
    expect(mockGetSignInProfile).toHaveBeenCalledWith("sol-user-9");
  });

  it("asks for the signature once Solflare has connected", async () => {
    mockShouldResumeSolflare.mockReturnValue(true);
    mockResumeSolflare.mockReturnValue({ status: "awaiting-signature" });

    renderPage();

    expect(await screen.findByText("Solflare is connected")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /approve in solflare/i }),
    );

    expect(mockContinueSolflare).toHaveBeenCalled();
    expect(mockSignInWithSolanaSignature).not.toHaveBeenCalled();
  });

  it("restores the approval prompt when a reload lost the redirect", async () => {
    mockHasPendingSolflare.mockReturnValue(true);

    renderPage();

    expect(await screen.findByText("Solflare is connected")).toBeInTheDocument();
    expect(mockResumeSolflare).not.toHaveBeenCalled();
  });

  it("explains an expired request when the signature cannot be sent", async () => {
    mockShouldResumeSolflare.mockReturnValue(true);
    mockResumeSolflare.mockReturnValue({ status: "awaiting-signature" });
    mockContinueSolflare.mockReturnValue(false);

    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: /approve in solflare/i }),
    );

    expect(
      await screen.findByText(/this solflare request expired/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Solflare is connected")).not.toBeInTheDocument();
  });

  it("surfaces a cancelled authorization from the app", async () => {
    mockShouldResumeSolflare.mockReturnValue(true);
    mockResumeSolflare.mockReturnValue({
      status: "error",
      message: "Solflare authorization was cancelled.",
    });

    renderPage();

    expect(
      await screen.findByText("Solflare authorization was cancelled."),
    ).toBeInTheDocument();
  });

  it("completes a signup from the returned signature", async () => {
    const signup = {
      fullName: "Jane Doe, PLS",
      accountType: "business" as const,
      companyName: "Acme Surveying Ltd",
      email: "jane@acmesurvey.com",
    };
    const message = "app.test wants you to sign in with your Solana account:\n9xQe";
    const signature = new Uint8Array([4, 5, 6]);
    mockShouldResumeSolflare.mockReturnValue(true);
    mockResumeSolflare.mockReturnValue({
      status: "completed",
      intent: "signup",
      signup,
      message,
      signature,
    });
    mockSignUpWithSolanaSignature.mockResolvedValueOnce({
      session: { access_token: "tok" },
      user: { id: "sol-user-10" },
    });

    renderPage();

    await waitFor(() =>
      expect(mockSignUpWithSolanaSignature).toHaveBeenCalledWith(
        message,
        signature,
        signup,
      ),
    );
    expect(mockSignInWithSolanaSignature).not.toHaveBeenCalled();
  });
});

describe("WalletLoginPage (mobile copy)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockWallets();
    setUserAgent(MOBILE_UA);
    mockWalletState.connected = false;
    mockShouldResumeSolflare.mockReturnValue(false);
    mockHasPendingSolflare.mockReturnValue(false);
    mockStartSolflare.mockReturnValue(true);
    mockContinueSolflare.mockReturnValue(true);
    mockResumeSolflare.mockReturnValue(null);
  });

  it("sends a phone with no injected wallet to Solflare's app approval", async () => {
    mockWallets.forEach((w) => {
      w.readyState = "Loadable";
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /connect wallet & sign in/i }));

    expect(
      await screen.findByText(
        /opening solflare\. approve the connection, then return here to finish/i,
      ),
    ).toBeInTheDocument();
    expect(mockStartSolflare).toHaveBeenCalledWith({
      intent: "signin",
      statement: SOLANA_SIGN_IN_STATEMENT,
    });
    expect(mockSignInWithSolanaWallet).not.toHaveBeenCalled();
  });

  it("keeps the desktop dialog footnote", () => {
    setUserAgent(DESKTOP_UA);

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));

    expect(
      within(screen.getByRole("dialog")).getByText(/metaMask opens its official/i),
    ).toBeInTheDocument();
  });

  it("omits MetaMask from the wallet field summary on mobile", () => {
    renderPage();

    expect(screen.getByText("Solflare")).toBeInTheDocument();
    expect(screen.getByText(/^\d+ options?$/)).toBeInTheDocument();
    expect(screen.queryByText(/MetaMask/)).not.toBeInTheDocument();
  });

  it("shows the mobile uninstalled-wallet error inside the dialog", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /backpack/i }),
    );

    expect(
      within(screen.getByRole("dialog")).getByText(/backpack isn't available here/i),
    ).toBeInTheDocument();
  });
});
