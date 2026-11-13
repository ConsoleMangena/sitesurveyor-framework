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

  return params.has("code") || fragment.get("type") === "recovery";
}
