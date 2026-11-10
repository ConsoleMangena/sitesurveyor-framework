import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import ContentsPanel from "./ContentsPanel.tsx";
import { CATEGORY_ZONE_LABELS } from "../../lib/surveys/labels.ts";

const noop = () => {};

function panel(category: "minerals" | "water", gravimetry?: string) {
  return render(
    <ContentsPanel
      layers={{ aoi: true, candidates: true, raster: true }}
      onLayer={noop}
      hasRaster
      basemap="satellite"
      onBasemap={noop}
      snapshot={{
        target: "-19.50000, 29.80000",
        crs: "EPSG:32735",
        grid: "30 m",
        source: "Synthetic run",
        inputs: "Sentinel-2",
        basis: "Percentile within this AOI",
        gravimetry,
      }}
      runs={[]}
      selectedId={null}
      loading={false}
      onSelect={noop}
      cancelling={null}
      onCancel={noop}
      onCollapse={noop}
      activeDossierCategory={category}
    />,
  );
}

describe("ContentsPanel raster legend", () => {
  it("lists every mineral system on the dominant-mineral drape, not a five-step ramp", () => {
    panel("minerals");
    expect(screen.getByText("Dominant mineral system")).toBeInTheDocument();
    for (const label of CATEGORY_ZONE_LABELS.minerals) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText("Very high prospectivity")).not.toBeInTheDocument();
  });

  it("keeps the ramp legend for the categories that are still ramps", () => {
    panel("water");
    expect(screen.getByText("Classified Potential")).toBeInTheDocument();
    expect(screen.getByText("Very high potential")).toBeInTheDocument();
    expect(screen.queryByText("Gold (Au)")).not.toBeInTheDocument();
  });
});

describe("ContentsPanel survey snapshot", () => {
  const modelled =
    "SiteSurveyor synthetic Bouguer calibration field; analytic model, not a measured survey" +
    " — modelled field, not a measurement; excluded from scoring";

  it("states what the gravity field was worth beside the numbers it sits under", () => {
    panel("minerals", modelled);
    expect(screen.getByText("Gravimetry")).toBeInTheDocument();
    // The row truncates, so the whole disclosure has to survive in the hover text.
    expect(screen.getByText(modelled)).toHaveAttribute("title", modelled);
  });

  it("adds no gravity row to a survey that never recorded one", () => {
    panel("water");
    expect(screen.queryByText("Gravimetry")).not.toBeInTheDocument();
  });
});