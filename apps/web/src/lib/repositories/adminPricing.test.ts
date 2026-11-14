import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAdminPricingConfiguration,
  updateBillingOperationRate,
  updateBillingPackage,
  updateSurveyCreditRate,
} from "./adminPricing.ts";
import { supabase } from "../supabase/client.ts";

vi.mock("../supabase/client.ts", () => ({ supabase: { rpc: vi.fn() } }));

const rpc = vi.mocked(supabase.rpc);

describe("admin pricing repository", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("loads the complete configuration and converts numeric JSON values", async () => {
    rpc.mockResolvedValue({
      data: {
        packages: [{ id: "credits-100", amount: "5.00", credits: "100", storage_mb: null }],
        operations: [{ operation: "ai.chat", credits: "2", estimated_cost: "0.02" }],
        surveys: [{ category: "water", base_credits: "4", per_hectare_credits: "0.00018", minimum_credits: "10", estimated_cost: "0.17" }],
      },
      error: null,
    } as never);

    const config = await getAdminPricingConfiguration();
    expect(config.packages[0]).toMatchObject({ amount: 5, credits: 100 });
    expect(config.operations[0]).toMatchObject({ credits: 2, estimated_cost: 0.02 });
    expect(config.surveys[0]).toMatchObject({ base_credits: 4, per_hectare_credits: 0.00018 });
    expect(rpc).toHaveBeenCalledWith("admin_get_pricing_configuration");
  });

  it("sends every editable package setting to its fixed RPC", async () => {
    rpc.mockResolvedValue({ data: { id: "10gb" }, error: null } as never);
    const values = {
      label: "10 GB annual",
      description: "Additional storage",
      credits: null,
      storage_mb: 10240,
      duration_days: 365,
      amount: 18.75,
      estimated_infrastructure_cost: 0.21,
      estimated_payment_fee: 0.66,
      active: false,
      sort_order: 40,
    };
    await updateBillingPackage("10gb", values);
    expect(rpc).toHaveBeenCalledWith("admin_update_billing_package", {
      p_id: "10gb",
      p_label: values.label,
      p_description: values.description,
      p_credits: null,
      p_storage_mb: values.storage_mb,
      p_duration_days: values.duration_days,
      p_amount: 18.75,
      p_estimated_infrastructure_cost: 0.21,
      p_estimated_payment_fee: 0.66,
      p_active: false,
      p_sort_order: 40,
    });
  });

  it("updates operation and survey rates, including fractional hectare values", async () => {
    rpc.mockResolvedValue({ data: {}, error: null } as never);
    await updateBillingOperationRate("ai.chat", { credits: 3, estimated_cost: 0.04, active: true });
    await updateSurveyCreditRate("minerals", {
      label: "Minerals",
      base_credits: 7,
      per_hectare_credits: 0.00024001,
      minimum_credits: 14,
      estimated_cost: 0.24,
      active: false,
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "admin_update_billing_operation_rate", {
      p_operation: "ai.chat", p_credits: 3, p_estimated_cost: 0.04, p_active: true,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "admin_update_survey_credit_rate", {
      p_category: "minerals", p_label: "Minerals", p_base_credits: 7,
      p_per_hectare_credits: 0.00024001, p_minimum_credits: 14,
      p_estimated_cost: 0.24, p_active: false,
    });
  });

  it("propagates database authorization errors", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("Platform administrator access required") } as never);
    await expect(getAdminPricingConfiguration()).rejects.toThrow("Platform administrator access required");
  });
});
