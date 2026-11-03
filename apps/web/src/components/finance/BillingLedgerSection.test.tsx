import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import BillingLedgerSection from "./BillingLedgerSection.tsx";
import {
  listPesepayTransactions,
  recordTransactionRefund,
  verifyOrder,
  type PesepayTransactionRow,
} from "../../lib/repositories/pesepay.ts";

vi.mock("../../lib/repositories/pesepay.ts", () => ({
  listPesepayTransactions: vi.fn(),
  recordTransactionRefund: vi.fn(),
  verifyOrder: vi.fn(),
}));

function makeRow(id: string, overrides: Partial<PesepayTransactionRow>): PesepayTransactionRow {
  return {
    id,
    wallet_id: "wallet-1",
    workspace_id: "workspace-1",
    user_id: "user-1",
    kind: "ai_credit_purchase",
    amount: 25,
    currency_code: "USD",
    status: "completed",
    description: `Payment ${id}`,
    pesepay_reference: `REF-${id}`,
    provider_status: "SUCCESS",
    related_id: "ledger-1",
    package_id: "credits-500",
    credit_amount: 500,
    storage_mb: null,
    duration_days: null,
    estimated_infrastructure_cost: 5,
    estimated_payment_fee: 0.875,
    refund_reason: null,
    refunded_at: null,
    refunded_by: null,
    created_at: "2026-11-03T09:00:00Z",
    completed_at: "2026-11-03T09:00:05Z",
    ...overrides,
  } as unknown as PesepayTransactionRow;
}

const completed = makeRow("completed", { description: "500 AI credits" });
const pending = makeRow("pending", { status: "pending", description: "50 GB storage" });
const failed = makeRow("failed", { status: "failed", description: "Declined card charge" });
const cancelled = makeRow("cancelled", { status: "cancelled", description: "Abandoned checkout" });
const refunded = makeRow("refunded", {
  status: "refunded",
  description: "Duplicate charge",
  refund_reason: "Settled with the provider",
  refunded_at: "2026-11-03T10:00:00Z",
});
const ROWS = [completed, pending, failed, cancelled, refunded];

function renderSection(onMessage = vi.fn(), isPlatformAdmin = false) {
  render(
    <BillingLedgerSection
      workspaceId="workspace-1"
      refreshKey={0}
      onMessage={onMessage}
      onSettled={vi.fn()}
      isPlatformAdmin={isPlatformAdmin}
    />,
  );
  return onMessage;
}

function openRefundForm() {
  fireEvent.click(screen.getByRole("button", { name: "Refund" }));
  return screen.getByLabelText("Reason for this refund");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPesepayTransactions).mockResolvedValue(ROWS);
});

describe("BillingLedgerSection filters", () => {
  it("filters each stored status instead of folding cancelled into failed", async () => {
    renderSection();
    await screen.findByText("500 AI credits");

    fireEvent.click(screen.getByRole("button", { name: "Cancelled" }));
    expect(await screen.findByText("Abandoned checkout")).toBeTruthy();
    expect(screen.queryByText(/Settled with the provider/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Failed" }));
    expect(await screen.findByText("Declined card charge")).toBeTruthy();
    expect(screen.queryByText("Abandoned checkout")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Refunded" }));
    expect(await screen.findByText(/Settled with the provider/)).toBeTruthy();
    expect(screen.queryByText("500 AI credits")).toBeNull();
  });

  it("totals the refunded money in the current view", async () => {
    renderSection();
    await screen.findByText("500 AI credits");
    expect(screen.getByText(/Refunded:/, { selector: "span" })).toBeTruthy();
  });
});

describe("BillingLedgerSection refunds", () => {
  it("keeps the refund action away from members who are not platform administrators", async () => {
    renderSection();
    await screen.findByText("500 AI credits");
    expect(screen.queryByRole("button", { name: "Refund" })).toBeNull();
  });

  it("needs a written reason before a refund can be recorded", async () => {
    renderSection(vi.fn(), true);
    await screen.findByText("500 AI credits");

    const reason = openRefundForm();
    const confirm = screen.getByRole("button", { name: "Record refund" });
    expect(confirm).toBeDisabled();

    fireEvent.change(reason, { target: { value: "no" } });
    expect(confirm).toBeDisabled();

    fireEvent.change(reason, { target: { value: "Duplicate charge, upheld by provider" } });
    expect(confirm).not.toBeDisabled();
  });

  it("records the refund and reports the credits that could not be taken back", async () => {
    vi.mocked(recordTransactionRefund).mockResolvedValue({
      creditsGranted: 500,
      creditsReclaimed: 120,
      storageMbRevoked: 0,
      balanceReclaimed: 0,
    });
    const onMessage = renderSection(vi.fn(), true);
    await screen.findByText("500 AI credits");

    fireEvent.change(openRefundForm(), {
      target: { value: "Duplicate charge, upheld by provider" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record refund" }));

    await waitFor(() =>
      expect(recordTransactionRefund).toHaveBeenCalledWith(
        "completed",
        "Duplicate charge, upheld by provider",
      ),
    );
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        tone: "success",
        text: expect.stringContaining("Only 120 of the 500 credits"),
      }),
    );
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("were still in the balance to take back"),
      }),
    );
    expect(vi.mocked(listPesepayTransactions)).toHaveBeenCalledTimes(2);
  });

  it("names what a storage refund stops counting, and what it leaves alone", async () => {
    vi.mocked(recordTransactionRefund).mockResolvedValue({
      creditsGranted: 0,
      creditsReclaimed: 0,
      storageMbRevoked: 51200,
      balanceReclaimed: 0,
    });
    vi.mocked(listPesepayTransactions).mockResolvedValue([
      makeRow("storage", {
        kind: "storage_purchase",
        description: "50 GB for 30 days",
        credit_amount: null,
        storage_mb: 51200,
        duration_days: 30,
      }),
    ]);
    const onMessage = renderSection(vi.fn(), true);
    await screen.findByText("50 GB for 30 days");

    fireEvent.change(openRefundForm(), { target: { value: "Customer changed plans" } });
    fireEvent.click(screen.getByRole("button", { name: "Record refund" }));

    await waitFor(() =>
      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Stored files are untouched"),
        }),
      ),
    );
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("51,200 MB of purchased storage stopped counting"),
      }),
    );
  });

  it("surfaces the server reason when a payment cannot be refunded", async () => {
    vi.mocked(recordTransactionRefund).mockRejectedValue(
      new Error("Only a completed payment can be refunded (this one is pending)"),
    );
    const onMessage = renderSection(vi.fn(), true);
    await screen.findByText("500 AI credits");

    fireEvent.change(openRefundForm(), { target: { value: "Dispute upheld by provider" } });
    fireEvent.click(screen.getByRole("button", { name: "Record refund" }));

    await waitFor(() =>
      expect(onMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: "error",
          text: "Only a completed payment can be refunded (this one is pending)",
        }),
      ),
    );
    expect(vi.mocked(listPesepayTransactions)).toHaveBeenCalledTimes(1);
  });

  it("still checks a pending order with the provider", async () => {
    vi.mocked(verifyOrder).mockResolvedValue({ status: "pending" } as never);
    renderSection();
    await screen.findByText("50 GB storage");

    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    await waitFor(() =>
      expect(verifyOrder).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        orderId: "pending",
      }),
    );
  });
});
