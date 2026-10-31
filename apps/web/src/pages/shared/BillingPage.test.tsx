import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import BillingPage from "./BillingPage.tsx";
import type { InvoiceWithDetails } from "../../lib/repositories/invoices.ts";
import type { PesepayWalletRow } from "../../lib/repositories/pesepay.ts";
import type { WorkspaceMemberRow } from "../../lib/repositories/workspaces.ts";
import { getMyWorkspaceMembership } from "../../lib/repositories/workspaces.ts";
import { listInvoices } from "../../lib/repositories/invoices.ts";
import { listPayments } from "../../lib/repositories/payments.ts";
import {
  getPesepayWallet,
  payInvoiceWithBalance,
} from "../../lib/repositories/pesepay.ts";
import { listPaymentMethods } from "../../lib/repositories/paymentMethods.ts";
import { useSiteSurveyorWallet } from "../../features/phantom/hooks/useSiteSurveyorWallet.ts";
import { useSolanaBalances } from "../../features/phantom/hooks/useSolanaBalances.ts";
import { estimateUsdcTransferFee } from "../../features/phantom/payments/phantomPay.ts";

vi.mock("../../lib/repositories/invoices.ts", () => ({
  listInvoices: vi.fn(),
}));

vi.mock("../../lib/repositories/payments.ts", () => ({
  createPayment: vi.fn(),
  listPayments: vi.fn(),
}));

vi.mock("../../lib/repositories/pesepay.ts", () => ({
  getPesepayWallet: vi.fn(),
  initiatePesepayCheckout: vi.fn(),
  payInvoiceWithBalance: vi.fn(),
}));

vi.mock("../../lib/repositories/paymentMethods.ts", () => ({
  listPaymentMethods: vi.fn(),
  deletePaymentMethod: vi.fn(),
  setDefaultPaymentMethod: vi.fn(),
}));

vi.mock("../../lib/repositories/workspaces.ts", () => ({
  getMyWorkspaceMembership: vi.fn(),
  getMarketplaceWallet: vi.fn().mockResolvedValue(null),
  updateMarketplaceWallet: vi.fn(),
}));

vi.mock("../../features/phantom/hooks/useSiteSurveyorWallet.ts", () => ({
  useSiteSurveyorWallet: vi.fn(),
}));

vi.mock("../../features/phantom/hooks/useSolanaBalances.ts", () => ({
  useSolanaBalances: vi.fn(),
}));

vi.mock("../../features/phantom/payments/phantomPay.ts", () => ({
  payInvoiceWithUsdc: vi.fn(),
  estimateUsdcTransferFee: vi.fn(),
}));

vi.mock("../../features/phantom/components/WalletMethodsCard.tsx", () => ({
  default: () => null,
}));

// The real adapter opens a Solana Connection at module load, which the test
// websocket stub rejects.
vi.mock("../../features/phantom/lib/customWalletAdapter.ts", () => ({
  CUSTOM_WALLET_NAME: "SiteSurveyor Wallet",
  customWalletAdapter: {},
}));

const invoice = {
  id: "inv-1",
  workspace_id: "ws-1",
  invoice_number: "INV-0042",
  status: "sent",
  total: 40,
  currency_code: "USD",
} as unknown as InvoiceWithDetails;

function pesepayWallet(balance: number): PesepayWalletRow {
  return {
    id: "wallet-1",
    workspace_id: "ws-1",
    user_id: "user-1",
    currency_code: "USD",
    balance,
    created_at: "2026-10-31T09:00:00Z",
    updated_at: "2026-10-31T09:00:00Z",
  };
}

const membership = { role: "owner" } as unknown as WorkspaceMemberRow;

function renderBilling() {
  const onNavigate = vi.fn();
  render(
    <MemoryRouter initialEntries={["/?view=billing"]}>
      <BillingPage workspaceId="ws-1" onNavigate={onNavigate} />
    </MemoryRouter>,
  );
  return { onNavigate };
}

