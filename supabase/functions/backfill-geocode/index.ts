/**
 * Edge Function: backfill-geocode
 * --------------------------------
 * Resolves stored coordinates for rows that predate auto-geocoding (or whose
 * save-time lookup failed). Writes go through the service-role client because
 * the rows belong to other workspaces.
 *
 * That makes it unsafe to leave open to users: any signed-in account could
 * rewrite the coordinates of another workspace's listings, and every call
 * spends requests on a third party's free geocoding API. The caller must
 * therefore present the project's service key. It is meant to be run by a
 * scheduler, not by a person.
 *
 * Each run processes at most BATCH_LIMIT rows per table and spaces requests
 * to respect the free geocoding API. Idempotent: rows with coordinates are
 * skipped, so run repeatedly until `{ processed: 0 }`.
 */

import { corsHeaders, hasServiceKey, adminClient, json } from "../_shared/supabase.ts";

const GEOCODE_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const BATCH_LIMIT = 200;
const REQUEST_SPACING_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url =
      `${GEOCODE_ENDPOINT}?name=${encodeURIComponent(query)}` +
      "&count=1&language=en&format=json";
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = await res.json();
    const hit = body.results?.[0];
    if (
      !hit ||
      typeof hit.latitude !== "number" ||
      typeof hit.longitude !== "number"
    ) {
      return null;
    }
    return { lat: hit.latitude, lng: hit.longitude };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  if (!hasServiceKey(req)) {
    return json({ error: "service key required" }, 401);
  }

  const admin = adminClient();
  let updated = 0;
  let failed = 0;
  let processed = 0;

  for (const table of ["marketplace_listings", "professionals"] as const) {
    const { data: rows, error } = await admin
      .from(table)
      .select("id, location")
      .is("latitude", null)
      .not("location", "is", null)
      .limit(BATCH_LIMIT);
    if (error) {
      return json({ error: error.message }, 500);
    }

    for (const row of rows ?? []) {
      processed++;
      const location = (row.location ?? "").trim();
      if (!location) continue;
      const coords = await geocode(location);
      if (!coords) {
        failed++;
        continue;
      }
      const { error: updateError } = await admin
        .from(table)
        .update({ latitude: coords.lat, longitude: coords.lng })
        .eq("id", row.id);
      if (updateError) {
        failed++;
      } else {
        updated++;
      }
      await sleep(REQUEST_SPACING_MS);
    }
  }

  return json({ updated, failed, processed });
});
