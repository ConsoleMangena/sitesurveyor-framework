import { supabase } from "../../../lib/supabase/client.ts";

export interface CustomWalletRecord {
  wallet_address: string;
  salt: string;
  iv: string;
  ciphertext: string;
}

export async function loadCustomWallet(): Promise<CustomWalletRecord | null> {
  const { data, error } = await supabase
    .from("custom_solana_wallets" as never)
    .select("wallet_address, salt, iv, ciphertext")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CustomWalletRecord | null) ?? null;
}

export async function saveCustomWallet(wallet: CustomWalletRecord): Promise<void> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("You must be signed in to save a custom wallet.");
  const { error } = await supabase.from("custom_solana_wallets" as never).upsert({
    user_id: user.user.id,
    ...wallet,
  } as never, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

export async function deleteCustomWallet(): Promise<void> {
  const { error } = await supabase.from("custom_solana_wallets" as never).delete();
  if (error) throw new Error(error.message);
}
