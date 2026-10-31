import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PaymentMethodRow } from "../../../lib/repositories/paymentMethods.ts";
import WalletMethodsCard from "./WalletMethodsCard.tsx";

const SAVED_ADDRESS = "So11111111111111111111111111111111111111112";
const CUSTOM_WALLET = "SiteSurveyor Wallet";

const mocks = vi.hoisted(() => {
  const adapter = {
    name: "Phantom",
    icon: "/solanaLogoMark.svg",
    readyState: "Installed",
    connected: false,
    publicKey: null as { toBase58: () => string } | null,
    connect: vi.fn(),
  };
  return {
    adapter,
    select: vi.fn(),
    createPaymentMethod: vi.fn(),
    customWalletName: "SiteSurveyor Wallet",
    customWalletAdapter: {
      publicKey: null as { toBase58: () => string } | null,
      connected: false,
      unlockWallet: vi.fn(),
      createWallet: vi.fn(),
    },
  };
});

vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({
    wallets: [{ adapter: mocks.adapter, readyState: "Installed" }],
    select: mocks.select,
    wallet: null,
    connected: false,
  }),
}));

vi.mock("../../../lib/repositories/paymentMethods.ts", () => ({
  createPaymentMethod: mocks.createPaymentMethod,
}));

vi.mock("../hooks/useCustomWalletStatus.ts", () => ({
  useCustomWalletStatus: () => ({ status: "none", refresh: vi.fn() }),
}));

vi.mock("../lib/customWalletAdapter.ts", () => ({
  CUSTOM_WALLET_NAME: mocks.customWalletName,
  customWalletAdapter: mocks.customWalletAdapter,
}));

const savedMethod = {
  id: "pm-1",
  workspace_id: "ws-1",
  type: "Crypto Wallet",
  label: "Phantom",
  detail: SAVED_ADDRESS,
  expiry: "devnet",
  holder: null,
  is_default: true,
  created_by: "user-1",
  created_at: "2026-10-31T09:00:00Z",
} as unknown as PaymentMethodRow;

function renderCard(paymentMethods: PaymentMethodRow[] = []) {
  const onMethodsChanged = vi.fn().mockResolvedValue(undefined);
  const onNotice = vi.fn();
  render(
    <WalletMethodsCard
      workspaceId="ws-1"
      paymentMethods={paymentMethods}
      canManageBilling
      onMethodsChanged={onMethodsChanged}
      onNotice={onNotice}
    />,
  );
  return { onMethodsChanged, onNotice };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.connected = false;
  mocks.adapter.publicKey = null;
  mocks.customWalletAdapter.publicKey = null;
});

describe("WalletMethodsCard", () => {
  it("lets a saved wallet be reconnected when its adapter is disconnected", async () => {
    mocks.adapter.connect.mockImplementation(async () => {
      mocks.adapter.connected = true;
      mocks.adapter.publicKey = { toBase58: () => SAVED_ADDRESS };
    });
    const { onNotice } = renderCard([savedMethod]);

    expect(screen.getByText("Saved")).toBeInTheDocument();
    const connect = screen.getByRole("button", { name: "Connect" });
    expect(connect).toBeEnabled();

    await userEvent.click(connect);

    await waitFor(() => expect(mocks.adapter.connect).toHaveBeenCalledTimes(1));
    expect(mocks.createPaymentMethod).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenCalledWith(
      "Phantom is already a saved wallet method.",
    );
  });

  it("unlocks the built-in wallet and saves it as a receiving method", async () => {
    const { onNotice } = renderCard([]);
    mocks.customWalletAdapter.createWallet.mockImplementation(async () => {
      mocks.customWalletAdapter.publicKey = { toBase58: () => SAVED_ADDRESS };
      mocks.customWalletAdapter.connected = true;
      return SAVED_ADDRESS;
    });

    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    await userEvent.type(
      screen.getByPlaceholderText("Wallet PIN"),
      "a-strong-pin",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /create wallet/i }),
    );

    await waitFor(() =>
      expect(mocks.customWalletAdapter.createWallet).toHaveBeenCalledWith(
        "a-strong-pin",
      ),
    );
    expect(mocks.select).toHaveBeenCalledWith(CUSTOM_WALLET);
    expect(mocks.createPaymentMethod).toHaveBeenCalledWith(
      "ws-1",
      expect.objectContaining({
        type: "Crypto Wallet",
        label: CUSTOM_WALLET,
        detail: SAVED_ADDRESS,
      }),
    );
    expect(onNotice).toHaveBeenCalledWith(
      `${CUSTOM_WALLET} added as a receiving wallet.`,
    );
  });
});
