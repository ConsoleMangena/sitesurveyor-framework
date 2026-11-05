import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ChangeEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.hoisted(() => vi.fn());
const sendTokens = vi.hoisted(() => vi.fn());
const createMarketplaceOrder = vi.hoisted(() => vi.fn());
const wallet = vi.hoisted(() => ({
  installed: true,
  isMobile: false,
  connected: true,
  address: "So11111111111111111111111111111111111111112",
  shortAddress: "So11…1112",
  connecting: false,
  connect: vi.fn(),
  openMobile: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("../../lib/supabase/client.ts", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  },
}));
vi.mock("../../features/phantom/hooks/usePhantomWallet.ts", () => ({
  usePhantomWallet: () => wallet,
}));
vi.mock("../../features/phantom/payments/phantomPay.ts", () => ({ sendTokens }));
vi.mock("../../lib/repositories/marketplaceOrders.ts", () => ({
  createMarketplaceOrder,
}));
vi.mock("../SelectDropdown.tsx", () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select
      aria-label="Token"
      value={value}
      onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
    >
      <option value="USDC">USDC</option>
      <option value="SOL">SOL</option>
    </select>
  ),
}));

import { ListingPaymentPanel } from "./ListingPaymentPanel";

const listing = {
  id: "L1",
  name: "Trimble S9 Total Station",
  price: 250,
  currency: "USD",
  listingType: "hire",
};

function sellerRow(overrides: Record<string, unknown> = {}) {
  return {
    workspace_id: "ws-seller",
    seller_wallet_address: "So11111111111111111111111111111111111111112",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  maybeSingle.mockResolvedValue({ data: sellerRow(), error: null });
  sendTokens.mockResolvedValue({ signature: "5sig" });
  createMarketplaceOrder.mockResolvedValue({ id: "order-123456789" });
  wallet.installed = true;
});

describe("ListingPaymentPanel", () => {
  it("shows the seller wallet and the amount before anything is signed", async () => {
    render(<ListingPaymentPanel listing={listing} buyerWorkspaceId="ws-buyer" />);

    const code = await screen.findByText("So11111111111111111111111111111111111111112");
    expect(code).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pay 250 USDC/ })).toBeEnabled();
    expect(sendTokens).not.toHaveBeenCalled();
  });

  it("blocks payment when the seller has no wallet on the listing", async () => {
    maybeSingle.mockResolvedValue({ data: sellerRow({ seller_wallet_address: null }), error: null });
    render(<ListingPaymentPanel listing={listing} buyerWorkspaceId="ws-buyer" />);

    await screen.findByText("The seller has not added a Solana wallet to this listing.");
    expect(screen.getByRole("button", { name: /Pay 250 USDC/ })).toBeDisabled();
  });

  it("blocks payment when Phantom is not installed", async () => {
    wallet.installed = false;
    render(<ListingPaymentPanel listing={listing} buyerWorkspaceId="ws-buyer" />);

    await screen.findByText(/Phantom wallet is not installed/);
    expect(screen.getByRole("button", { name: /Pay 250 USDC/ })).toBeDisabled();
  });

  it("rejects a malformed seller address instead of attempting a transfer", async () => {
    maybeSingle.mockResolvedValue({
      data: sellerRow({ seller_wallet_address: "definitely-not-a-key" }),
      error: null,
    });
    render(<ListingPaymentPanel listing={listing} buyerWorkspaceId="ws-buyer" />);

    const button = await screen.findByRole("button", { name: /Pay 250 USDC/ });
    fireEvent.click(button);

    await screen.findByText("The seller wallet address on this listing is invalid.");
    expect(sendTokens).not.toHaveBeenCalled();
  });

  it("sends the payment, records the order and shows the explorer link", async () => {
    const onPaid = vi.fn();
    render(<ListingPaymentPanel listing={listing} buyerWorkspaceId="ws-buyer" onPaid={onPaid} />);

    fireEvent.click(await screen.findByRole("button", { name: /Pay 250 USDC/ }));

    await screen.findByText("Payment sent and order recorded.");
    expect(sendTokens).toHaveBeenCalledWith({
      token: "USDC",
      recipient: "So11111111111111111111111111111111111111112",
      amount: 250,
    });
    expect(createMarketplaceOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        listing_id: "L1",
        listing_workspace_id: "ws-seller",
        buyer_workspace_id: "ws-buyer",
        amount: 250,
        currency: "USDC",
        provider: "solana",
        external_payment_ref: "5sig",
        payment_status: "completed",
      }),
    );
    expect(onPaid).toHaveBeenCalledWith("order-123456789");
    expect(
      screen.getByRole("link", { name: "View transaction on Solana Explorer" }),
    ).toHaveAttribute("href", expect.stringContaining("/tx/5sig"));
  });

  it("reports a declined transfer without recording an order", async () => {
    sendTokens.mockRejectedValue(new Error("User rejected the transaction."));
    render(<ListingPaymentPanel listing={listing} buyerWorkspaceId="ws-buyer" />);

    fireEvent.click(await screen.findByRole("button", { name: /Pay 250 USDC/ }));

    await waitFor(() =>
      expect(screen.getByText("User rejected the transaction.")).toBeInTheDocument(),
    );
    expect(createMarketplaceOrder).not.toHaveBeenCalled();
  });
});
