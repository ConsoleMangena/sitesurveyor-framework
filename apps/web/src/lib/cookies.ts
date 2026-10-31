/**
 * Minimal cookie helpers for layout preferences.
 *
 * Cookies (rather than localStorage) keep the sidebar state readable before
 * React mounts, which avoids a flash of the wrong sidebar width.
 */

export function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;

  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.split("=")[1] ?? "") : undefined;
}

export function setCookie(name: string, value: string, maxAge: number): void {
  if (typeof document === "undefined") return;

  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function removeCookie(name: string): void {
  if (typeof document === "undefined") return;

  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}
