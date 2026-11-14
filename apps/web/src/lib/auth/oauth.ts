/**
 * GitHub OAuth: sign in, and link/unlink GitHub to an existing account.
 *
 * Sign-in is a browser redirect handled entirely by GoTrue — this app never
 * sees the GitHub token, and GitHub never sees the user's password. Linking
 * and unlinking use auth-js `linkIdentity` / `unlinkIdentity`, which do the
 * same redirect dance in the background and attach the resulting identity to
 * the session you already hold.
 *
 * `enable_manual_linking` must be on in the Supabase Auth config for
 * `unlinkIdentity` to work; without it the call returns an auth error that
 * `formatAuthUserFacingError` shows verbatim.
 */

import type { User, UserIdentity } from "@supabase/supabase-js";
import { supabase } from "../supabase/client.ts";
import { authRedirectTo } from "../platform.ts";

export const GITHUB_PROVIDER = "github";

/**
 * Where a provider sends the browser back after authorising.
 *
 * In the browser that is this origin. In the desktop shell the sign-in is
 * completed by the system browser, so the redirect goes to the bridge page on
 * the hosted web build, which hands the result to the app over its
 * `sitesurveyor://` protocol — see `authRedirectTo`.
 */
function oauthRedirectTo(): string {
  if (typeof window === "undefined") return "";
  return authRedirectTo("/auth/callback");
}

/**
 * Start GitHub sign-in. The browser navigates away to GitHub and comes back
 * at `/auth/callback`; nothing after this line runs in this tab.
 */
export async function signInWithGitHub(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: GITHUB_PROVIDER,
    options: { redirectTo: oauthRedirectTo() },
  });
  if (error) throw new Error(error.message || "Could not start GitHub sign-in.");
}

/**
 * Attach GitHub to the account you are already signed in as. In the browser
 * auth-js performs a full-page redirect to GitHub and back; this resolves
 * only if the redirect could not be started.
 */
export async function linkGitHub(): Promise<void> {
  const { error } = await supabase.auth.linkIdentity({
    provider: GITHUB_PROVIDER,
    options: { redirectTo: oauthRedirectTo() },
  });
  if (error) throw new Error(error.message || "Could not start GitHub linking.");
}

/**
 * Detach GitHub from the account, provided another method remains.
 *
 * auth-js wants the whole `UserIdentity` row rather than just its id — it
 * derives the provider from the object to build the request — so callers
 * pass the identity they read off the user.
 */
export async function unlinkGitHub(identity: UserIdentity): Promise<void> {
  const { error } = await supabase.auth.unlinkIdentity(identity);
  if (error) throw new Error(error.message || "Could not remove GitHub.");
}

/** The GitHub identity row on a user, if any. */
export interface ProviderIdentity {
  id: string;
  provider: string;
  /** Email GitHub reported, when it is not private. */
  email?: string | null;
  /** Identity data GitHub returned (avatar, username, …). */
  identityData?: Record<string, unknown> | null;
  createdAt?: string;
}

/** Find the identity for `provider` on this user (email, github, or web3). */
export function findProviderIdentity(
  user: User | null | undefined,
  provider: string,
): ProviderIdentity | null {
  const identities = user?.identities ?? [];
  const match = identities.find((identity) => identity.provider === provider);
  if (!match) return null;
  return {
    id: match.id,
    provider: match.provider,
    email: (match.identity_data as { email?: string } | null)?.email ?? null,
    identityData: (match.identity_data as Record<string, unknown> | null) ?? null,
    createdAt: match.created_at,
  };
}

/** Every identity on the user, normalised for the method list. */
export function listProviderIdentities(user: User | null | undefined): ProviderIdentity[] {
  return (user?.identities ?? []).map((identity) => ({
    id: identity.id,
    provider: identity.provider,
    email: (identity.identity_data as { email?: string } | null)?.email ?? null,
    identityData:
      (identity.identity_data as Record<string, unknown> | null) ?? null,
    createdAt: identity.created_at,
  }));
}

/**
 * GitHub can return a private/null email. In that case the account has no
 * address to put on the profile, and the UI must ask for one before the
 * session can be mapped to a usable account.
 */
export function githubEmailIsUsable(user: User | null | undefined): boolean {
  const email = user?.email?.trim();
  if (email) return true;
  const identity = findProviderIdentity(user, GITHUB_PROVIDER);
  const linked = identity?.identityData?.email;
  return typeof linked === "string" && linked.trim().length > 0;
}

export const GOOGLE_PROVIDER = "google";

/**
 * Start Google sign-in. The browser navigates away to Google and comes back
 * at `/auth/callback`; nothing after this line runs in this tab.
 *
 * Google always returns a verified address, so the callback never lands in
 * the "ask for an email" state this flow can produce for GitHub.
 */
export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: GOOGLE_PROVIDER,
    options: { redirectTo: oauthRedirectTo() },
  });
  if (error) throw new Error(error.message || "Could not start Google sign-in.");
}

/**
 * Attach Google to the account you are already signed in as. In the browser
 * auth-js performs a full-page redirect to Google and back; this resolves
 * only if the redirect could not be started.
 */
export async function linkGoogle(): Promise<void> {
  const { error } = await supabase.auth.linkIdentity({
    provider: GOOGLE_PROVIDER,
    options: { redirectTo: oauthRedirectTo() },
  });
  if (error) throw new Error(error.message || "Could not start Google linking.");
}

/**
 * Detach Google from the account, provided another method remains.
 *
 * Same shape as `unlinkGitHub`: auth-js wants the whole `UserIdentity` row,
 * so callers pass the identity they read off the user.
 */
export async function unlinkGoogle(identity: UserIdentity): Promise<void> {
  const { error } = await supabase.auth.unlinkIdentity(identity);
  if (error) throw new Error(error.message || "Could not remove Google.");
}
