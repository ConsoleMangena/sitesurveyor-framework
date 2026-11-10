import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import ContentsPanel from "./ContentsPanel.tsx";
import { CATEGORY_ZONE_LABELS } from "../../lib/surveys/labels.ts";
import type { SurveyProvenance } from "../../lib/repositories/satelliteSurveys.ts";
import type { ContentsTab } from "./WorkbenchBar.tsx";

const noop = () => {};

const MODELLED =
  "SiteSurveyor synthetic Bouguer calibration field; analytic model, not a measured survey" +
  " — modelled field, not a measurement; excluded from scoring";

function recorded(gravimetry?: string): SurveyProvenance {
  return {
    selectable: {
      dem: { coverage: "dem_cop_30", label: "Copernicus DEM 30 m", credit: null },
      optical: {
        coverage: "gm_s2_annual",
        label: "Sentinel-2 · 2023",
        credit: "Copernicus Sentinel-2",
      },
    },
    fixed: {
      alos: "ALOS PALSAR 2007 L-band mosaic",
      ...(gravimetry ? { gravimetry } : {}),
    },
  };
}

function panel(
  category: "minerals" | "water",
  provenance: SurveyProvenance | null = null,
  tab: ContentsTab = "layers",
  onTab = noop,
) {
  return render(
    <ContentsPanel
      tab={tab}
      onTab={onTab}
      provenance={provenance}
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

describe("ContentsPanel tabs", () => {
  it("shows only the section it is on, so the queue never scrolls past the layers", () => {
    panel("water", null, "layers");
    expect(screen.getByText("Basemap")).toBeInTheDocument();
    expect(screen.queryByText("Recent Jobs")).not.toBeInTheDocument();
    expect(screen.queryByText("Chosen for this run")).not.toBeInTheDocument();
  });

  it("reports a tab change instead of switching itself", () => {
    const onTab = vi.fn();
    panel("water", null, "layers", onTab);
    fireEvent.click(screen.getByRole("tab", { name: "Data" }));
    expect(onTab).toHaveBeenCalledWith("data");
  });
});

describe("ContentsPanel data browser", () => {
  it("lists the coverages the run recorded and none it did not", () => {
    panel("minerals", recorded(), "data");
    expect(screen.getByText("Copernicus DEM 30 m")).toBeInTheDocument();
    expect(screen.getByText("ALOS PALSAR 2007 L-band mosaic")).toBeInTheDocument();
    expect(screen.getByText("Copernicus Sentinel-2")).toBeInTheDocument();
    // Rainfall is a coverage the platform can read; this run never touched it.
    expect(screen.queryByText("Rainfall")).not.toBeInTheDocument();
    expect(screen.queryByText("Surface water history")).not.toBeInTheDocument();
  });

  it("separates what the form chose from what the engine pins", () => {
    panel("minerals", recorded(), "data");
    expect(screen.getByText("Chosen for this run")).toBeInTheDocument();
    expect(screen.getByText("Pinned by the engine")).toBeInTheDocument();
  });

  it("lets the whole gravity disclosure be read instead of hiding it behind a hover", () => {
    panel("minerals", recorded(MODELLED), "data");
    const disclosure = screen.getByText(MODELLED);
    expect(disclosure).toBeInTheDocument();
    expect(disclosure).toHaveClass("break-words");
  });

  it("keeps the gravity disclosure off the layers it is not drawn with", () => {
    panel("minerals", recorded(MODELLED), "layers");
    expect(screen.queryByText("Gravimetry")).not.toBeInTheDocument();
  });

  it("says nothing was recorded rather than advertising coverages that were not read", () => {
    panel("water", null, "data");
    expect(screen.getByText(/No survey has recorded its inputs yet/)).toBeInTheDocument();
    expect(screen.queryByText("Elevation model")).not.toBeInTheDocument();
    expect(screen.queryByText("Chosen for this run")).not.toBeInTheDocument();
  });
});