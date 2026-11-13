import type { LocationCoordinate } from "../../lib/transportHire.ts";

const RECENT_LOCATIONS_KEY = "sitesurveyor_transport_recent_locations";
const MAX_RECENT_LOCATIONS = 5;

/**
 * Loads the recently chosen pickup / destination coordinates from local
 * storage. Kept in its own module (rather than the search field component)
 * so both the field and the transport page can share it without mixing
 * non-component exports into a component file.
 */
export function loadRecentLocations(): LocationCoordinate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_LOCATIONS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT_LOCATIONS) : [];
  } catch {
    return [];
  }
}

export function rememberLocation(location: LocationCoordinate): void {
  try {
    const next = [
      location,
      ...loadRecentLocations().filter((item) => item.label !== location.label),
    ].slice(0, MAX_RECENT_LOCATIONS);
    localStorage.setItem(RECENT_LOCATIONS_KEY, JSON.stringify(next));
  } catch {
    // Location search remains usable when storage is unavailable.
  }
}
