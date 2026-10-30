export interface WalletAccountIdentity {
  name?: string | null;
  email?: string | null;
  /** Signup account type: personal, business, or platform_admin. */
  accountType?: string | null;
}

export interface WalletProfileRecord {
  full_name?: string | null;
  email?: string | null;
  auth_signup_account_type?: string | null;
}

export interface WalletIdentitySources {
  profile?: WalletProfileRecord | null;
  metadata?: Record<string, unknown> | null;
  sessionEmail?: string | null;
}

export interface MissingWalletProfileFields {
  full_name?: string;
  email?: string;
  auth_signup_account_type?: string;
}

function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * A wallet's account identity lives in `profiles`, but SIWS signup used to
 * swallow profile write errors while still persisting the same values to the
 * auth user's metadata. Merge both sources so those accounts stay usable, and
 * so sign-in and workspace mapping agree on what counts as an account.
 */
export function resolveWalletIdentity(
  sources: WalletIdentitySources,
): WalletAccountIdentity {
  const profile = sources.profile ?? {};
  const metadata = sources.metadata ?? {};
  return {
    name:
      readText(profile.full_name) ??
      readText(metadata.full_name) ??
      readText(metadata.name),
    email:
      readText(profile.email) ??
      readText(metadata.contact_email) ??
      readText(sources.sessionEmail),
    accountType:
      readText(profile.auth_signup_account_type) ??
      readText(metadata.account_type),
  };
}

/**
 * A wallet is only recognised when its account has a name, email, and account
 * type on record. Wallets signing in for the first time have none of these, so
 * they must create an account before they can use the app.
 */
export function isRecognisedWalletAccount(
  identity: WalletAccountIdentity,
): boolean {
  return Boolean(
    identity.name?.trim() &&
      identity.email?.trim() &&
      identity.accountType?.trim(),
  );
}

/** Profile columns that are missing but recoverable from auth metadata. */
export function missingWalletProfileFields(
  profile: WalletProfileRecord | null | undefined,
  identity: WalletAccountIdentity,
): MissingWalletProfileFields {
  const patch: MissingWalletProfileFields = {};
  if (!readText(profile?.full_name) && identity.name) {
    patch.full_name = identity.name;
  }
  if (!readText(profile?.email) && identity.email) {
    patch.email = identity.email;
  }
  if (!readText(profile?.auth_signup_account_type) && identity.accountType) {
    patch.auth_signup_account_type = identity.accountType;
  }
  return patch;
}
