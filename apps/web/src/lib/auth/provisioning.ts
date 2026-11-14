/**
 * Shared account provisioning.
 *
 * Every sign-in path — email, GitHub, wallet — has to run this before the
 * app will map the session to a usable account: `mapAppUserToUiUser`
 * requires `full_name`, `email`, `auth_signup_account_type` and a workspace,
 * and returns null without them (which the app reports as "workspace not
 * ready"). Doing it once, here, means each sign-in page does not have to
 * reimplement the same four writes.
 *
 * Everything is idempotent: `profiles` is an upsert keyed on the user id and
 * `create_business_workspace` is only called when no workspace exists yet,
 * so running this twice (or after a partial failure) is safe.
 */

import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabase/client.ts";
import { getSignInProfile, repairSignInProfile } from "../repositories/profiles.ts";

export type AccountType = "personal" | "business";

/** Why provisioning stopped and what the UI should ask for next. */
export type ProvisioningBlocker =
  /** The account has no confirmed email address yet (e.g. GitHub private email). */
  | "EMAIL_REQUIRED"
  /** A new account has no name on record, so there is nothing to write. */
  | "DETAILS_REQUIRED"
  /**
   * A provider signup (Google/GitHub) that has not completed the onboarding
   * survey yet: no account type, no name on the profile, no workspace.
   */
  | "ONBOARDING_REQUIRED"
  | "PROFILE_UNREADABLE";

export class ProvisioningError extends Error {
  readonly blocker: ProvisioningBlocker;

  constructor(blocker: ProvisioningBlocker, message: string) {
    super(message);
    this.name = "ProvisioningError";
    this.blocker = blocker;
  }
}

export interface ProvisioningInput {
  fullName: string;
  accountType: AccountType;
  companyName?: string;
  /** Used when Auth did not attach an email to the session (GitHub private email). */
  email?: string | null;
}

export interface ProvisioningOutcome {
  /** Set when the account still needs an email address added to it. */
  blocker?: ProvisioningBlocker;
  /** True when this call created the profile row / workspace. */
  created: boolean;
}

/**
 * True when this session came from a provider signup (Google/GitHub) rather
 * than an email or wallet signup. Providers carry an email but no
 * `account_type` metadata — email signups always set it, and wallet signups
 * have no email on the session at all — so this shape is unambiguous. The
 * profile must go through the onboarding survey before a dashboard is
 * allocated.
 */
export function isProviderSignup(user: User): boolean {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  return Boolean(readText(user.email)) && !readText(metadata.account_type);
}

function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Pull the sign-up details Auth already has on the user, for prefilling. */
export function provisioningDefaultsFromUser(user: User): ProvisioningInput {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const accountType =
    readText(metadata.account_type) === "business" ? "business" : "personal";
  return {
    fullName: readText(metadata.full_name) ?? readText(metadata.name) ?? "",
    accountType,
    companyName:
      readText(metadata.company) ?? readText(metadata.workspace_name) ?? undefined,
    email: readText(user.email),
  };
}

/**
 * Ensure the signed-in user has a complete profile and workspace.
 *
 * Returns a blocker instead of throwing for the two states the UI has a
 * distinct screen for, so callers can branch rather than parse messages.
 */
