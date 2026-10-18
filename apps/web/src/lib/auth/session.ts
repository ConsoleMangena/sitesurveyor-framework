import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { isOnline, supabase } from "../supabase/client.ts";
import { clearCachedUser } from "./authCache.ts";

/** Fallback to the Supabase localStorage session when offline. */
export function loadStoredSession(): Session | null {
  if (typeof localStorage === "undefined") return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) {
        continue;
      }
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as
        | {
            currentSession?: Session;
            access_token?: string;
            refresh_token?: string;
            expires_at?: number;
            token_type?: string;
            user?: User;
          }
        | undefined;
      if (!parsed) continue;
      const current = parsed.currentSession ?? parsed;
      if (current.access_token && current.user) {
        return {
          access_token: current.access_token,
          refresh_token: current.refresh_token,
          expires_at: current.expires_at,
          token_type: current.token_type ?? "bearer",
          user: current.user,
        } as Session;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

// ── Solana Web3 (SIWS) helper ────────────────────────────────────────────────

/**
 * Signs in via a Solana wallet using Supabase Web3 auth (Sign-In With Solana).
 * Pass a wallet-standard compatible adapter or the `window.solana` object; when
 * omitted, auth-js falls back to `window.solana`. Throws the Supabase error on
 * failure, otherwise resolves with the fresh session and user.
 */
export async function signInWithSolanaWallet(
  wallet?: unknown,
  options?: unknown,
): Promise<{ session: Session | null; user: User | null }> {
  const { data, error } = await supabase.auth.signInWithWeb3({
    chain: "solana",
    wallet,
    options,
  } as never);

  if (error) {
    throw error;
  }

  return { session: data.session, user: data.user };
}

export async function getCurrentSession(): Promise<Session | null> {
  // Avoid waiting for a failed refresh/network round-trip while offline.
  if (!isOnline()) {
    return loadStoredSession();
  }

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      return null;
    }

    return data.session;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      return null;
    }

    return data.user;
  } catch {
    return null;
  }
}

export async function signOut() {
  clearCachedUser();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) {
  const { data } = supabase.auth.onAuthStateChange(callback);
  return data.subscription;
}
