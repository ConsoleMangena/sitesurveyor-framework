import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachCoordinates,
  clearGeocodeCache,
  geocodeLocation,
} from "./geocode.ts";

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearGeocodeCache();
});

describe("geocodeLocation", () => {
  it("resolves the first Open-Meteo hit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        results: [
          { latitude: -1.286389, longitude: 36.817223, name: "Nairobi" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await geocodeLocation("Nairobi, Kenya")).toEqual({
      lat: -1.286389,
      lng: 36.817223,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("name=Nairobi");
  });

  it("returns null for blank input without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await geocodeLocation("   ")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when nothing matched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({})));
    expect(await geocodeLocation("Nowhereville")).toBeNull();
  });

  it("returns null on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("boom", { status: 500 })),
    );
    expect(await geocodeLocation("Nairobi")).toBeNull();
  });

  it("returns null when the request fails or times out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await geocodeLocation("Nairobi")).toBeNull();
  });

  it("caches repeated queries but not failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({ results: [{ latitude: 1, longitude: 2 }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await geocodeLocation("Nairobi");
    await geocodeLocation("Nairobi");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await geocodeLocation("Kisumu");
    await geocodeLocation("Kisumu");
    expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(2);
  });
});

describe("attachCoordinates", () => {
  it("fills missing coordinates from the location text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okResponse({ results: [{ latitude: -1.29, longitude: 36.82 }] }),
      ),
    );

    const payload = await attachCoordinates({
      name: "Leica TS16",
      location: "Nairobi",
      latitude: null,
      longitude: null,
    });
    expect(payload.latitude).toBe(-1.29);
    expect(payload.longitude).toBe(36.82);
    expect(payload.name).toBe("Leica TS16");
  });

  it("keeps coordinates that are already present", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const payload = await attachCoordinates({
      location: "Nairobi",
      latitude: 5,
      longitude: 6,
    });
    expect(payload).toEqual({ location: "Nairobi", latitude: 5, longitude: 6 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves the payload untouched when there is no location", async () => {
    const payload = await attachCoordinates({
      name: "Drone",
      latitude: null,
      longitude: null,
    });
    expect(payload).toEqual({ name: "Drone", latitude: null, longitude: null });
  });

  it("returns the payload unchanged when geocoding fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const payload = await attachCoordinates({
      location: "Nairobi",
      latitude: null,
      longitude: null,
    });
    expect(payload).toEqual({
      location: "Nairobi",
      latitude: null,
      longitude: null,
    });
  });
});
