import { useCallback, useEffect, useState } from "react";
import {
  cacheDeviceLocation,
  clearDeviceLocationCache,
  readCachedDeviceLocation,
  requestDeviceLocation,
  type DeviceLocation,
  type DeviceLocationState,
} from "./deviceLocation.ts";

export interface UseDeviceLocation extends DeviceLocationState {
  /** Ask for a fresh GPS fix. Returns the fix, or null when it failed. */
  locate: () => Promise<DeviceLocation | null>;
  /** Forget the fix (and its cache) so a user can re-centre deliberately. */
  clear: () => void;
  /** A cached fix from an earlier visit is already in hand. */
  fromCache: boolean;
}

/**
 * True when the browser already granted geolocation, so we can take a fix
 * without ever showing the permission prompt.
 */
async function permissionAlreadyGranted(): Promise<boolean> {
  try {
    const permissions = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (!permissions?.query) return false;
    const result = await permissions.query({ name: "geolocation" as PermissionName });
    return result.state === "granted";
  } catch {
    return false;
  }
}

/**
 * Device position with cached recall. A returning visitor sees nearby
 * results immediately from the last-known fix; `locate()` refreshes it and is
 * the only path that can trigger the browser permission prompt — except when
 * permission was already granted, in which case a fix is taken silently on
 * mount so distance grouping is on from the first paint.
 */
export function useDeviceLocation(): UseDeviceLocation {
  const [location, setLocation] = useState<DeviceLocation | null>(readCachedDeviceLocation);
  const [status, setStatus] = useState<DeviceLocationState["status"]>(() =>
    readCachedDeviceLocation() ? "granted" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(() => readCachedDeviceLocation() !== null);

  const locate = useCallback(async () => {
    setStatus("locating");
    setError(null);
    try {
      const fix = await requestDeviceLocation();
      setLocation(fix);
      setStatus("granted");
      setFromCache(false);
      return fix;
    } catch (failure) {
      const described = failure as { status: DeviceLocationState["status"]; message: string };
      setStatus(described.status);
      setError(described.message);
      return null;
    }
  }, []);

  const clear = useCallback(() => {
    setLocation(null);
    setStatus("idle");
    setError(null);
    setFromCache(false);
    clearDeviceLocationCache();
  }, []);

  // Keep the cache warm whenever a fix lands so a reload starts nearby.
  useEffect(() => {
    if (location) cacheDeviceLocation(location);
  }, [location]);

  // Silently take a fresh fix on mount when the browser already granted
  // location — the surfaces then range and group by distance from first paint.
  useEffect(() => {
    let cancelled = false;
    void permissionAlreadyGranted().then((granted) => {
      if (!granted || cancelled) return;
      requestDeviceLocation()
        .then((fix) => {
          if (cancelled) return;
          setLocation(fix);
          setStatus("granted");
          setFromCache(false);
        })
        .catch(() => {
          // A silent refresh failing must not surface an error banner —
          // whatever cached fix we have still stands.
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { location, status, error, locate, clear, fromCache };
}
