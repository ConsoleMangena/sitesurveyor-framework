/**
 * Distance helpers shared by the transport fleet and the marketplace registry.
 *
 * Both surfaces group what they show by "how far from me", so the bucket
 * boundaries, the label grammar and the great-circle maths all live here —
 * one definition, one set of test pins.
 */

/** Great-circle distance in kilometres (haversine). */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  if (lat1 === lat2 && lng1 === lng2) return 0;
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Compact human distance: metres under a kilometre, one decimal to 10 km,
 * whole kilometres beyond. The unit is always visible — field crews read
 * these on a phone in bright sun.
 */
export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

export interface DistanceBand {
  /** Stable key for React lists and test pins. */
  key: string;
  label: string;
  /** Inclusive lower bound in km (open-ended bands use 0 / Infinity). */
  min: number;
  /** Exclusive upper bound in km. */
  max: number;
}

/**
 * The bands every "nearby" list on the platform uses. Ordered nearest first;
 * the open tail carries anything beyond the last named ring.
 */
export const DISTANCE_BANDS: DistanceBand[] = [
  { key: "under-2", label: "Under 2 km", min: 0, max: 2 },
  { key: "2-10", label: "2 – 10 km", min: 2, max: 10 },
  { key: "10-50", label: "10 – 50 km", min: 10, max: 50 },
  { key: "50-200", label: "50 – 200 km", min: 50, max: 200 },
  { key: "200-plus", label: "200 km and beyond", min: 200, max: Infinity },
];

export function bandForDistance(km: number): DistanceBand {
  return DISTANCE_BANDS.find((band) => km >= band.min && km < band.max) ?? DISTANCE_BANDS[DISTANCE_BANDS.length - 1];
}

export interface Locatable {
  lat: number | null;
  lng: number | null;
}

export interface WithDistance<T> {
  item: T;
  distanceKm: number | null;
}

/** Attach a distance-from-origin to each row that has coordinates. */
export function withDistances<T extends Locatable>(
  items: T[],
  origin: { lat: number; lng: number },
): WithDistance<T>[] {
  return items.map((item) => ({
    item,
    distanceKm:
      item.lat !== null && item.lng !== null
        ? haversineKm(origin.lat, origin.lng, item.lat, item.lng)
        : null,
  }));
}

export interface DistanceGroup<T> {
  key: string;
  label: string;
  items: WithDistance<T>[];
}

/**
 * Group located rows into the shared bands, nearest band first and nearest
 * item first within each band. Rows without coordinates land in a final
 * "Location not shared" group so nothing disappears just because a pin was
 * never dropped.
 */
export function groupByDistance<T extends Locatable>(
  items: T[],
  origin: { lat: number; lng: number },
): DistanceGroup<T>[] {
  const located = withDistances(items, origin);
  const byDistance = (a: WithDistance<T>, b: WithDistance<T>) =>
    (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
  const groups: DistanceGroup<T>[] = DISTANCE_BANDS.map((band) => ({
    key: band.key,
    label: band.label,
    items: located
      .filter(
        (row) => row.distanceKm !== null && row.distanceKm >= band.min && row.distanceKm < band.max,
      )
      .sort(byDistance),
  }));
  const missing = located.filter((row) => row.distanceKm === null);
  if (missing.length > 0) {
    groups.push({ key: "unknown", label: "Location not shared", items: missing });
  }
  return groups.filter((group) => group.items.length > 0);
}
