import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearDeviceLocationCache } from "./deviceLocation.ts";
import { useDeviceLocation } from "./useDeviceLocation.ts";

function mockGeolocation(impl: (success: PositionCallback, failure: PositionErrorCallback) => void) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback, failure: PositionErrorCallback) =>
        impl(success, failure),
    },
  });
}

function mockPermission(state: PermissionState | "unsupported") {
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value:
      state === "unsupported"
        ? undefined
        : { query: () => Promise.resolve({ state }) },
  });
}

afterEach(() => {
  clearDeviceLocationCache();
  vi.restoreAllMocks();
});

describe("useDeviceLocation", () => {
  it("starts idle without a fix and resolves one on locate()", async () => {
    mockPermission("prompt");
    mockGeolocation((success) =>
      success({
        coords: { latitude: -17.82921, longitude: 31.05224, accuracy: 5 },
        timestamp: Date.now(),
      } as GeolocationPosition),
    );

    const { result } = renderHook(() => useDeviceLocation());
    expect(result.current.status).toBe("idle");
    expect(result.current.location).toBeNull();

    await act(async () => {
      const fix = await result.current.locate();
      expect(fix?.lat).toBe(-17.82921);
    });
    expect(result.current.status).toBe("granted");
    expect(result.current.location?.lat).toBe(-17.82921);
    expect(result.current.fromCache).toBe(false);
  });

  it("takes a silent fix on mount when permission was already granted", async () => {
    mockPermission("granted");
    mockGeolocation((success) =>
      success({
        coords: { latitude: 1.29, longitude: 36.82, accuracy: 8 },
        timestamp: Date.now(),
      } as GeolocationPosition),
    );

    const { result } = renderHook(() => useDeviceLocation());
    await waitFor(() => expect(result.current.status).toBe("granted"));
    expect(result.current.location?.lat).toBe(1.29);
  });

  it("does not take a silent fix when permission is still being asked", async () => {
    mockPermission("prompt");
    const getCurrentPosition = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    renderHook(() => useDeviceLocation());
    // Let the mount effect and its permission query settle first.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("reports a declined permission without throwing", async () => {
    mockPermission("prompt");
    mockGeolocation((_success, failure) =>
      failure({ code: 1, message: "denied" } as GeolocationPositionError),
    );

    const { result } = renderHook(() => useDeviceLocation());
    await act(async () => {
      const fix = await result.current.locate();
      expect(fix).toBeNull();
    });
    expect(result.current.status).toBe("denied");
    expect(result.current.error).toContain("Location permission");
  });
});
