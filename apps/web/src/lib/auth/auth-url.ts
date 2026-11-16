/**
 * Read an Auth error from either part of a callback URL.
 *
 * Supabase may return OAuth errors in the query string or the URL fragment.
 * URLSearchParams already decodes values, including `+` and percent escapes.
 */
export function getAuthUrlError(url: string = window.location.href): string | null {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));

  for (const key of ["error_description", "error", "error_code"]) {
    const value = params.get(key) || fragment.get(key);
    if (value) return value;
  }

  return null;
}

/** True when this URL is carrying a password-recovery exchange or token. */
export function isPasswordRecoveryUrl(url: string = window.location.href): boolean {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));

  return (
    params.has("code") ||
    params.has("token_hash") ||
    fragment.get("type") === "recovery"
  );
}

/**
 * The one-time token a recovery link carries in the query string.
 *
 * Supabase sends this instead of a code when the mail template links straight
 * to the app with the token hash. The token is exchanged for a session by the
 * app itself, so such a link works in any browser.
 */
export function getPasswordRecoveryTokenHash(
  url: string = window.location.href,
): string | null {
  const parsed = new URL(url);
  return new URLSearchParams(parsed.search).get("token_hash");
}

/**
 * The verification type a token-hash link declares.
 *
 * Supabase's mail templates differ: one links with `type=recovery`, another
 * with `type=email`. Both are accepted by GoTrue for a recovery token.
 */
export function getPasswordRecoveryTokenType(
  url: string = window.location.href,
): "recovery" | "email" {
  const type = new URLSearchParams(new URL(url).search).get("type");
  return type === "email" ? "email" : "recovery";
}

/**
 * True when the URL still carries a PKCE code.
 *
 * Supabase removes the code from the URL once it has exchanged it, so a code
 * that is still there means the exchange never happened.
 */
export function hasPkceRecoveryCode(url: string = window.location.href): boolean {
  return new URLSearchParams(new URL(url).search).has("code");
}
