import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ChangeEvent } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.hoisted(() => vi.fn());
const sendTokens = vi.hoisted(() => vi.fn());
const createMarketplaceOrder = vi.hoisted(() => vi.fn());
const attachPaymentSignature = vi.hoisted(() => vi.fn());
const cancelPendingOrder = vi.hoisted(() => vi.fn());
const resolveListingPayout = vi.hoisted(() => vi.fn());
const verifyMarketPayment = vi.hoisted(() => vi.fn());
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
  attachPaymentSignature,
  cancelPendingOrder,
  resolveListingPayout,
  verifyMarketPayment,
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

beforeEach(() => {
  vi.clearAllMocks();
  resolveListingPayout.mockResolvedValue({
    workspaceId: "ws-seller",
    walletAddress: "So11111111111111111111111111111111111111112",
  });
  sendTokens.mockResolvedValue({ signature: "5sig" });
  createMarketplaceOrder.mockResolvedValue({ id: "order-123456789" });
  attachPaymentSignature.mockResolvedValue(undefined);
  cancelPendingOrder.mockResolvedValue(undefined);
  verifyMarketPayment.mockResolvedValue({ verified: true, status: "completed" });
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

  it("blocks payment when the seller has no wallet", async () => {
    resolveListingPayout.mockResolvedValue({ workspaceId: "ws-seller", walletAddress: null });
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
    resolveListingPayout.mockResolvedValue({
      workspaceId: "ws-seller",
      walletAddress: "definitely-not-a-key",
    });
    render(<ListingPaymentPanel listing={listing} buyerWorkspaceId="ws-buyer" />);

    const button = await screen.findByRole("button", { name: /Pay 250 USDC/ });
    fireEvent.click(button);

    await screen.findByText("The seller wallet address on this listing is invalid.");
    expect(sendTokens).not.toHaveBeenCalled();
  });

  it("records the order before signing, then attaches the signature and asks the server to confirm", async () => {
    const onPaid = vi.fn();
    render(<ListingPaymentPanel listing={listing} buyerWorkspaceId="ws-buyer" onPaid={onPaid} />);

    fireEvent.click(await screen.findByRole("button", { name: /Pay 250 USDC/ }));

    await screen.findByText("Payment confirmed on chain.");
    expect(createMarketplaceOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        listing_id: "L1",
        listing_workspace_id: "ws-seller",
        buyer_workspace_id: "ws-buyer",
        amount: 250,
        currency: "USDC",
        provider: "solana",
        payment_status: "pending",
      }),
    );
    // The claim is never written by the browser.
    expect(createMarketplaceOrder.mock.calls[0][0].payment_status).not.toBe("completed");
    expect(createMarketplaceOrder.mock.calls[0][0].external_payment_ref).toBeUndefined();

    expect(sendTokens).toHaveBeenCalledWith({
      token: "USDC",
      recipient: "So11111111111111111111111111111111111111112",
      amount: 250,
    });
    expect(attachPaymentSignature).toHaveBeenCalledWith("order-123456789", "5sig");
    expect(verifyMarketPayment).toHaveBeenCalledWith("order-123456789");
    expect(onPaid).toHaveBeenCalledWith("order-123456789");
    expect(
      screen.getByRole("link", { name: "View transaction on Solana Explorer" }),
    ).toHaveAttribute("href", expect.stringContaining("/tx/5sig"));
  });

  it("keeps the payment honest when the verifier has not confirmed it yet", async () => {
    verifyMarketPayment.mockResolvedValue({
      verified: false,
      reason: "The transaction is not confirmed yet. Try again shortly.",
    });
    render(<ListingPaymentPanel listing={listing} buyerWorkspaceId="ws-buyer" />);

    fireEvent.click(await screen.findByRole("button", { name: /Pay 250 USDC/ }));

    await screen.findByText("Payment sent. We are still confirming it on chain.");
    expect(
      screen.getByText("The transaction is not confirmed yet. Try again shortly."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Payment confirmed on chain.")).toBeNull();
  });

  it("cancels the pending order when the wallet declines, and never sends", async () => {
    sendTokens.mockRejectedValue(new Error("User rejected the transaction."));
    render(<ListingPaymentPanel listing={listing} buyerWorkspaceId="ws-buyer" />);

    fireEvent.click(await screen.findByRole("button", { name: /Pay 250 USDC/ }));

    await waitFor(() =>
      expect(screen.getByText("User rejected the transaction.")).toBeInTheDocument(),
    );
    expect(cancelPendingOrder).toHaveBeenCalledWith("order-123456789");
    expect(attachPaymentSignature).not.toHaveBeenCalled();
    expect(verifyMarketPayment).not.toHaveBeenCalled();
  });

  it("sends nothing at all when the order cannot be recorded", async () => {
    createMarketplaceOrder.mockRejectedValue(new Error("Failed to record marketplace order: denied"));
    render(<ListingPaymentPanel listing={listing} buyerWorkspaceId="ws-buyer" />);

    fireEvent.click(await screen.findByRole("button", { name: /Pay 250 USDC/ }));

    await screen.findByText(/Failed to record marketplace order/);
    expect(sendTokens).not.toHaveBeenCalled();
  });
});
