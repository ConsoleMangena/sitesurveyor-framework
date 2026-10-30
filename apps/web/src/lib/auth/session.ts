import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { isOnline, supabase } from "../supabase/client.ts";
import { clearCachedUser } from "./authCache.ts";
import { isRecognisedWalletAccount } from "./wallet-recognition.ts";

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

export interface SolanaSignInOptions {
  statement?: string;
  url?: string;
  [key: string]: unknown;
}

export interface SolanaSignUpInput {
  fullName: string;
  accountType: "personal" | "business";
  companyName?: string;
  email?: string;
}

function resolveWalletAuthUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.origin;
}

interface SignMessageWallet {
  publicKey: { toBase58: () => string };
  signMessage: (message: Uint8Array, encoding?: string) => Promise<unknown>;
}

/**
 * Restrict a connected wallet to `publicKey` + `signMessage`.
 *
 * auth-js prefers a wallet's Wallet Standard `signIn` feature when present, but
 * the Mobile Wallet Adapter exposes `signIn` and Phantom over MWA can answer an
 * already-authorized request without a `sign_in_result`, which surfaces as
 * "no sign in result returned by wallet". Signing the SIWS message through
 * `signMessage` works on every adapter, so hide `signIn` when signing is
 * available.
 */
function toSignMessageWallet(wallet: unknown): unknown {
  if (!wallet || typeof wallet !== "object") return wallet;
  const candidate = wallet as Partial<SignMessageWallet>;
  const publicKey = candidate.publicKey;
  if (
    !publicKey ||
    typeof publicKey.toBase58 !== "function" ||
    typeof candidate.signMessage !== "function"
  ) {
    return wallet;
  }
  const signMessage = candidate.signMessage.bind(wallet);
  return { publicKey, signMessage } satisfies SignMessageWallet;
}

/**
 * Signs in via a Solana wallet using Supabase Web3 auth (Sign-In With Solana).
 * Pass a wallet-standard compatible adapter or the `window.solana` object; when
 * omitted, auth-js falls back to `window.solana`. Throws the Supabase error on
 * failure, otherwise resolves with the fresh session and user.
 */
export async function signInWithSolanaWallet(
  wallet?: unknown,
  options?: SolanaSignInOptions,
): Promise<{ session: Session | null; user: User | null }> {
  const statement =
    options?.statement ??
    "Sign in to SiteSurveyor Framework with your Solana account.";

  const requestOptions = {
    ...options,
    url: options?.url ?? resolveWalletAuthUrl(),
  };

  const { data, error } = await supabase.auth.signInWithWeb3({
    chain: "solana",
    wallet: toSignMessageWallet(wallet),
    statement,
    options: requestOptions,
  } as never);

  if (error) {
    throw error;
  }

  return { session: data.session, user: data.user };
}

/**
 * Onboards and signs up a new account via Solana wallet authentication.
 * Prompts the wallet for SIWS authorization, stores account preferences,
 * populates the user profile, and initializes personal or business workspaces.
 */
export async function signUpWithSolanaWallet(
  wallet: unknown,
  input: SolanaSignUpInput,
  options?: SolanaSignInOptions,
): Promise<{ session: Session | null; user: User | null }> {
  const statement =
    options?.statement ??
    `Create SiteSurveyor ${input.accountType === "business" ? "Business" : "Personal"} Account for ${input.fullName.trim()}`;

  const { session, user } = await signInWithSolanaWallet(wallet, {
    ...options,
    statement,
  });

  if (!user || !session) {
    throw new Error(
      "Wallet authorization succeeded, but user session could not be established.",
    );
  }

  const normalizedCompany =
    input.accountType === "personal"
      ? "Independent Surveyor"
      : input.companyName?.trim() || "My Company";
  const contactEmail = input.email?.trim() || null;
  const fullName = input.fullName.trim();

  // Persist the profile before metadata so a later USER_UPDATED auth event
  // reloads an account that sign-in already treats as recognised. Supabase
  // returns `{ error }` instead of throwing, so these writes must be checked.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        full_name: fullName,
        auth_signup_account_type: input.accountType,
        company_name: normalizedCompany,
        email: contactEmail,
        onboarding_complete: true,
      },
      { onConflict: "id" },
    )
    .select("full_name, email, auth_signup_account_type")
    .single();

  if (profileError) {
    throw new Error(
      profileError.message?.trim() ||
        "Could not save your SiteSurveyor account. Please try again.",
    );
  }

  if (
    !isRecognisedWalletAccount({
      name: profile?.full_name,
      email: profile?.email,
      accountType: profile?.auth_signup_account_type,
    })
  ) {
    throw new Error(
      "Your wallet signed in, but the account profile could not be saved. Please try creating the account again.",
    );
  }

  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      full_name: fullName,
      account_type: input.accountType,
      company: normalizedCompany,
      workspace_name:
        input.accountType === "business" ? normalizedCompany : undefined,
      contact_email: contactEmail || undefined,
    },
  });

  if (metadataError) {
    throw new Error(
      metadataError.message?.trim() ||
        "Could not save your account details. Please try again.",
    );
  }

  if (input.accountType === "business") {
    const { error: workspaceError } = await supabase.rpc(
      "create_business_workspace",
      { workspace_name: normalizedCompany },
    );
    if (workspaceError) {
      throw new Error(
        workspaceError.message?.trim() ||
          "Could not create your business workspace. Please try again.",
      );
    }
  }

  return { session, user };
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
