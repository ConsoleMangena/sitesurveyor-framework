import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WalletLoginPage from "./WalletLoginPage.tsx";

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
    wallets: [
      {
        adapter: {
          name: "Brave Wallet",
          icon: "data:image/svg+xml;base64,mock",
        },
        readyState: "Installed",
      },
      {
        adapter: {
          name: "Phantom",
          icon: "data:image/svg+xml;base64,mock",
        },
        readyState: "Installed",
      },
      {
        adapter: {
          name: "Solflare",
          icon: "data:image/svg+xml;base64,mock",
        },
        readyState: "Installed",
      },
      {
        adapter: {
          name: "SiteSurveyor Wallet",
          icon: "/logo.svg",
        },
        readyState: "Loadable",
      },
    ],
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
    expect(screen.getByText("Install extension")).toBeInTheDocument();
    expect(screen.getByText("SiteSurveyor Wallet")).toBeInTheDocument();
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
