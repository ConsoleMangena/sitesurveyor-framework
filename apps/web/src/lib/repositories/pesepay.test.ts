import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAiCreditBalance,
  initiatePackageCheckout,
  initiatePesepayCheckout,
  listBillingPackages,
  payInvoiceWithBalance,
  payPackageWithBalance,
  verifyWalletDeposit,
} from "./pesepay.ts";
import { supabase } from "../supabase/client.ts";

vi.mock("../supabase/client.ts", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

/** PostgREST builders resolve when awaited, so a resolved promise stands in for a query. */
function chainable(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: unknown) => void) =>
      Promise.resolve(result).then(resolve),
  };
  return builder;
}

describe("billing package catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads active packages from the database, newest order first", async () => {
    const builder = chainable({
      data: [
        {
          id: "storage-50gb",
          kind: "storage",
          label: "50 GB",
          description: "50 GB for 30 days",
          credits: null,
          storage_mb: "51200",
          duration_days: 30,
          amount: "15.00",
          currency_code: "USD",
          estimated_infrastructure_cost: "1.0650",
          estimated_payment_fee: "0.4750",
          active: true,
          sort_order: 2,
        },
      ],
      error: null,
    });
    vi.mocked(supabase.from).mockReturnValue(builder as never);

    const [pkg] = await listBillingPackages("storage");

    expect(supabase.from).toHaveBeenCalledWith("billing_packages");
    expect(builder.eq).toHaveBeenCalledWith("active", true);
    expect(builder.eq).toHaveBeenCalledWith("kind", "storage");
    expect(pkg).toMatchObject({
      id: "storage-50gb",
      kind: "storage",
      storageMb: 51200,
      durationDays: 30,
      amount: 15,
      estimatedInfrastructureCost: 1.065,
      estimatedPaymentFee: 0.475,
    });
  });

  it("reads the workspace credit balance without trusting client maths", async () => {
    vi.mocked(supabase.from).mockReturnValue(
      chainable({ data: { balance: 340 }, error: null }) as never,
    );

    await expect(getAiCreditBalance("workspace-1")).resolves.toBe(340);
    expect(supabase.from).toHaveBeenCalledWith("workspace_ai_credit_accounts");
  });
});

describe("PesePay wallet repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies a deposit as an order check", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { status: "completed", kind: "deposit" },
      error: null,
    });

    await expect(
      verifyWalletDeposit({ workspaceId: "workspace-1", depositId: "deposit-1" }),
    ).resolves.toEqual({ status: "completed", transactionStatus: null });
    expect(supabase.functions.invoke).toHaveBeenCalledWith("pesepay", {
      body: { workspaceId: "workspace-1", orderId: "deposit-1", action: "verify-order" },
    });
  });

  it("reports a cancelled provider order as a failed deposit", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { status: "cancelled", kind: "deposit", transactionStatus: "CANCELLED" },
      error: null,
    });

    await expect(
      verifyWalletDeposit({ workspaceId: "workspace-1", depositId: "deposit-1" }),
    ).resolves.toMatchObject({ status: "failed", transactionStatus: "CANCELLED" });
  });

  it("surfaces the Edge Function reason for a failed balance payment", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: "Insufficient PesePay balance" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      } as never,
    });

    await expect(
      payPackageWithBalance({ workspaceId: "workspace-1", packageId: "storage-10gb" }),
    ).rejects.toThrow("Insufficient PesePay balance");
  });

  it("sends a fresh request id so a retried balance payment is not double-spent", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { status: "paid", purchaseId: "purchase-1", balance: 10 },
      error: null,
    });

    await payPackageWithBalance({ workspaceId: "workspace-1", packageId: "storage-10gb" });
    const body = vi.mocked(supabase.functions.invoke).mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      workspaceId: "workspace-1",
      packageId: "storage-10gb",
      action: "pay-package-balance",
    });
    expect(body.requestId).toEqual(expect.any(String));
  });

  it("sends a fresh request id when paying an invoice from the balance", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { status: "paid", paymentId: "payment-1", balance: 45 },
      error: null,
    });

    await expect(payInvoiceWithBalance({ workspaceId: "workspace-1", invoiceId: "invoice-1" })).resolves.toEqual({
      status: "paid",
      paymentId: "payment-1",
      balance: 45,
    });
    const body = vi.mocked(supabase.functions.invoke).mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body).toMatchObject({ workspaceId: "workspace-1", invoiceId: "invoice-1", action: "pay-invoice-balance" });
    expect(body.requestId).toEqual(expect.any(String));
  });

  it("keeps the invoice checkout reference so the callback can find the order", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { redirectUrl: "https://checkout.pesepay", referenceNumber: "PESE-1", orderId: "order-1" },
      error: null,
    });

    await expect(
      initiatePesepayCheckout({ workspaceId: "workspace-1", invoiceId: "invoice-1" }),
    ).resolves.toEqual({
      redirectUrl: "https://checkout.pesepay",
      referenceNumber: "PESE-1",
      orderId: "order-1",
    });
    expect(supabase.functions.invoke).toHaveBeenCalledWith("pesepay", {
      body: { workspaceId: "workspace-1", invoiceId: "invoice-1", action: "pay-invoice" },
    });
  });

  it("rejects a package checkout that never opened a pending order", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { redirectUrl: "https://checkout.pesepay", referenceNumber: "PESE-2" },
      error: null,
    });

    await expect(
      initiatePackageCheckout({ workspaceId: "workspace-1", packageId: "credits-500" }),
    ).rejects.toThrow("PesePay did not return a package checkout URL.");
  });
});
