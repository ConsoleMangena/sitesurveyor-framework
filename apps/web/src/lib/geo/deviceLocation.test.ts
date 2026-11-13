import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cacheDeviceLocation,
  clearDeviceLocationCache,
  readCachedDeviceLocation,
  requestDeviceLocation,
} from "./deviceLocation.ts";

function mockGeolocation(impl: (success: PositionCallback, failure: PositionErrorCallback) => void) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (
        success: PositionCallback,
        failure: PositionErrorCallback,
      ) => impl(success, failure),
    },
  });
}

afterEach(() => {
  clearDeviceLocationCache();
  vi.restoreAllMocks();
});

describe("device location cache", () => {
  it("round-trips a fix through localStorage", () => {
    cacheDeviceLocation({ lat: -17.83, lng: 31.05, takenAt: 123 });
    expect(readCachedDeviceLocation()).toEqual({ lat: -17.83, lng: 31.05, takenAt: 123 });
  });

  it("rejects malformed cache entries", () => {
    localStorage.setItem("sitesurveyor:device-location", '{"lat":"nope"}');
    expect(readCachedDeviceLocation()).toBeNull();
    localStorage.setItem("sitesurveyor:device-location", "not json");
    expect(readCachedDeviceLocation()).toBeNull();
  });
});

describe("requestDeviceLocation", () => {
  it("resolves a rounded fix and caches it", async () => {
    mockGeolocation((success) =>
      success({
        coords: { latitude: -17.829219, longitude: 31.052241, accuracy: 5 },
        timestamp: Date.now(),
      } as GeolocationPosition),
    );
    const fix = await requestDeviceLocation();
    expect(fix.lat).toBe(-17.82922);
    expect(fix.lng).toBe(31.05224);
    expect(readCachedDeviceLocation()).toEqual(fix);
  });

  it("reports a declined permission as 'denied' with calm copy", async () => {
    mockGeolocation((_success, failure) =>
      failure({ code: 1, message: "denied" } as GeolocationPositionError),
    );
    await expect(requestDeviceLocation()).rejects.toMatchObject({
      status: "denied",
      message: expect.stringContaining("Location permission"),
    });
  });

  it("reports missing hardware as 'unavailable'", async () => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
    await expect(requestDeviceLocation()).rejects.toMatchObject({
      status: "unavailable",
      message: expect.stringContaining("browser cannot share"),
    });
  });
});