export async function provisionAccount(
  user: User,
  input?: Partial<ProvisioningInput>,
): Promise<ProvisioningOutcome> {
  const defaults = provisioningDefaultsFromUser(user);
  const fullName = (input?.fullName ?? defaults.fullName).trim();
  const accountType: AccountType = input?.accountType ?? defaults.accountType;
  const companyName = (input?.companyName ?? defaults.companyName)?.trim();
  const email = readText(input?.email) ?? readText(defaults.email);

  if (!email) {
    // GitHub accounts with a private email have no address on the session;
    // the profile's `email` column is what the workspace mapping needs.
    return { blocker: "EMAIL_REQUIRED", created: false };
  }

  const existing = await getSignInProfile(user.id);

  // Provider signups (Google/GitHub) must complete the onboarding survey
  // before a dashboard is allocated: the survey collects the name, account
  // type and company that email signups gather on their form. A profile row
  // may exist (the signup trigger created a shell), but until the survey has
  // been submitted there is no account type and no workspace to route to.
  // An existing profile with an account type means the survey was done on a
  // previous sign-in — fall through and provision normally.
  const surveyDone = Boolean(existing?.auth_signup_account_type);
  if (isProviderSignup(user) && !surveyDone && !input?.accountType) {
    return { blocker: "ONBOARDING_REQUIRED", created: false };
  }

  if (!existing && !fullName) {
    // A brand-new account with no name has nothing to map to a usable
    // account (`mapAppUserToUiUser` needs a name), so ask for it rather
    // than writing an empty row the app will then reject.
    return { blocker: "DETAILS_REQUIRED", created: false };
  }

  if (!existing) {
    // No profile row yet: create it from what we have. This is the only
    // branch allowed to write empty-ish values, because there is nothing to
    // lose — and it is the branch the database trigger hangs a personal
    // workspace off.
    const patch: Record<string, string | null> = {
      full_name: fullName,
      email,
      auth_signup_account_type: accountType,
    };
    if (accountType === "business" && companyName) {
      patch.company_name = companyName;
    }

    let { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, ...patch }, { onConflict: "id" });

    if (isClaimedEmailError(error)) {
      // Another account mirrors this address, so the row cannot claim it. Finish
      // the write without it rather than failing the sign-in over a display copy.
      const withoutEmail: Record<string, string | null> = { ...patch };
      delete withoutEmail.email;
      ({ error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, ...withoutEmail }, { onConflict: "id" }));
    }

    if (error) {
      throw new ProvisioningError(
        "PROFILE_UNREADABLE",
        error.message?.trim() ||
          "Could not save your SiteSurveyor account. Please try again.",
      );
    }
  } else {
    // The row exists: only fill columns it is missing. Auth metadata is a
    // lossy mirror (GitHub private email, older wallet signups), so a value
    // already on the profile always wins — writing `""` over a real name is
    // strictly worse than leaving it alone.
    const patch: {
      full_name?: string;
      email?: string;
      auth_signup_account_type?: string;
    } = {};
    if (!readText(existing.full_name) && fullName) patch.full_name = fullName;
    if (!readText(existing.email) && email) patch.email = email;
    if (
      !readText(existing.auth_signup_account_type) &&
      accountType
    ) {
      patch.auth_signup_account_type = accountType;
    }

    if (Object.keys(patch).length > 0) {
      let { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", user.id);

      if (isClaimedEmailError(error)) {
        // Another account mirrors this address, so the profile can't claim it.
        // The session email is enough for the app to map the account, so drop
        // the contested copy and finish the write instead of failing sign-in.
        const retry: typeof patch = { ...patch };
        delete retry.email;
        if (Object.keys(retry).length > 0) {
          ({ error } = await supabase.from("profiles").update(retry).eq("id", user.id));
        } else {
          error = null;
        }
      }

      if (error) {
        throw new ProvisioningError(
          "PROFILE_UNREADABLE",
          error.message?.trim() ||
            "Could not save your SiteSurveyor account. Please try again.",
        );
      }
    }
  }

  let created = !existing;

  // Mirror into Auth metadata so later sign-ins (and the wallet-recognition
  // fallback) see the same values if a profile read ever fails. Only run it
  // when something actually changed: `updateUser` emits USER_UPDATED, which
  // App.tsx answers with a full re-sync, so doing it unconditionally on every
  // sign-in would double every login.
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metadataMissing =
    readText(metadata.full_name) !== fullName ||
    readText(metadata.account_type) !== accountType ||
    readText(metadata.contact_email) !== email;
  if (metadataMissing) {
    const metadataPatch: Record<string, unknown> = {
      full_name: fullName,
      account_type: accountType,
      contact_email: email,
    };
    if (companyName) metadataPatch.company = companyName;
    if (accountType === "business" && companyName) {
      metadataPatch.workspace_name = companyName;
    }
    const { error } = await supabase.auth.updateUser({ data: metadataPatch });
    if (error) {
      // Metadata is a convenience mirror; the profile row is authoritative.
      console.warn("[provisioning] could not sync auth metadata:", error.message);
    }
  }

  // Personal workspaces are created by the database when the profile row
  // lands (there is no `create_personal_workspace` RPC), so only business
  // accounts need an explicit call here — and only when they have no
  // workspace yet, which keeps a re-run idempotent.
  if (accountType === "business") {
    const hasWorkspace = await hasAnyWorkspace(user.id);
    if (!hasWorkspace) {
      const workspaceCreated = await createBusinessWorkspace(
        companyName || "My Company",
      );
      created = created || workspaceCreated;
    }
  }

  return { created };
}

