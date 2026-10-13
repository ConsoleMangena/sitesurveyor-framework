/**
 * Generate a v4 UUID. Falls back to a simple implementation when
 * `crypto.randomUUID` is unavailable (e.g. some test environments).
 */
export function generateLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Returns a shallow copy of `obj` with `null` and `undefined` values removed.
 * Useful when feeding Supabase-generated types into WatermelonDB, which stores
 * optional fields as "absent" rather than "nullable".
 */
export function omitNullish<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined) {
      out[key as keyof T] = value as T[keyof T];
    }
  }
  return out;
}
