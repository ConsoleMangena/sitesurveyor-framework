import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import SurveyMap from "./SurveyMap.tsx";

const baseProps = {
  target: { latitude: -19.5, longitude: 29.8 },
  bounds: [
    [-19.52, 29.78],
    [-19.48, 29.82],
  ] as [[number, number], [number, number]],
  candidates: [],
  layers: { aoi: true, candidates: true },
  outside: false,
  crs: "EPSG:32735",
  imagery: "Sentinel-2",
  fitToken: 0,
  resizeToken: 0,
  focus: null,
  onView: () => {},
};

describe("SurveyMap", () => {
  it("swaps the basemap without remounting its tile layer", () => {
    const { container, rerender } = render(<SurveyMap {...baseProps} basemap="satellite" />);
    const pane = container.querySelector(".leaflet-tile-pane");
    const tileLayer = pane?.querySelector(".leaflet-layer");
    expect(tileLayer).toBeTruthy();

    rerender(<SurveyMap {...baseProps} basemap="street" />);

    // A remounted basemap appends its tiles after the classified drape and hides it.
    expect(pane?.querySelector(".leaflet-layer")).toBe(tileLayer);
  });
});
