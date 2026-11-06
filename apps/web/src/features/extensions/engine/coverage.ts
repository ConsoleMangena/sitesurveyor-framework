/**
 * The geographic envelope the engine can actually read.
 *
 * The engines sit on Digital Earth Africa's catchment, so a point outside this
 * box has no imagery to score rather than a score of zero. Checking it here
 * turns a minute of satellite downloads and a 422 into an immediate message
 * about the coordinate that was typed.
 */
export const COVERAGE = { lonMin: -30, lonMax: 66, latMin: -56, latMax: 41 };

export function outsideCoverage(latitude: number, longitude: number): boolean {
  return !(
    latitude >= COVERAGE.latMin &&
    latitude <= COVERAGE.latMax &&
    longitude >= COVERAGE.lonMin &&
    longitude <= COVERAGE.lonMax
  );
}
