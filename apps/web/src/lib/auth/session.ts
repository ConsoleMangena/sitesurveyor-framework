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

// ── Google OAuth helper ───────────────────────────────────────────────────────

/**
 * Starts the Google OAuth (PKCE) flow. Supabase redirects the browser to
 * Google and back to `redirectTo`; the returning URL is consumed by the
 * client's `detectSessionInUrl`, which fires a `SIGNED_IN` auth event that
 * `App.tsx` already listens for. No session is returned here directly.
 */
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = `${window.location.origin}/`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) {
    throw error;
  }
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  /**
   * Self-supplied at signup. The DB trigger `public.handle_new_auth_user` only
   * stores this in `profiles.auth_signup_account_type`; `is_platform_admin` is
   * never set from this value, so submitting "platform_admin" creates a regular
   * account that a super-admin must subsequently elevate.
   */
  accountType: "personal" | "business" | "platform_admin";
  workspaceName?: string;
  company?: string;
  promoCode?: string;
}

export interface SignUpResult {
  session: Session | null;
  user: User | null;
  needsEmailConfirmation: boolean;
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

export async function signInWithEmail({ email, password }: SignInInput) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signUpWithEmail(
  input: SignUpInput,
): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.fullName,
        account_type: input.accountType,
        workspace_name: input.workspaceName ?? input.company ?? null,
        company: input.company ?? null,
        promo_code: input.promoCode ?? null,
      },
    },
  });

  if (error) {
    throw error;
  }

  return {
    session: data.session,
    user: data.user,
    needsEmailConfirmation: data.session === null,
  };
}

export async function signOut() {
  clearCachedUser();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}

export async function resendSignupConfirmation(email: string) {
  const { data, error } = await supabase.auth.resend({
    type: "signup",
    email,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function requestPasswordReset(email: string) {
  const redirectTo = `${window.location.origin}/?auth=reset-password`;
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function updatePassword(newPassword: string) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw error;
  }

  return data;
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
) {
  const { data } = supabase.auth.onAuthStateChange(callback);
  return data.subscription;
}
