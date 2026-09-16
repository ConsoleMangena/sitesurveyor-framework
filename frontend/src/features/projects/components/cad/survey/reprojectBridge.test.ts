import { describe, it, expect } from "vitest";
import { reproject, isProjAvailable, lastReprojectBackend } from "./reprojectBridge.ts";
import { UTM_35S } from "./projection.ts";

// In the test (jsdom) environment there is no Tauri runtime, so the bridge must
// fall back to the in-app Karney projection.

describe("reprojectBridge (web / no Tauri)", () => {
  it("reports PROJ unavailable outside Tauri", async () => {
    expect(await isProjAvailable()).toBe(false);
  });

  it("returns empty for empty input", async () => {
    expect(await reproject("wgs84", UTM_35S, [])).toEqual([]);
  });

  it("projects WGS84 lon/lat to UTM 35S via the Karney fallback", async () => {
    // Central Zimbabwe: lon ~31.05, lat ~ -17.83. e = lon, n = lat.
    const out = await reproject("wgs84", UTM_35S, [{ e: 31.05, n: -17.83 }]);
    expect(lastReprojectBackend()).toBe("karney");
    expect(out).toHaveLength(1);
    // 31.05°E sits ~4° east of the zone-35 central meridian (27°E), so the
    // easting is a large in-zone offset; northing is ~8M m (southern hemisphere).
    expect(out[0].e).toBeGreaterThan(100000);
    expect(out[0].e).toBeLessThan(1_000_000);
    expect(out[0].n).toBeGreaterThan(8_000_000);
  });

  it("round-trips WGS84 → UTM → WGS84 within tolerance", async () => {
    const lonlat = { e: 31.05, n: -17.83 };
    const utm = await reproject("wgs84", UTM_35S, [lonlat]);
    const back = await reproject(UTM_35S, "wgs84", utm);
    expect(back[0].e).toBeCloseTo(lonlat.e, 6);
    expect(back[0].n).toBeCloseTo(lonlat.n, 6);
  });
});
