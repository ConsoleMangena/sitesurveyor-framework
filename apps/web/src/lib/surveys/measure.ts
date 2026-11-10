/** Geodesic measurement for the map canvas.
 *
 * Distances and areas are computed on a sphere, not on the projected canvas: at AOI
 * scale a Web Mercator ruler reads long by 1/cos(latitude), which at Zimbabwe's 19°S
 * is already 6% — enough to mis-state a claim boundary.
 */

export interface MeasurePoint {
  latitude: number;
  longitude: number;
}

/** Mean Earth radius, the same one Leaflet's CRS.Earth uses for `distanceTo`. */
const EARTH_RADIUS_M = 6_371_000;
const RAD = Math.PI / 180;

function isPoint(value: MeasurePoint): boolean {
  return (
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.latitude) <= 90 &&
    Math.abs(value.longitude) <= 180
  );
}

/** Great-circle distance between two points, in metres. */
export function segmentDistanceM(a: MeasurePoint, b: MeasurePoint): number {
  const dLat = (b.latitude - a.latitude) * RAD;
  const dLon = (b.longitude - a.longitude) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * RAD) * Math.cos(b.latitude * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Length of an open path. Fewer than two usable points measures nothing. */
export function pathDistanceM(points: readonly MeasurePoint[]): number {
  const usable = points.filter(isPoint);
  let total = 0;
  for (let i = 1; i < usable.length; i += 1) {
    total += segmentDistanceM(usable[i - 1], usable[i]);
  }
  return total;
}

/** Area of the closed ring through the points, in square metres.
 *
 * Spherical excess summed over the edges (the Chamberlain–Duquette form Leaflet.Draw
 * uses). A ring needs three vertices; anything less encloses no ground. The result is
 * unsigned, so clicking clockwise or anticlockwise measures the same parcel.
 */
export function polygonAreaM2(points: readonly MeasurePoint[]): number {
  const usable = points.filter(isPoint);
  if (usable.length < 3) return 0;

  let total = 0;
  for (let i = 0; i < usable.length; i += 1) {
    const p1 = usable[i];
    const p2 = usable[(i + 1) % usable.length];
    // Longitude wraps at the antimeridian; the short way round is the edge drawn.
    let dLon = p2.longitude - p1.longitude;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    total += dLon * RAD * (2 + Math.sin(p1.latitude * RAD) + Math.sin(p2.latitude * RAD));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

/** A distance in the unit a reader would use for it. */
export function measureDistanceText(metres: number): string {
  if (!Number.isFinite(metres) || metres <= 0) return "0 m";
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(2)} km`;
}

/** An area in the unit a reader would use for it: hectares are the land-parcel unit. */
export function measureAreaText(squareMetres: number): string {
  if (!Number.isFinite(squareMetres) || squareMetres <= 0) return "0 m²";
  if (squareMetres < 10_000) return `${Math.round(squareMetres)} m²`;
  if (squareMetres < 1_000_000) return `${(squareMetres / 10_000).toFixed(2)} ha`;
  return `${(squareMetres / 1_000_000).toFixed(2)} km²`;
}