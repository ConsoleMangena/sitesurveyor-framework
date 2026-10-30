export interface WalletAccountIdentity {
  name?: string | null;
  email?: string | null;
  /** Signup account type: personal, business, or platform_admin. */
  accountType?: string | null;
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
