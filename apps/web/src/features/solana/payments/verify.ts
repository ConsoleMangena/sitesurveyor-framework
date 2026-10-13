/**
 * Client wrapper for the `solana-pay-verify` Edge Function.
 *
 * The client never inserts a payment row itself. It hands the tx signature,
 * reference and invoice id to the server, which independently verifies the
 * on-chain transfer (recipient == treasury, mint == USDC, amount == invoice
 * total, reference present) before recording the payment idempotently.
 */

import { supabase } from "../../../lib/supabase/client";

const VERIFY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/solana-pay-verify`;

export interface VerifyPaymentInput {
  workspaceId: string;
  invoiceId: string;
  signature: string;
  reference: string;
  walletAddress: string;
}

export interface VerifyPaymentResult {
  paymentId: string;
  alreadyRecorded: boolean;
}

export async function verifySolanaPayment(
  input: VerifyPaymentInput,
): Promise<VerifyPaymentResult> {
  const anonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // Forward the user's session so the function can authorize the caller.
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const res = await fetch(VERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? "Payment verification failed",
    );
  }

  return (await res.json()) as VerifyPaymentResult;
}
