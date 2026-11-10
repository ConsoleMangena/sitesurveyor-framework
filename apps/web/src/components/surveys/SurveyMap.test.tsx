import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { Map as LeafletMap } from "leaflet";

import SurveyMap from "./SurveyMap.tsx";
import type { MapTool } from "./WorkbenchBar.tsx";

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

/** The canvas tools, driven through the Leaflet instance so a click lands on an exact
 *  coordinate instead of on whatever jsdom's zero-sized bounding box projects to. */
function armed(tool: MapTool) {
  let map: LeafletMap | null = null;
  const onMoveTarget = vi.fn();
  const onMeasureText = vi.fn();
  const utils = render(
    <SurveyMap
      {...baseProps}
      basemap="satellite"
      tool={tool}
      onMoveTarget={onMoveTarget}
      onMeasureText={onMeasureText}
      onMapReady={(instance) => {
        map = instance;
      }}
    />,
  );
  const instance = map as unknown as LeafletMap;
  return {
    ...utils,
    onMoveTarget,
    onMeasureText,
    click(latitude: number, longitude: number) {
      act(() => {
        instance.fire("click", { latlng: { lat: latitude, lng: longitude } });
      });
    },
  };
}

describe("SurveyMap canvas tools", () => {
  it("leaves the canvas alone while panning", () => {
    const tools = armed("pan");
    tools.click(-19.5, 29.8);
    expect(tools.onMoveTarget).not.toHaveBeenCalled();
    expect(screen.queryByText("Click the map to measure")).not.toBeInTheDocument();
    expect(tools.container.querySelector<HTMLElement>(".leaflet-container")?.style.cursor).toBe("");
  });

  it("arms a crosshair so the operator can see a click will do something", () => {
    const tools = armed("measure");
    expect(tools.container.querySelector<HTMLElement>(".leaflet-container")?.style.cursor).toBe(
      "crosshair",
    );
  });

  it("says how to start before there is anything to measure", () => {
    armed("measure");
    expect(screen.getByText("Click the map to measure")).toBeInTheDocument();
  });

  it("reports the great-circle distance, not the Mercator ruler's longer one", () => {
    const tools = armed("measure");
    tools.click(-19.5, 29.8);
    tools.click(-19.5, 29.9);

    // Spherical law of cosines: an independent computation from the haversine under test.
    const rad = Math.PI / 180;
    const central = Math.acos(
      Math.sin(-19.5 * rad) ** 2 + Math.cos(-19.5 * rad) ** 2 * Math.cos(0.1 * rad),
    );
    const km = (6_371_000 * central) / 1000;
    expect(screen.getByText(`${km.toFixed(2)} km`)).toBeInTheDocument();
    // 0.1° of longitude at the equator is the answer a projected-canvas ruler gives.
    expect(screen.queryByText("11.13 km")).not.toBeInTheDocument();
  });

  it("closes the ring at the third vertex and reports the ground it encloses", () => {
    const tools = armed("measure");
    tools.click(-19.5, 29.8);
    tools.click(-19.5, 29.81);
    tools.click(-19.49, 29.81);
    // ~1.05 km by ~1.11 km, halved: 58 ha. A projected area would read ~66 ha here.
    expect(screen.getByText(/km · 58\.\d{2} ha/)).toBeInTheDocument();
  });

  it("undoes one vertex at a time and clears back to the prompt", () => {
    const tools = armed("measure");
    tools.click(-19.5, 29.8);
    tools.click(-19.5, 29.81);
    tools.click(-19.49, 29.81);

    fireEvent.click(screen.getByRole("button", { name: "Remove the last point" }));
    expect(screen.queryByText(/ha/)).not.toBeInTheDocument();
    expect(screen.getByText(/km$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear the measurement" }));
    expect(screen.getByText("Click the map to measure")).toBeInTheDocument();
  });

  it("drops the measurement when the tool is put away, so the next one starts clean", () => {
    const tools = armed("measure");
    tools.click(-19.5, 29.8);
    tools.click(-19.5, 29.9);
    expect(tools.onMeasureText).toHaveBeenLastCalledWith(expect.stringContaining("km"));

    tools.rerender(
      <SurveyMap {...baseProps} basemap="satellite" tool="pan" onMeasureText={tools.onMeasureText} />,
    );
    expect(tools.onMeasureText).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText(/km$/)).not.toBeInTheDocument();
  });

  it("hands the clicked coordinate to the target form when placing the pin", () => {
    const tools = armed("target");
    tools.click(-19.4321, 29.8765);
    expect(tools.onMoveTarget).toHaveBeenCalledWith(-19.4321, 29.8765);
    expect(screen.queryByText("Click the map to measure")).not.toBeInTheDocument();
  });
});
