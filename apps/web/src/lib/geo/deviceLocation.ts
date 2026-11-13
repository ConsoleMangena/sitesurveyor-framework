/**
 * Device location: one place that asks the browser for a GPS fix and keeps it.
 *
 * Both public surfaces need the same behaviour — grab the device position
 * without the user ever typing coordinates, then fall back gracefully when
 * permission is denied or the hardware is missing. Keeping it here means the
 * transport page and the marketplace share one prompt, one cached fix and one
 * error vocabulary.
 */

export interface DeviceLocation {
  lat: number;
  lng: number;
  /** Milliseconds since the fix was taken — callers can label it "just now". */
  takenAt: number;
}

export type DeviceLocationStatus =
  | "idle"
  | "locating"
  | "granted"
  | "denied"
  | "unavailable";

export interface DeviceLocationState {
  location: DeviceLocation | null;
  status: DeviceLocationStatus;
  /** Human-readable reason, set when status is `denied` or `unavailable`. */
  error: string | null;
}

/** Key for the cached last-known fix — survives reloads so a returning visitor
 *  sees nearby results immediately, before the next GPS prompt resolves. */
const CACHE_KEY = "sitesurveyor:device-location";

export function readCachedDeviceLocation(): DeviceLocation | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceLocation;
    if (typeof parsed?.lat !== "number" || typeof parsed?.lng !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function cacheDeviceLocation(location: DeviceLocation): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(location));
  } catch {
    // Storage is a convenience, never a requirement.
  }
}

export function clearDeviceLocationCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage is a convenience, never a requirement.
  }
}

/** Rounds to 5 decimals (~1 m) so cached and live fixes compare stably. */
function roundCoord(value: number): number {
  return Math.round(value * 100_000) / 100_000;
}

function describeGeolocationError(error: GeolocationPositionError): {
  status: DeviceLocationStatus;
  message: string;
} {
  // The codes are numeric on the error object; the `GeolocationPositionError`
  // constants live on the constructor, not the instance.
  switch (error.code) {
    case 1: // PERMISSION_DENIED
      return {
        status: "denied",
        message: "Location permission was declined. Allow it in your browser to see what is near you.",
      };
    case 2: // POSITION_UNAVAILABLE
      return {
        status: "unavailable",
        message: "Your device could not get a GPS fix. Try again outdoors or set the point on the map.",
      };
    default: // TIMEOUT
      return {
        status: "unavailable",
        message: "Timed out waiting for a GPS fix. Try again in a moment.",
      };
  }
}

/**
 * Resolve the device position exactly once per call. Returns the fix or throws
 * a `{ status, message }` shaped failure so every caller renders the same copy.
 */
export function requestDeviceLocation(): Promise<DeviceLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject({
        status: "unavailable" as const,
        message: "This browser cannot share a location. Set the point on the map instead.",
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location: DeviceLocation = {
          lat: roundCoord(position.coords.latitude),
          lng: roundCoord(position.coords.longitude),
          takenAt: Date.now(),
        };
        cacheDeviceLocation(location);
        resolve(location);
      },
      (error) => {
        const described = describeGeolocationError(error);
        reject({ status: described.status, message: described.message });
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
