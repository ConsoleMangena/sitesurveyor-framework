import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../supabase/client.ts";
import type { Tables } from "../supabase/types.ts";

// RPC returns database rows, but JSON numbers can arrive as strings.
const adminDb = supabase as unknown as SupabaseClient;

export type BillingPackage = Tables<"billing_packages">;
export type BillingOperationRate = Tables<"billing_operation_rates">;
export type SurveyCreditRate = Tables<"survey_credit_rates">;

export type PackageEditorValues = Pick<
  BillingPackage,
  | "label"
  | "description"
  | "credits"
  | "storage_mb"
  | "duration_days"
  | "amount"
  | "estimated_infrastructure_cost"
  | "estimated_payment_fee"
  | "active"
  | "sort_order"
>;
export type OperationEditorValues = Omit<BillingOperationRate, "operation" | "updated_at">;
export type SurveyEditorValues = Omit<SurveyCreditRate, "category" | "updated_at">;

export interface AdminPricingConfiguration {
  packages: BillingPackage[];
  operations: BillingOperationRate[];
  surveys: SurveyCreditRate[];
}

function numeric<T extends object>(row: T, fields: (keyof T)[]): T {
  const result = { ...row };
  for (const field of fields) {
    const value = result[field];
    if (value != null) result[field] = Number(value) as T[keyof T];
  }
  return result;
}

export async function getAdminPricingConfiguration(): Promise<AdminPricingConfiguration> {
  const { data, error } = await adminDb.rpc("admin_get_pricing_configuration");
  if (error) throw error;
  const config = (data ?? {}) as Partial<Record<keyof AdminPricingConfiguration, unknown[]>>;
  return {
    packages: (config.packages ?? []).map((row) =>
      numeric(row as BillingPackage, [
        "credits",
        "storage_mb",
        "duration_days",
        "amount",
        "estimated_infrastructure_cost",
        "estimated_payment_fee",
      ])),
    operations: (config.operations ?? []).map((row) =>
      numeric(row as BillingOperationRate, ["credits", "estimated_cost"])),
    surveys: (config.surveys ?? []).map((row) =>
      numeric(row as SurveyCreditRate, [
        "base_credits",
        "per_hectare_credits",
        "minimum_credits",
        "estimated_cost",
      ])),
  };
}

export async function updateBillingPackage(
  id: string,
  values: PackageEditorValues,
): Promise<void> {
  const { error } = await adminDb.rpc("admin_update_billing_package", {
    p_id: id,
    p_label: values.label,
    p_description: values.description,
    p_credits: values.credits,
    p_storage_mb: values.storage_mb,
    p_duration_days: values.duration_days,
    p_amount: values.amount,
    p_estimated_infrastructure_cost: values.estimated_infrastructure_cost,
    p_estimated_payment_fee: values.estimated_payment_fee,
    p_active: values.active,
    p_sort_order: values.sort_order,
  });
  if (error) throw error;
}

export async function updateBillingOperationRate(
  operation: string,
  values: OperationEditorValues,
): Promise<void> {
  const { error } = await adminDb.rpc("admin_update_billing_operation_rate", {
    p_operation: operation,
    p_credits: values.credits,
    p_estimated_cost: values.estimated_cost,
    p_active: values.active,
  });
  if (error) throw error;
}

export async function updateSurveyCreditRate(
  category: string,
  values: SurveyEditorValues,
): Promise<void> {
  const { error } = await adminDb.rpc("admin_update_survey_credit_rate", {
    p_category: category,
    p_label: values.label,
    p_base_credits: values.base_credits,
    p_per_hectare_credits: values.per_hectare_credits,
    p_minimum_credits: values.minimum_credits,
    p_estimated_cost: values.estimated_cost,
    p_active: values.active,
  });
  if (error) throw error;
}
