import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  payInvoiceWithBalance,
  payStorageWithBalance,
  verifyWalletDeposit,
} from "./pesepay.ts";
import { supabase } from "../supabase/client.ts";

vi.mock("../supabase/client.ts", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: vi.fn(),
  },
}));

describe("PesePay wallet repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verifies a deposit with the wallet action", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { status: "completed" },
      error: null,
    });

    await expect(verifyWalletDeposit({ workspaceId: "workspace-1", depositId: "deposit-1" })).resolves.toEqual({
      status: "completed",
      transactionStatus: undefined,
    });
    expect(supabase.functions.invoke).toHaveBeenCalledWith("pesepay", {
      body: { workspaceId: "workspace-1", depositId: "deposit-1", action: "verify-deposit" },
    });
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
      payStorageWithBalance({ workspaceId: "workspace-1", storagePlanId: "10gb" }),
    ).rejects.toThrow("Insufficient PesePay balance");
  });

  it("sends a fresh request id when paying storage from the balance", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { status: "paid", purchaseId: "purchase-1", balance: 10 },
      error: null,
    });

    await payStorageWithBalance({ workspaceId: "workspace-1", storagePlanId: "10gb" });
    const body = vi.mocked(supabase.functions.invoke).mock.calls[0]?.[1]?.body as Record<string, unknown>;
    expect(body).toMatchObject({ workspaceId: "workspace-1", storagePlanId: "10gb", action: "pay-storage-balance" });
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
});
