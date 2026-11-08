// Byte-range proxy for a private survey deliverable.
//
// The workbench map reads its classified PMTiles archive one byte slice at a
// time, and a signed storage URL is not a guarantee for those range requests on
// every project tier. This function is the guarantee: it proves the caller is
// signed in, proves through row-level security that the caller's workspace owns
// the deliverable being asked for, and only then streams the requested slice
// straight out of Storage with the service-role certificate the worker uploads
// with. Nothing about the object itself is exposed unless the caller's token
// would already have been allowed to read the row through the app.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCaller, json } from "../_shared/supabase.ts";

const BUCKET = "survey-deliverables";

// The worker uploads every deliverable as {workspace_id}/{run_id}/{filename},
// which is the exact shape the storage read policy already trusts. Enforcing it
// here as well means the query parameter cannot wander into another layout no
// matter what a caller asks for.
const OBJECT_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/;

// The browser preflights an arbitrary Range header (it is not CORS-safelisted),
// and the tile reader may want to read the archive's ETag, so preflight headers
// slightly wider than _shared's POST-style set.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Expose-Headers": "etag, content-range, accept-ranges",
};

/** Only forward a Range header Storage actually understands. */
function safeRange(range: string): string {
  return /^bytes=\d+-\d*$/.test(range) ? range : "";
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return json({ error: "GET is the only method for deliverable ranges." }, 405);
  }

  const caller = await getCaller(req);
  if (!caller) {
    return json({ error: "Sign in to open survey deliverables." }, 401);
  }

  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!OBJECT_PATH.test(path)) {
    return json(
      { error: "path must be workspace/run/filename inside survey-deliverables." },
      400,
    );
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !anonKey) {
    return json({ error: "The proxy is not configured." }, 500);
  }

  // Ownership check, resolved with the caller's own token so the table's
  // member-only RLS does the deciding: the deliverable row must exist, and be
  // readable by an active member of its workspace. Spraying another tenant's
  // storage paths at the query parameter lands here.
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: deliverable } = await userClient
    .from("survey_deliverables")
    .select("id")
    .eq("storage_path", path)
    .maybeSingle();
  if (!deliverable) {
    // One 404 for both "wrong tenant" and "deleted": the difference is
    // information a stranger should not get.
    return json({ error: "Deliverable not found." }, 404);
  }

  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  if (!serviceKey) {
    return json({ error: "The proxy is not configured." }, 500);
  }

  const objectUrl =
    `${url}/storage/v1/object/${BUCKET}/` +
    path.split("/").map(encodeURIComponent).join("/");
  const upstreamHeaders: Record<string, string> = {
    Authorization: `Bearer ${serviceKey}`,
  };
  const range = safeRange(req.headers.get("range") ?? "");
  if (range) upstreamHeaders.range = range;

  const upstream = await fetch(objectUrl, { headers: upstreamHeaders });
  // 200/206 are ordinary reads; 416 is forwarded raw because the reader (not
  // this proxy) decides how to renegotiate a sliding directory window moving
  // past the end of a freshly rewritten archive.
  if (!upstream.ok && upstream.status !== 416) {
    return json(
      { error: `Storage could not serve that slice (${upstream.status}).` },
      upstream.status === 404 ? 404 : 502,
    );
  }

  const headers = new Headers(corsHeaders);
  for (const name of [
    "content-type",
    "content-length",
    "content-range",
    "etag",
    "last-modified",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("accept-ranges", "bytes");
  // Byte ranges must never sit in a browser or intermediary cache -- a stored
  // ranged entry later turns ordinary requests into ERR_CACHE_OPERATION_
  // NOT_SUPPORTED failures -- and every read is already owned by one session's
  // token, so there is nothing worth caching in the first place.
  headers.set("cache-control", "private, no-store");
  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
});
