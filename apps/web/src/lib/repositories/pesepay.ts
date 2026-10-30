import { supabase } from "../supabase/client.ts";

export async function initiatePesepayCheckout(input: {
  invoiceId: string;
  workspaceId: string;
}): Promise<{ redirectUrl: string; referenceNumber: string }> {
  const { data, error } = await supabase.functions.invoke("pesepay", {
    body: input,
  });
  if (error) throw error;
  const result = data as { redirectUrl?: string; referenceNumber?: string; error?: string };
  if (!result.redirectUrl || !result.referenceNumber) {
    throw new Error(result.error || "Pesepay did not return a checkout URL.");
  }
  return {
    redirectUrl: result.redirectUrl,
    referenceNumber: result.referenceNumber,
  };
}
