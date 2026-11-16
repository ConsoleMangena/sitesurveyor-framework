import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase/client.ts";

/**
 * Redeem a recovery link that carries a token hash.
 *
 * Such a link holds nothing but a one-time token, so the app exchanges it for
 * a session itself. Nothing has to be waiting in local storage, which is what
 * makes the link work in a browser that never asked for it.
 */
export async function redeemRecoveryTokenHash(
  tokenHash: string,
  type: "recovery" | "email",
): Promise<Session | null> {
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  if (error) throw error;
  return data.session;
}
