import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
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
}));

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
    render(<WalletLoginPage />);

    expect(screen.getByText("SiteSurveyor")).toBeInTheDocument();
    expect(screen.getByText(/Solana Web3 Authentication/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in with brave wallet/i })).toBeInTheDocument();
  });

  it("shows the configured Solana cluster in the network pill", () => {
    render(<WalletLoginPage />);

    expect(
      screen.getByText(SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER]),
    ).toBeInTheDocument();
  });

  it("displays connected address pill with truncate format and copy button", () => {
    render(<WalletLoginPage />);

    expect(screen.getByText("8xK3...4jP9")).toBeInTheDocument();
    expect(screen.getByLabelText("Copy wallet address")).toBeInTheDocument();
    expect(screen.getByTitle("Disconnect wallet")).toBeInTheDocument();
  });

  it("switches to Create Account tab and displays Personal / Business account options", () => {
    render(<WalletLoginPage />);

    const createTab = screen.getByRole("tab", { name: /create account/i });
    fireEvent.click(createTab);

    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByText("Business Firm")).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create account & authorize/i })).toBeInTheDocument();
  });

  it("toggles business account scope and displays required firm name field", () => {
    render(<WalletLoginPage />);

    fireEvent.click(screen.getByRole("tab", { name: /create account/i }));

    const businessCard = screen.getByText("Business Firm").closest(".web3-type-card");
    expect(businessCard).toBeInTheDocument();
    if (businessCard) fireEvent.click(businessCard);

    expect(screen.getByLabelText(/survey firm \/ organization name/i)).toBeInTheDocument();
  });

  it("lists MetaMask as an install fallback alongside detected wallets", () => {
    mockWalletState.connected = false;
    render(<WalletLoginPage />);

    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("MetaMask")).toBeInTheDocument();
    expect(screen.getByText("Solflare")).toBeInTheDocument();
    expect(screen.getAllByText("Install extension")).toHaveLength(2);
    expect(screen.getByText("SiteSurveyor Wallet")).toBeInTheDocument();
  });

  it("does not select or persist an uninstalled wallet", () => {
    mockWalletState.connected = false;
    render(<WalletLoginPage />);

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
    render(<WalletLoginPage />);

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

    render(<WalletLoginPage />);

    const signInBtn = screen.getByRole("button", { name: /sign in with brave wallet/i });
    fireEvent.click(signInBtn);

    expect(mockSignInWithSolanaWallet).toHaveBeenCalled();
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

  it("shows open-in-app rows for Phantom and Solflare on mobile", () => {
    mockWallets.find((w) => w.adapter.name === "Phantom")!.readyState = "Loadable";

    render(<WalletLoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByText("Open in the Phantom app")).toBeInTheDocument();
    expect(within(dialog).getByText("Open in the Solflare app")).toBeInTheDocument();
  });

  it("hides the MetaMask install row on mobile", () => {
    render(<WalletLoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));

    expect(within(screen.getByRole("dialog")).queryByText("MetaMask")).not.toBeInTheDocument();
  });

  it("hands off to the wallet app on tap", () => {
    mockWallets.find((w) => w.adapter.name === "Phantom")!.readyState = "Loadable";

    render(<WalletLoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /^phantom/i }),
    );

    expect(mockOpenMobileWallet).toHaveBeenCalledWith("Phantom");
  });

  it("connects a detected Phantom in-page instead of handing off", async () => {
    render(<WalletLoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));

    const phantomRow = within(screen.getByRole("dialog")).getByRole("button", {
      name: /^phantom/i,
    });
    expect(within(phantomRow).getByText("Detected in this browser")).toBeInTheDocument();

    fireEvent.click(phantomRow);

    expect(mockSelect).toHaveBeenCalledWith("Phantom");
    await waitFor(() => expect(mockAdapterConnect).toHaveBeenCalled());
    expect(mockOpenMobileWallet).not.toHaveBeenCalled();
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

  it("surfaces the wallet-app row and routes Phantom through MWA", async () => {
    render(<WalletLoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Wallet app")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/no browser extension needed/i),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /^phantom/i }));

    expect(mockSelect).toHaveBeenCalledWith("Mobile Wallet Adapter");
    await waitFor(() => expect(mockAdapterConnect).toHaveBeenCalled());
    expect(mockOpenMobileWallet).not.toHaveBeenCalled();
  });

  it("tells the user which network the wallet app must be on", () => {
    render(<WalletLoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(new RegExp(`change network → ${SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER]}`, "i")),
    ).toBeInTheDocument();
  });

  it("explains a wallet network mismatch and offers the in-app browser", async () => {
    mockAdapterConnect.mockRejectedValueOnce(
      new Error(
        "Incorrect mode. You are trying to use devnet but Phantom is not in devnet mode.",
      ),
    );

    render(<WalletLoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^phantom/i }));

    expect(
      await within(dialog).findByText(/is on a different network/i),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: /continue in phantom/i }),
    );

    expect(mockOpenMobileWallet).toHaveBeenCalledWith("Phantom");
  });

  it("prefers the wallet app over the missing-extension error when signing in", async () => {
    mockWallets.forEach((w) => {
      if (w.adapter.name !== "Mobile Wallet Adapter") w.readyState = "Loadable";
    });
    mockSignInWithSolanaWallet.mockResolvedValueOnce({
      session: { access_token: "tok" },
      user: { id: "u-1" },
    });

    render(<WalletLoginPage />);
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

    render(<WalletLoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /connect wallet & sign in/i }));

    expect(
      await screen.findByText(/open this page inside the phantom or solflare app/i),
    ).toBeInTheDocument();
  });

  it("keeps the desktop dialog footnote", () => {
    setUserAgent(DESKTOP_UA);

    render(<WalletLoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));

    expect(
      within(screen.getByRole("dialog")).getByText(/metaMask opens its official/i),
    ).toBeInTheDocument();
  });

  it("omits MetaMask from the wallet field summary on mobile", () => {
    render(<WalletLoginPage />);

    expect(screen.getByText("Phantom, Solflare & SiteSurveyor")).toBeInTheDocument();
    expect(screen.queryByText(/MetaMask/)).not.toBeInTheDocument();
  });

  it("shows the mobile uninstalled-wallet error inside the dialog", () => {
    render(<WalletLoginPage />);
    fireEvent.click(screen.getByRole("button", { name: /choose a wallet/i }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: /backpack/i }),
    );

    expect(
      within(screen.getByRole("dialog")).getByText(/backpack isn't available here/i),
    ).toBeInTheDocument();
  });
});
