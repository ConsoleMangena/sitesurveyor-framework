/**
 * Email + password authentication: register, sign in, verify, reset.
 *
 * Every credential check happens in GoTrue — this module only collects the
 * input and normalises the errors. Passwords are never stored anywhere but
 * GoTrue's own credential table; the client holds them only for the length
 * of a single request.
 *
 * After any of these succeed the caller must run the shared provisioning
 * step (`provisionAccount`), because `mapAppUserToUiUser` requires a profile
 * with name, email, account type and a workspace before the app will map
 * the session to a usable account.
 */

import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../supabase/client.ts";
import type { AccountType } from "./provisioning.ts";

export interface EmailSignUpInput {
  email: string;
  password: string;
  fullName: string;
  accountType: AccountType;
  companyName?: string;
}

export interface EmailSignInInput {
  email: string;
  password: string;
}

export interface AuthResult {
  session: Session | null;
  user: User | null;
  /**
   * True when Auth created the account but email confirmation is still
   * outstanding — there is no session yet and the caller must send the user
   * to the verify screen instead of provisioning.
   */
  needsEmailVerification?: boolean;
}

/** GoTrue error shapes we surface directly; anything else gets a fallback. */
function authFailure(error: { message?: string; code?: string } | null): Error {
  if (!error) return new Error("Authentication failed. Please try again.");
  return new Error(error.message || "Authentication failed. Please try again.");
}

/**
 * Register a new account. When the deployment requires email confirmation
 * (no auto-confirm), Auth returns a user with no session — that is a
 * success, not an error, and is reported through `needsEmailVerification`.
 */
export async function signUpWithEmail(input: EmailSignUpInput): Promise<AuthResult> {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  const company =
    input.accountType === "personal"
      ? "Independent Surveyor"
      : input.companyName?.trim() || "My Company";

  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      data: {
        full_name: fullName,
        account_type: input.accountType,
        company,
        ...(input.accountType === "business"
          ? { workspace_name: company }
          : {}),
      },
      emailRedirectTo: buildEmailRedirect(`${window.location.origin}/auth/callback`),
    },
  });

  if (error) throw authFailure(error);

  const user = data.user;
  if (!data.session && user && !user.email_confirmed_at) {
    return { session: null, user, needsEmailVerification: true };
  }
  if (!data.session) {
    throw new Error(
      "Your account was created but no session was returned. Please sign in.",
    );
  }
  return { session: data.session, user };
}

/** Sign in with an existing email + password. */
export async function signInWithEmail(
  input: EmailSignInInput,
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email.trim().toLowerCase(),
    password: input.password,
  });

  if (error) throw authFailure(error);
  if (!data.session) {
    throw new Error("Sign-in did not return a session. Please try again.");
  }
  return { session: data.session, user: data.user };
}

/** Send the "forgot password" link. Always resolves on a valid request. */
export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo: buildEmailRedirect(`${window.location.origin}/reset-password`) },
  );
  if (error) throw authFailure(error);
}

/**
 * Set a new password from a reset link. GoTrue exchanges the recovery token
 * for a session first, so the caller ends up signed in.
 */
export async function setPassword(
  password: string,
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw authFailure(error);

  const { data: sessionData } = await supabase.auth.getSession();
  return { session: sessionData.session, user: data.user };
}

/** Change the password of the signed-in user (used by account security). */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  // Re-authenticate first so a stale session cannot change the credential.
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;
  if (!email) {
    throw new Error("Your account has no email address on record.");
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (signInError) {
    throw new Error("Your current password is not correct.");
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw authFailure(error);
}

/** Verify the email-confirmation link from the inbox. */
export async function verifyEmail(
  token: string,
  type: "signup" | "recovery" | "email_change" = "signup",
): Promise<AuthResult> {
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: token,
    type,
  });
  if (error) throw authFailure(error);
  if (!data.session) {
    throw new Error(
      "That verification link did not return a session. Request a new one.",
    );
  }
  return { session: data.session, user: data.user };
}

/** Resend the confirmation email. */
export async function resendVerification(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: email.trim().toLowerCase(),
    options: {
      emailRedirectTo: buildEmailRedirect(`${window.location.origin}/auth/callback`),
    },
  });
  if (error) throw authFailure(error);
}

/**
 * Attach email + password to an account that currently signs in some other
 * way (wallet, GitHub).
 *
 * `updateUser({ email, password })` stores the password immediately and
 * sends an email-change confirmation link even when the project has
 * auto-confirm on — GoTrue always runs `sendEmailChange` for non-anonymous
 * users. Until that link is clicked the account has a password but the
 * address is not yet confirmed as an identity, so this returns
 * `needsEmailVerification` and the caller routes to the verify screen.
 */
export async function addEmailAndPassword(input: {
  email: string;
  password: string;
}): Promise<{ needsEmailVerification: boolean }> {
  const email = input.email.trim().toLowerCase();
  const { error } = await supabase.auth.updateUser({
    email,
    password: input.password,
  });
  if (error) throw authFailure(error);

  const { data } = await supabase.auth.getUser();
  const confirmed =
    data.user?.email_confirmed_at &&
    data.user.email?.toLowerCase() === email;

  return { needsEmailVerification: !confirmed };
}

/** Append the current origin so email links land back in this app. */
function buildEmailRedirect(url: string): string {
  return url;
}
