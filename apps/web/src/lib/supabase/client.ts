import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.ts";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
/** Prefer legacy anon key; Supabase dashboard may show a publishable key instead. */
const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY.",
  );
}

export const SUPABASE_URL = supabaseUrl;
/** The project's public key, needed when the app calls edge functions directly. */
export const SUPABASE_ANON_KEY = supabaseKey;

/**
 * True when the page was opened with a session in the URL fragment.
 *
 * A recovery link is read wherever the email happens to be opened, so it
 * carries the session in the fragment instead of a PKCE code. A PKCE client
 * refuses such a redirect outright ("Not a valid PKCE flow url."), so the
 * client has to be an implicit one for that arrival.
 */
function arrivingWithImplicitSession(): boolean {
  if (typeof window === "undefined") return false;
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return fragment.has("access_token");
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: arrivingWithImplicitSession() ? "implicit" : "pkce",
  },
});

let recoveryClient: SupabaseClient<Database> | null = null;

/**
 * A client that never registers a PKCE challenge.
 *
 * A PKCE recovery link can only be redeemed by the browser that asked for it,
 * because the code verifier waits in that browser's storage — so a link opened
 * on a phone, in another browser, or after a sign-out fails with no way for
 * the user to tell why. Requesting the link without a challenge makes GoTrue
 * put the session in the URL fragment instead, which any browser can redeem.
 */
export function getRecoveryClient(): SupabaseClient<Database> {
  if (!recoveryClient) {
    recoveryClient = createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return recoveryClient;
}

export const isOnline = (): boolean => {
  return typeof navigator !== 'undefined' && navigator.onLine;
};
