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
import {
  SOLANA_CLUSTER,
  SOLANA_CLUSTER_LABEL,
} from "../../features/phantom/lib/config.ts";

const mockConnect = vi.fn();
const mockSelect = vi.fn();
const mockDisconnect = vi.fn();
const mockSignInWithSolanaWallet = vi.fn();
const mockSignUpWithSolanaWallet = vi.fn();
const { mockSignOut, mockGetSignInProfile, mockRepairSignInProfile } =
  vi.hoisted(() => ({
    mockSignOut: vi.fn(),
    mockGetSignInProfile: vi.fn(),
    mockRepairSignInProfile: vi.fn(async (..._args: unknown[]) => undefined),
  }));
const { mockHasStoredWallet, mockCreateWallet, mockUnlockWallet } = vi.hoisted(
  () => ({
    mockHasStoredWallet: vi.fn(() => false),
    mockCreateWallet: vi.fn(),
    mockUnlockWallet: vi.fn(),
  }),
);
const mockWalletState = vi.hoisted(() => ({ connected: true }));

const { mockWallets, mockAdapterConnect, resetMockWallets, mockOpenMobileWallet } =
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
      mockOpenMobileWallet: vi.fn(),
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

vi.mock("../../features/phantom/lib/provider.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../features/phantom/lib/provider.ts")>()),
  openMobileWallet: mockOpenMobileWallet,
}));

vi.mock("../../features/phantom/lib/customWalletAdapter.ts", () => ({
  CUSTOM_WALLET_NAME: "SiteSurveyor Wallet",
  customWalletAdapter: {
    hasStoredWallet: mockHasStoredWallet,
    createWallet: mockCreateWallet,
    unlockWallet: mockUnlockWallet,
  },
}));

vi.mock("../../lib/auth/session.ts", () => ({
  signInWithSolanaWallet: (...args: unknown[]) => mockSignInWithSolanaWallet(...args),
  signUpWithSolanaWallet: (...args: unknown[]) => mockSignUpWithSolanaWallet(...args),
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
    mockHasStoredWallet.mockReturnValue(false);
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
    expect(screen.getByText("SiteSurveyor Wallet")).toBeInTheDocument();
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

  it("creates a SiteSurveyor Wallet from the local vault dialog", async () => {
    mockWalletState.connected = false;
    mockCreateWallet.mockResolvedValueOnce("created-address");
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /^sitesurveyor wallet/i }),
    );

    expect(await screen.findByText("Create your wallet")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/create a wallet pin/i), {
      target: { value: "12345678" },
    });
    fireEvent.change(screen.getByLabelText(/confirm wallet pin/i), {
      target: { value: "12345678" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create wallet/i }));

    await waitFor(() =>
      expect(mockCreateWallet).toHaveBeenCalledWith("12345678"),
    );
  });

  it("calls signInWithSolanaWallet when Sign In button clicked", async () => {
    mockSignInWithSolanaWallet.mockResolvedValueOnce({
      session: { access_token: "tok" },
      user: { id: "u-1" },
    });

    renderPage();

    const signInBtn = screen.getByRole("button", { name: /sign in with brave wallet/i });
    fireEvent.click(signInBtn);

    expect(mockSignInWithSolanaWallet).toHaveBeenCalled();
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

describe("WalletLoginPage (mobile handoff)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockWallets();
    setUserAgent(MOBILE_UA);
    mockWalletState.connected = false;
    mockHasStoredWallet.mockReturnValue(false);
  });

  it("keeps Phantom off mobile and offers Solflare's app handoff", () => {
    mockWallets.find((w) => w.adapter.name === "Phantom")!.readyState = "Loadable";

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).queryByText("Phantom")).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("Open in the Solflare app"),
    ).toBeInTheDocument();
  });

  it("hides the MetaMask install row on mobile", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));

    expect(within(screen.getByRole("dialog")).queryByText("MetaMask")).not.toBeInTheDocument();
  });

  it("opens Solflare's in-app browser on tap", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^solflare/i,
      }),
    );

    expect(mockOpenMobileWallet).toHaveBeenCalledWith("Solflare");
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
    mockHasStoredWallet.mockReturnValue(false);
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
    expect(mockOpenMobileWallet).not.toHaveBeenCalled();
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
    expect(mockOpenMobileWallet).not.toHaveBeenCalled();
  });
});

describe("WalletLoginPage (mobile copy)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockWallets();
    setUserAgent(MOBILE_UA);
    mockWalletState.connected = false;
    mockHasStoredWallet.mockReturnValue(false);
  });

  it("uses the mobile no-wallet error when no provider is present", async () => {
    mockWallets.forEach((w) => {
      w.readyState = "Loadable";
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /connect wallet & sign in/i }));

    expect(
      await screen.findByText(/open this page inside the solflare app/i),
    ).toBeInTheDocument();
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

    expect(screen.getByText("Solflare & SiteSurveyor")).toBeInTheDocument();
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
