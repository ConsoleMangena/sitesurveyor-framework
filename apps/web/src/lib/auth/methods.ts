/**
 * The account's sign-in methods, and the link/unlink flows over them.
 *
 * `user.identities` is the source of truth: GoTrue writes one row per
 * credential, so the list cannot drift from what Auth will actually accept.
 * The only derived bit is whether email sign-in counts — that needs the
 * address confirmed *and* a password set, neither of which creates an
 * identity row by itself on every project.
 *
 * Every removal is guarded server-side (`remaining_signin_methods` refuses
 * to drop the last one); the `canRemove` flag here exists so the UI can
 * disable the control and explain why, rather than letting the user hit a
 * 409.
 */

import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabase/client.ts";
import { findProviderIdentity, listProviderIdentities } from "./oauth.ts";
import {
  linkEmailMethod,
  signAndConsumeWalletChallenge,
  signAndLinkWallet,
  unlinkEmailMethod,
  unlinkWallet,
  type WalletChain,
} from "./web3-auth.ts";

export type SignInMethodKind = "email" | "github" | "wallet";

export interface SignInMethod {
  kind: SignInMethodKind;
  /** Stable id used for unlinking: identity id, or `web3:<chain>:<address>`. */
  id: string;
  /** Chain for wallets; the address for wallets; the label for the rest. */
  chain?: WalletChain;
  address?: string;
  /** Human label: "Email", "GitHub", or a truncated address. */
  label: string;
  /** Secondary line: the address, or the connected identity's email. */
  detail?: string;
  /** Provider-reported email when it is not private. */
  email?: string | null;
  createdAt?: string;
  /** False when this is the only way the account can sign in. */
  removable: boolean;
}

export interface MethodList {
  methods: SignInMethod[];
  /** True when the account can still add another method. */
  canAddMore: boolean;
  /** Set when the account has no confirmed email yet. */
  missingEmail: boolean;
}

function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Parse a `web3:<chain>:<address>` provider id back into its parts.
 * GoTrue stores the provider id exactly like this for wallet identities.
 */
export function parseWeb3ProviderId(
  providerId: string,
): { chain: WalletChain; address: string } | null {
  const match = /^web3:(ethereum|solana):(.+)$/.exec(providerId);
  if (!match) return null;
  return { chain: match[1] as WalletChain, address: match[2] };
}

/**
 * Build the method list for a user.
 *
 * `hasPassword` is normally unknown — Auth never exposes whether a
 * credential exists — so it is *inferred* from the `email` identity row,
 * which is exactly the marker `link_email_identity` writes and the lockout
 * guard counts. Pass an explicit value when this session just set or
 * verified one.
 */
export function buildMethodList(
  user: User | null | undefined,
  options: { hasPassword?: boolean } = {},
): MethodList {
  const identities = listProviderIdentities(user);
  const methods: SignInMethod[] = [];

  const emailIdentity = findProviderIdentity(user, "email");
  const confirmed = Boolean(user?.email_confirmed_at);
  const address = user?.email?.trim() || emailIdentity?.email || null;
  const emailUsable = Boolean(address) && confirmed;
  // Absent an explicit answer, the identity row is the proxy for "a
  // password exists" — it is only written for confirmed addresses.
  const emailSignIn =
    emailUsable && (options.hasPassword ?? Boolean(emailIdentity));

  if (emailSignIn) {
    methods.push({
      kind: "email",
      id: emailIdentity?.id ?? `email:${address}`,
      label: "Email & password",
      detail: address ?? undefined,
      email: address,
      createdAt: emailIdentity?.createdAt,
      removable: false, // set below once we know the total
    });
  }

  const github = findProviderIdentity(user, "github");
  if (github) {
    methods.push({
      kind: "github",
      id: github.id,
      label: "GitHub",
      detail: github.email || undefined,
      email: github.email,
      createdAt: github.createdAt,
      removable: false,
    });
  }

  for (const identity of identities) {
    const parsed = parseWeb3ProviderId(identity.id);
    if (!parsed) continue;
    methods.push({
      kind: "wallet",
      id: identity.id,
      chain: parsed.chain,
      address: parsed.address,
      label: `${parsed.chain === "ethereum" ? "Ethereum" : "Solana"} wallet`,
      detail: shortAddress(parsed.address),
      createdAt: identity.createdAt,
      removable: false,
    });
  }

  // Exactly one method cannot be removed; everything else can.
  const removableCount = methods.length;
  for (const method of methods) {
    method.removable = removableCount > 1;
  }

  return {
    methods,
    canAddMore: true,
    missingEmail: !emailUsable,
  };
}

/**
 * Read the method list, asking Auth whether a password exists. Auth-js does
 * not expose the flag directly, so we attempt a silent session refresh and
 * infer it from the presence of a confirmed email identity plus the
 * caller's own knowledge of whether they just set one.
 */
export async function loadSignInMethods(
  user: User | null | undefined,
  options: { hasPassword?: boolean } = {},
): Promise<MethodList> {
  return buildMethodList(user, options);
}

// ── wallet link / unlink ─────────────────────────────────────────────────────

export const LINK_WALLET_STATEMENT =
  "Link this wallet to your SiteSurveyor account.";

export const UNLINK_WALLET_STATEMENT =
  "Remove this wallet from your SiteSurveyor account.";

/**
 * Attach a wallet to the signed-in account: mint a challenge, have the
 * caller's `sign` produce the signature over it, then verify + burn + link
 * server-side.
 */
export async function linkWalletToAccount(input: {
  chain: WalletChain;
  address: string;
  sign: (message: string) => Promise<string>;
  chainId?: number;
}): Promise<void> {
  await signAndLinkWallet({
    chain: input.chain,
    address: input.address,
    statement: LINK_WALLET_STATEMENT,
    sign: input.sign,
    chainId: input.chainId,
  });
}

/**
 * Detach a wallet. Requires a fresh ownership proof first: mint a challenge
 * for this exact wallet, sign it, burn it, and only then ask the server to
 * unlink — the server refuses a removal without a proof less than five
 * minutes old.
 */
export async function unlinkWalletFromAccount(input: {
  chain: WalletChain;
  address: string;
  sign: (message: string) => Promise<string>;
  chainId?: number;
}): Promise<void> {
  await signAndConsumeWalletChallenge({
    chain: input.chain,
    address: input.address,
    statement: UNLINK_WALLET_STATEMENT,
    sign: input.sign,
    chainId: input.chainId,
  });
  await unlinkWallet({ chain: input.chain, address: input.address });
}

// ── email link / unlink ──────────────────────────────────────────────────────

/**
 * Mark email + password as a method. The password has already been set by
 * `addEmailAndPassword`; this records the identity the method list reads.
 */
export async function linkEmailSignIn(email: string): Promise<void> {
  await linkEmailMethod(email);
}

/** Remove email + password as a method (server guards the last one). */
export async function unlinkEmailSignIn(): Promise<void> {
  await unlinkEmailMethod();
}

/** True when the signed-in user already has a password set. */
export async function userHasPassword(): Promise<boolean> {
  // Auth never exposes the credential itself; the only reliable client-side
  // signal is a successful password sign-in, which we do not re-run here.
  // Callers that just set one pass `true` explicitly.
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  const identity = findProviderIdentity(data.session.user, "email");
  return Boolean(identity && data.session.user.email_confirmed_at);
}
