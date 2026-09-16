/**
 * Shared Supabase helpers for Edge Functions.
 *
 * - `adminClient()` uses the service-role key for privileged reads/writes
 *   that bypass RLS.
 * - `getCaller()` resolves the authenticated user from the request's
 *   Authorization bearer token.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured");
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
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
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