async function openComposer() {
  const trigger = await screen.findByRole("button", { name: /make a payment/i });
  await waitFor(() => expect(trigger).toBeEnabled());
  await userEvent.click(trigger);
  return screen.findByText("Payment rail");
}

async function selectInvoice() {
  await userEvent.click(screen.getByRole("combobox"));
  await userEvent.click(await screen.findByText("INV-0042 - $40.00"));
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMyWorkspaceMembership).mockResolvedValue(membership);
  vi.mocked(listInvoices).mockResolvedValue([invoice]);
  vi.mocked(listPayments).mockResolvedValue([]);
  vi.mocked(listPaymentMethods).mockResolvedValue([]);
  vi.mocked(getPesepayWallet).mockResolvedValue(pesepayWallet(25));
  vi.mocked(payInvoiceWithBalance).mockResolvedValue({
    status: "paid",
    paymentId: "payment-1",
    balance: 60,
  });
  vi.mocked(estimateUsdcTransferFee).mockResolvedValue(0.000005);
  vi.mocked(useSiteSurveyorWallet).mockReturnValue({
    address: null,
    installed: false,
    wallet: null,
    publicKey: null,
    sendTransaction: vi.fn(),
  } as unknown as ReturnType<typeof useSiteSurveyorWallet>);
  vi.mocked(useSolanaBalances).mockReturnValue({
    sol: 0.42,
    usdc: 120,
    loading: false,
    error: null,
    refresh: vi.fn(),
  });
});

describe("BillingPage payment rails", () => {
  it("shows crypto wallets and the PesePay balance as separate rails", async () => {
    renderBilling();

    expect(await screen.findByText("Payment rails")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Crypto wallets" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "PesePay balance" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No wallet connected")).toBeInTheDocument();
    expect(screen.getByText("120.00")).toBeInTheDocument();
    expect(await screen.findByText("25.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add funds/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Transactions" })).toBeInTheDocument();
  });

  it("defaults the composer to the PesePay rail and separates the two payment paths", async () => {
    const { onNavigate } = renderBilling();
    await openComposer();

    const cryptoChoice = screen.getByRole("button", { name: /^Crypto wallet/ });
    const balanceChoice = screen.getByRole("button", { name: /^PesePay balance/ });
    expect(cryptoChoice).toHaveAttribute("aria-pressed", "false");
    expect(balanceChoice).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText("Select a USD invoice to pay from your balance."),
    ).toBeInTheDocument();

    await selectInvoice();

    expect(document.querySelector(".payment-ticket-name")).toHaveTextContent(
      "INV-0042",
    );
    expect(
      screen.getByText(
        "Your balance covers $25.00 of $40.00. Add funds to pay this invoice.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /pay from pesepay balance/i }),
    ).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /add funds/i }));
    expect(onNavigate).toHaveBeenCalledWith("settings");

    await userEvent.click(cryptoChoice);
    expect(cryptoChoice).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Connect a Solana wallet to pay with USDC.")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /record an offline payment/i }),
    );
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", {
        name: /pay an invoice with a wallet or balance instead/i,
      }),
    );
    expect(screen.getByText("Payment rail")).toBeInTheDocument();
  });

  it("pays an invoice from the PesePay balance when it is covered", async () => {
    vi.mocked(getPesepayWallet).mockResolvedValue(pesepayWallet(100));
    renderBilling();
    await openComposer();
    await selectInvoice();

    const payButton = screen.getByRole("button", {
      name: /pay from pesepay balance/i,
    });
    await waitFor(() => expect(payButton).toBeEnabled());
    await userEvent.click(payButton);

    await waitFor(() =>
      expect(payInvoiceWithBalance).toHaveBeenCalledWith({
        invoiceId: "inv-1",
        workspaceId: "ws-1",
      }),
    );
    expect(
      await screen.findByText("Invoice paid from your PesePay balance."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Payment rail")).not.toBeInTheDocument();
  });
});
