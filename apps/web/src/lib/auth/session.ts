import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { isOnline, supabase } from "../supabase/client.ts";
import { clearCachedUser } from "./authCache.ts";
import { isRecognisedWalletAccount } from "./wallet-recognition.ts";
import { isMobileBrowser } from "../../features/phantom/lib/provider.ts";

let pendingPasswordRecoverySession: Session | null = null;

// Keep recovery events available for pages that mount after Supabase finishes
// exchanging the URL token during client initialization.
supabase?.auth?.onAuthStateChange?.((event, session) => {
  if (event === "PASSWORD_RECOVERY" && session) {
    pendingPasswordRecoverySession = session;
  } else if (event === "SIGNED_OUT") {
    pendingPasswordRecoverySession = null;
  }
});

export function consumePasswordRecoverySession(): Session | null {
  const session = pendingPasswordRecoverySession;
  pendingPasswordRecoverySession = null;
  return session;
}

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

export const SOLANA_SIGN_IN_STATEMENT =
  "Sign in to SiteSurveyor Framework with your Solana account.";

export function buildSolanaSignUpStatement(input: SolanaSignUpInput): string {
  return `Create SiteSurveyor ${
    input.accountType === "business" ? "Business" : "Personal"
  } Account for ${input.fullName.trim()}`;
}

function resolveWalletAuthUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.origin;
}

/**
 * Generate a cryptographically secure random alphanumeric nonce for SIWS.
 * Phantom's SIWS parser strictly requires the `nonce` parameter.
 */
export function generateSiwsNonce(length = 16): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function isMwaWallet(wallet: unknown): boolean {
  if (!wallet || typeof wallet !== "object") return false;
  const name = (wallet as { name?: unknown }).name;
  return typeof name === "string" && /mobile wallet adapter/i.test(name);
}

function resolveDesktopSignIn(
  wallet: unknown,
): ((input: unknown) => Promise<unknown>) | null {
  if (!wallet || typeof wallet !== "object") return null;
  const candidate = wallet as any;

  // 1. Direct signIn on the adapter
  if (typeof candidate.signIn === "function") {
    return candidate.signIn.bind(candidate);
  }

  // 2. Underlying wallet on adapter (e.g. PhantomWalletAdapter._wallet.signIn)
  if (candidate._wallet && typeof candidate._wallet.signIn === "function") {
    return candidate._wallet.signIn.bind(candidate._wallet);
  }

  // 3. window.phantom.solana.signIn
  if (
    typeof window !== "undefined" &&
    (window as any).phantom?.solana &&
    typeof (window as any).phantom.solana.signIn === "function"
  ) {
    return (window as any).phantom.solana.signIn.bind(
      (window as any).phantom.solana,
    );
  }

  // 4. window.solana.signIn
  if (
    typeof window !== "undefined" &&
    (window as any).solana &&
    typeof (window as any).solana.signIn === "function"
  ) {
    return (window as any).solana.signIn.bind((window as any).solana);
  }

  return null;
}

/**
 * Configure wallet interface for Supabase auth-js.
 *
 * auth-js prefers a wallet's Wallet Standard `signIn` feature when present.
 * On mobile devices (MWA), Phantom over MWA can answer without `sign_in_result`,
 * so we strip `signIn` and route through `signMessage`.
 *
 * On desktop devices (e.g. Phantom browser extension), Phantom validates SIWS
 * strictly. If `signMessage` is used with manual strings, line formatting differences
 * trigger "The app's signature request cannot be shown due to invalid formatting".
 * Exposing native `signIn` with a valid `nonce` allows Phantom to render the standard
 * SIWS prompt smoothly.
 */
function toAuthWallet(wallet: unknown): unknown {
  if (!wallet || typeof wallet !== "object") return wallet;
  const candidate = wallet as any;
  const publicKey = candidate.publicKey;
  if (!publicKey || typeof publicKey.toBase58 !== "function") {
    return wallet;
  }

  const isMobile = isMobileBrowser();
  const isMwa = isMwaWallet(wallet);

  // On Mobile Wallet Adapter, Phantom over MWA can answer without sign_in_result.
  // Strip signIn so auth-js routes through signMessage.
  if (isMobile || isMwa) {
    if (typeof candidate.signMessage === "function") {
      const signMessage = candidate.signMessage.bind(wallet);
      return { publicKey, signMessage };
    }
    return wallet;
  }

  // On desktop, prefer native SIWS (signIn) where available (Phantom, etc.)
  const nativeSignIn = resolveDesktopSignIn(candidate);
  const signMessage =
    typeof candidate.signMessage === "function"
      ? candidate.signMessage.bind(wallet)
      : undefined;

  if (nativeSignIn) {
    return {
      publicKey,
      signIn: nativeSignIn,
      ...(signMessage ? { signMessage } : {}),
    };
  }

  if (signMessage) {
    return { publicKey, signMessage };
  }

  return wallet;
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
  const statement = options?.statement ?? SOLANA_SIGN_IN_STATEMENT;

  const customSignIn = options?.signInWithSolana as
    | Record<string, unknown>
    | undefined;
  const nonce = (customSignIn?.nonce as string) || generateSiwsNonce();

  const requestOptions = {
    ...options,
    url: options?.url ?? resolveWalletAuthUrl(),
    signInWithSolana: {
      nonce,
      ...customSignIn,
    },
  };

  const { data, error } = await supabase.auth.signInWithWeb3({
    chain: "solana",
    wallet: toAuthWallet(wallet),
    statement,
    options: requestOptions,
  } as never);

  if (error) {
    throw error;
  }

  return { session: data.session, user: data.user };
}

/**
 * Complete SIWS with a signature produced outside this page load, such as
 * Solflare's signMessage deeplink. The message must be signed verbatim.
 */
export async function signInWithSolanaSignature(
  message: string,
  signature: Uint8Array,
): Promise<{ session: Session | null; user: User | null }> {
  const { data, error } = await supabase.auth.signInWithWeb3({
    chain: "solana",
    message,
    signature,
  });

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
  const statement = options?.statement ?? buildSolanaSignUpStatement(input);

  const { session, user } = await signInWithSolanaWallet(wallet, {
    ...options,
    statement,
  });

  return persistSolanaSignUp(input, session, user);
}

/**
 * Complete sign-up when SIWS was authorized outside this page load, such as
 * Solflare's signMessage deeplink.
 */
export async function signUpWithSolanaSignature(
  message: string,
  signature: Uint8Array,
  input: SolanaSignUpInput,
): Promise<{ session: Session | null; user: User | null }> {
  const { session, user } = await signInWithSolanaSignature(message, signature);
  return persistSolanaSignUp(input, session, user);
}

async function persistSolanaSignUp(
  input: SolanaSignUpInput,
  session: Session | null,
  user: User | null,
): Promise<{ session: Session | null; user: User | null }> {
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
