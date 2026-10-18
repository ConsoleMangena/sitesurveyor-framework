import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import TransactionTable from "./TransactionTable.tsx";
import type { PaymentWithInvoice } from "@/lib/repositories/payments.ts";

function makeRow(overrides: Partial<PaymentWithInvoice>): PaymentWithInvoice {
  return {
    id: "row-1",
    workspace_id: "ws-1",
    invoice_id: null,
    paid_on: "2026-10-01",
    amount: 250,
    payment_method: "Solana (USDC)",
    reference: "ref-abc",
    notes: null,
    chain: null,
    token_mint: null,
    tx_signature: null,
    wallet_address: null,
    created_by: null,
    created_at: "2026-10-01T00:00:00Z",
    invoice_number: "INV-2026-001",
    ...overrides,
  } as PaymentWithInvoice;
}

describe("TransactionTable", () => {
  it("renders a row with invoice, amount and a Solana Explorer link when tx_signature is present", () => {
    render(
      <TransactionTable
        rows={[makeRow({ tx_signature: "5xyzSignature" })]}
        loading={false}
        error={null}
      />,
    );
    expect(screen.getByText("INV-2026-001")).toBeTruthy();
    expect(screen.getByText("$250.00")).toBeTruthy();
    const link = screen.getByRole("link", { name: /view on explorer/i });
    expect(link.getAttribute("href")).toContain("explorer.solana.com/tx/5xyzSignature");
  });

  it("omits the explorer link when there is no tx_signature", () => {
    render(
      <TransactionTable rows={[makeRow({ tx_signature: null })]} loading={false} error={null} />,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows the error message when provided", () => {
    render(<TransactionTable rows={[]} loading={false} error="Failed to load billing history" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load billing history");
  });

  it("shows the empty state when there are no rows", () => {
    render(<TransactionTable rows={[]} loading={false} error={null} />);
    expect(screen.getByText("No payments recorded yet.")).toBeTruthy();
  });
});
