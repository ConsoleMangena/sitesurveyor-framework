import type { UiUser } from "../../features/workspace/types";

const CACHE_KEY = "sse:cached-user";

/**
 * Persist the resolved UI user so the app can bootstrap while offline.
 * The Supabase session is already cached by the Supabase client; this cache
 * provides the profile/workspace metadata that the app needs after sign-in.
 */
export function saveCachedUser(user: UiUser): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(user));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function loadCachedUser(): UiUser | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as Partial<UiUser>;
    if (
      typeof p.id === "string" &&
      typeof p.workspaceId === "string" &&
      typeof p.name === "string" &&
      typeof p.email === "string" &&
      typeof p.accountType === "string"
    ) {
      return p as UiUser;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearCachedUser(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
