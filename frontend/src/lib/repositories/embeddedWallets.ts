/**
 * Repository for the open-source embedded Solana wallet.
 *
 * Only encrypted wallet metadata is stored server-side. The PIN and decrypted
 * secret key never leave the browser.
 */

import { supabase } from "../supabase/client";
import type { EncryptedWallet } from "../../features/solana/lib/embeddedWallet";

export interface EmbeddedWalletRow extends EncryptedWallet {
  created_at: string;
  updated_at: string;
}

// The generated Supabase types do not yet include embedded_solana_wallets, so
// we cast the table name to any for these calls.
/* eslint-disable @typescript-eslint/no-explicit-any */
const TABLE_NAME = "embedded_solana_wallets";

// Supabase returns snake_case column names. The EncryptedWallet interface uses
// camelCase, so we map them explicitly.
interface SupabaseEmbeddedWalletRow {
  wallet_address: string;
  encrypted_key: string;
  iv: string;
  salt: string;
  encrypted_mnemonic: string | null;
  mnemonic_iv: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: SupabaseEmbeddedWalletRow): EmbeddedWalletRow {
  return {
    walletAddress: row.wallet_address,
    encryptedKey: row.encrypted_key,
    iv: row.iv,
    salt: row.salt,
    encryptedMnemonic: row.encrypted_mnemonic ?? undefined,
    mnemonicIv: row.mnemonic_iv ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function loadEmbeddedWallet(): Promise<EmbeddedWalletRow | null> {
  const { data, error } = await supabase
    .from(TABLE_NAME as any)
    .select(
      "wallet_address, encrypted_key, iv, salt, encrypted_mnemonic, mnemonic_iv, created_at, updated_at",
    )
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRow((data as unknown) as SupabaseEmbeddedWalletRow);
}

export async function saveEmbeddedWallet(
  wallet: EncryptedWallet,
): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) {
    throw new Error("You must be signed in to save an embedded wallet.");
  }

  const row: Record<string, unknown> = {
    user_id: userId,
    wallet_address: wallet.walletAddress,
    encrypted_key: wallet.encryptedKey,
    iv: wallet.iv,
    salt: wallet.salt,
  };
  if (wallet.encryptedMnemonic) {
    row.encrypted_mnemonic = wallet.encryptedMnemonic;
  }
  if (wallet.mnemonicIv) {
    row.mnemonic_iv = wallet.mnemonicIv;
  }

  const { error } = await supabase
    .from(TABLE_NAME as any)
    .upsert(row as any, { onConflict: "user_id" } as any);

  if (error) throw new Error(error.message);
}

export async function deleteEmbeddedWallet(): Promise<void> {
  const userId = (await supabase.auth.getUser()).data.user?.id ?? "";
  const { error } = await supabase
    .from(TABLE_NAME as any)
    .delete()
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
}
