import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import ContentsPanel from "./ContentsPanel.tsx";
import { CATEGORY_ZONE_LABELS } from "../../lib/surveys/labels.ts";

const noop = () => {};

function panel(category: "minerals" | "water") {
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