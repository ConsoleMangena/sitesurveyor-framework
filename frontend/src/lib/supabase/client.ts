import { createClient } from "@supabase/supabase-js";
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

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});

export const isOnline = (): boolean => {
  return typeof navigator !== 'undefined' && navigator.onLine;
};
