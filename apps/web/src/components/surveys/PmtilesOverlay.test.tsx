import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MapContainer } from "react-leaflet";

import PmtilesOverlay from "./PmtilesOverlay.tsx";
import { DRAPE_Z_INDEX } from "../../lib/surveys/workbench.ts";
import type { SurveyTilesSource } from "../../lib/repositories/satelliteSurveys.ts";

const { leafletRasterLayer } = vi.hoisted(() => ({
  leafletRasterLayer: vi.fn((_archive: unknown, _options?: { zIndex?: number }) => ({
    addTo: vi.fn(),
    setOpacity: vi.fn(),
  })),
}));

vi.mock("pmtiles", () => ({
  PMTiles: class {
    async getHeader() {
      return { minZoom: 7, maxZoom: 16 };
    }
  },
  leafletRasterLayer,
}));

const source: SurveyTilesSource = {
  getKey: () => "test-archive",
  getBytes: async () => ({ data: new ArrayBuffer(0) }),
};

describe("PmtilesOverlay", () => {
  it("claims an index above the basemap tiles", async () => {
    render(
      <MapContainer center={[0, 0]} zoom={10}>
        <PmtilesOverlay source={source} opacity={0.65} />
      </MapContainer>,
    );

    await waitFor(() => expect(leafletRasterLayer).toHaveBeenCalled());
    // Leaflet's tile pane orders equal z-index layers by when they were added, so a
    // basemap swap would lay its tiles over the drape unless the drape claims more.
    expect(leafletRasterLayer.mock.calls[0][1]).toMatchObject({ zIndex: DRAPE_Z_INDEX });
    expect(DRAPE_Z_INDEX).toBeGreaterThan(1);
  });
});