/**
 * Submit the onboarding survey for a provider signup and allocate their
 * dashboard.
 *
 * The signup trigger deliberately leaves provider accounts without a
 * workspace or account type until this runs. The RPC allocates the workspace
 * (personal or business, per the survey answer) and writes the profile
 * fields atomically; it is idempotent, handing back the existing workspace
 * if the survey was somehow submitted twice. Auth metadata is mirrored
 * afterwards so wallet-recognition and the workspace mapping see the same
 * values on later sign-ins.
 */
export async function completeProviderOnboarding(
  user: User,
  input: ProvisioningInput,
): Promise<ProvisioningOutcome> {
  const fullName = input.fullName.trim();
  const accountType = input.accountType;
  const companyName = input.companyName?.trim() || undefined;

  const { data, error } = await supabase.rpc("complete_provider_onboarding", {
    p_full_name: fullName,
    p_account_type: accountType,
    p_company_name: companyName ?? null,
  });
  if (error) {
    throw new ProvisioningError(
      "PROFILE_UNREADABLE",
      error.message?.trim() ||
        "Could not save your SiteSurveyor account. Please try again.",
    );
  }

  // Mirror into Auth metadata so the workspace mapping resolves the account
  // type without a profile read. A failure here is non-fatal: the profile
  // row is authoritative and a later sign-in repairs the mirror.
  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      full_name: fullName,
      account_type: accountType,
      company: companyName ?? (accountType === "personal" ? "Independent Surveyor" : "My Company"),
      workspace_name: accountType === "business" ? companyName : undefined,
      contact_email: input.email ?? undefined,
    },
  });
  if (metadataError) {
    console.warn(
      "[provisioning] could not sync auth metadata:",
      metadataError.message,
    );
  }

  return { created: Boolean(data) };
}

/**
 * Convenience wrapper used by sign-in pages: run provisioning and translate
 * the "no email yet" state into the `EMAIL_REQUIRED` blocker the UI expects.
 */
export async function ensureAccountProvisioned(
  user: User,
  input?: Partial<ProvisioningInput>,
): Promise<ProvisioningOutcome> {
  const outcome = await provisionAccount(user, input);
  if (outcome.blocker === "EMAIL_REQUIRED") {
    throw new ProvisioningError(
      "EMAIL_REQUIRED",
      "That account signed in with a private email. Add an email address to finish setting it up.",
    );
  }
  if (outcome.blocker === "DETAILS_REQUIRED") {
    throw new ProvisioningError(
      "DETAILS_REQUIRED",
      "Add your name to finish setting up this account.",
    );
  }
  if (outcome.blocker === "ONBOARDING_REQUIRED") {
    throw new ProvisioningError(
      "ONBOARDING_REQUIRED",
      "Tell us a little about yourself to finish setting up this account.",
    );
  }
  return outcome;
}

async function hasAnyWorkspace(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1);
  if (error) return false;
  if (data && data.length > 0) return true;

  // The profile's default workspace is set by the same database-side flow
  // that creates personal workspaces, so it counts as having one.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("default_workspace_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return false;
  return Boolean(profile?.default_workspace_id);
}

async function createBusinessWorkspace(name: string): Promise<boolean> {
  const { error } = await supabase.rpc("create_business_workspace", {
    workspace_name: name,
  });
  if (error) {
    if (alreadyExists(error.message)) return false;
    throw new ProvisioningError(
      "PROFILE_UNREADABLE",
      error.message?.trim() ||
        "Could not create your business workspace. Please try again.",
    );
  }
  return true;
}

function alreadyExists(message: string | undefined): boolean {
  if (!message) return false;
  return /already exists|duplicate key|unique constraint/i.test(message);
}

/**
 * True when a profile write was refused because another account already mirrors
 * that address (`profiles_email_key`). Nobody's sign-in should fail over a
 * display copy of an email the session already carries.
 */
function isClaimedEmailError(error: { message?: string } | null): boolean {
  return /profiles_email_key/i.test(error?.message ?? "");
}

/**
 * Fill only the profile columns that are missing, without touching values
 * the user already set. Used when Auth carries details the profile row lost.
 */
export async function repairMissingProfileFields(
  userId: string,
  fields: { full_name?: string; email?: string; auth_signup_account_type?: string },
): Promise<void> {
  await repairSignInProfile(userId, fields);
}
