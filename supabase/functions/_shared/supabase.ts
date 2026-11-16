/**
 * Shared Supabase helpers for Edge Functions.
 *
 * - `adminClient()` uses the service-role key for privileged reads/writes
 *   that bypass RLS.
 * - `getCaller()` resolves the authenticated user from the request's
 *   Authorization bearer token.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  // Legacy key format exposes `SUPABASE_SERVICE_ROLE_KEY`; projects that have
  // migrated to the new API keys only get `SUPABASE_SECRET_KEY`.
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY");
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) are not configured",
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface Caller {
  id: string;
  email: string | null;
  /** Whether the caller's email has been verified by Supabase Auth. */
  emailConfirmed: boolean;
}

/** Resolve the authenticated caller (id + email) from the request, or null. */
export async function getCaller(req: Request): Promise<Caller | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !anonKey) return null;

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const u = data.user;
  const emailConfirmed = Boolean(
    (u as { email_confirmed_at?: string | null }).email_confirmed_at ||
      (u as { confirmed_at?: string | null }).confirmed_at,
  );
  return { id: u.id, email: u.email ?? null, emailConfirmed };
}

/** Resolve the authenticated caller's user id from the request, or null. */
export async function getCallerId(req: Request): Promise<string | null> {
  const caller = await getCaller(req);
  return caller?.id ?? null;
}

/** Compares two secrets without returning early on the first difference. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * True when the request presents the project's service key.
 *
 * A function that writes across every workspace must not be reachable by a
 * signed-in user, so the gate compares the credential itself with the
 * configured secret. The token's JWT payload is deliberately not inspected:
 * an unverified `role: service_role` claim is attacker-controlled and would
 * let anyone forge a service token. Both key formats are covered because the
 * runtime exposes whichever one the project is configured with.
 */
export function hasServiceKey(req: Request): boolean {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return false;

  const configured = [
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    Deno.env.get("SUPABASE_SECRET_KEY"),
  ];
  return configured.some((key) => Boolean(key) && sameSecret(token, key!));
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
