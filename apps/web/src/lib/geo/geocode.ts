const GEOCODE_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";

export interface Coords {
  lat: number;
  lng: number;
}

// Session-scoped memo. Definitive misses are cached too; transient failures
// (network, timeout) are not, so a later save can still succeed.
const cache = new Map<string, Coords | null>();

export function clearGeocodeCache(): void {
  cache.clear();
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Resolve to coordinates, null for a definitive miss; throws on transient
 *  failures so the caller can leave them out of the cache. */
async function requestCoords(
  query: string,
  timeoutMs: number,
): Promise<Coords | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url =
      `${GEOCODE_ENDPOINT}?name=${encodeURIComponent(query)}` +
      "&count=1&language=en&format=json";
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      results?: { latitude: number; longitude: number }[];
    };
    const hit = body.results?.[0];
    if (
      !hit ||
      typeof hit.latitude !== "number" ||
      typeof hit.longitude !== "number"
    ) {
      return null;
    }
    return { lat: hit.latitude, lng: hit.longitude };
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve free-text "City, country" to coordinates, or null. */
export async function geocodeLocation(
  text: string,
  timeoutMs = 5000,
): Promise<Coords | null> {
  const query = text.trim();
  if (!query) return null;

  const key = normalize(query);
  if (cache.has(key)) return cache.get(key) ?? null;

  try {
    const coords = await requestCoords(query, timeoutMs);
    cache.set(key, coords);
    return coords;
  } catch {
    // Transient (network/timeout): report the miss without caching it.
    return null;
  }
}

type WithOptionalCoords = {
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

/** Best-effort: fill missing coordinates from the payload's location text.
 *  Never throws — an unresolved location simply stays null. */
export async function attachCoordinates<P extends WithOptionalCoords>(
  payload: P,
): Promise<P> {
  const hasCoords =
    typeof payload.latitude === "number" &&
    Number.isFinite(payload.latitude) &&
    typeof payload.longitude === "number" &&
    Number.isFinite(payload.longitude);
  const location = payload.location?.trim();
  if (hasCoords || !location) return payload;

  try {
    const coords = await geocodeLocation(location);
    return coords
      ? { ...payload, latitude: coords.lat, longitude: coords.lng }
      : payload;
  } catch {
    return payload;
  }
}
