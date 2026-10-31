import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MarketplaceWalletCard from "./MarketplaceWalletCard.tsx";
import type { PaymentMethodRow } from "../../lib/repositories/paymentMethods.ts";
import {
  getMarketplaceWallet,
  updateMarketplaceWallet,
} from "../../lib/repositories/workspaces.ts";

vi.mock("../../lib/repositories/workspaces.ts", () => ({
  getMarketplaceWallet: vi.fn(),
  updateMarketplaceWallet: vi.fn(),
}));

const SAVED_WALLET_ADDRESS = "So11111111111111111111111111111111111111112";

const savedCryptoMethod = {
  id: "pm-1",
  workspace_id: "ws-1",
  type: "Crypto Wallet",
  label: "Phantom",
  detail: SAVED_WALLET_ADDRESS,
  expiry: "devnet",
  holder: null,
  is_default: true,
  created_by: "user-1",
  created_at: "2026-10-31T09:00:00Z",
} as unknown as PaymentMethodRow;

function renderCard(
  cryptoMethods: PaymentMethodRow[] = [],
  onNotice?: (message: string) => void,
) {
  return render(
    <MarketplaceWalletCard
      workspaceId="ws-1"
      connectedAddress={null}
      cryptoMethods={cryptoMethods}
      onNotice={onNotice}
    />,
  );
}

async function openWalletMenu() {
  const trigger = await screen.findByRole("combobox", {
    name: "Marketplace receiving wallet",
  });
  await userEvent.click(trigger);
  return trigger;
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.setPointerCapture = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMarketplaceWallet).mockResolvedValue(null);
  vi.mocked(updateMarketplaceWallet).mockResolvedValue();
});

describe("MarketplaceWalletCard", () => {
  it("saves a saved crypto method as the marketplace receiving wallet", async () => {
    const onNotice = vi.fn();
    renderCard([savedCryptoMethod], onNotice);

    await openWalletMenu();
    await userEvent.click(await screen.findByRole("option", { name: /Phantom/ }));

    await waitFor(() =>
      expect(updateMarketplaceWallet).toHaveBeenCalledWith(
        "ws-1",
        SAVED_WALLET_ADDRESS,
      ),
    );
    expect(onNotice).toHaveBeenCalledWith("Marketplace receiving wallet saved.");
  });

  it("keeps the menu open when the parent re-renders with a new callback", async () => {
    const { rerender } = renderCard([savedCryptoMethod], vi.fn());

    await openWalletMenu();
    expect(await screen.findByRole("option", { name: /Phantom/ })).toBeInTheDocument();

    rerender(
      <MarketplaceWalletCard
        workspaceId="ws-1"
        connectedAddress={null}
        cryptoMethods={[savedCryptoMethod]}
        onNotice={vi.fn()}
      />,
    );

    expect(screen.getByRole("option", { name: /Phantom/ })).toBeInTheDocument();
    expect(getMarketplaceWallet).toHaveBeenCalledTimes(1);
  });

  it("shows a save failure inline and keeps the previous selection", async () => {
    vi.mocked(updateMarketplaceWallet).mockRejectedValue(
      new Error("new row violates row-level security policy"),
    );
    renderCard([savedCryptoMethod]);

    await openWalletMenu();
    await userEvent.click(await screen.findByRole("option", { name: /Phantom/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "new row violates row-level security policy",
    );
    expect(
      screen.getByText("Select a Solana wallet"),
    ).toBeInTheDocument();
  });

  it("disables the selector for members who cannot manage billing", async () => {
    render(
      <MarketplaceWalletCard
        workspaceId="ws-1"
        connectedAddress={null}
        cryptoMethods={[savedCryptoMethod]}
        canManage={false}
      />,
    );

    expect(
      await screen.findByRole("combobox", {
        name: "Marketplace receiving wallet",
      }),
    ).toBeDisabled();
  });

  it("does not show an unusable select when no wallet can be chosen", async () => {
    renderCard();

    expect(
      await screen.findByText(/No wallet assigned/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Marketplace receiving wallet" }),
    ).not.toBeInTheDocument();
  });
});
