import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { WorkbenchBar, type RibbonTab } from "./WorkbenchBar.tsx";
import type { DossierCategory } from "../../lib/surveys/labels.ts";

function props(overrides: Partial<Parameters<typeof WorkbenchBar>[0]> = {}) {
  return {
    tab: "home" as RibbonTab,
    onTab: vi.fn(),
    pill: { state: "ready" as const, text: "Worker ready" },
    onRun: vi.fn(),
    running: false,
    onReload: vi.fn(),
    onClear: vi.fn(),
    process: "water" as DossierCategory,
    onProcess: vi.fn(),
    onOpenContents: vi.fn(),
    onResetView: vi.fn(),
    mapTool: "pan" as const,
    onMapTool: vi.fn(),
    tableOpen: false,
    onToggleTable: vi.fn(),
    leftOpen: true,
    rightOpen: true,
    onToggleLeft: vi.fn(),
    onToggleRight: vi.fn(),
    published: false,
    onExportPdf: vi.fn(),
    downloads: [{ kind: "boreholes_kmz", label: "KMZ", available: false }],
    onDownload: vi.fn(),
    ...overrides,
  };
}

describe("WorkbenchBar ribbon tabs", () => {
  it("reveals a tab's tools without performing any of them", () => {
    const onTab = vi.fn();
    const bar = props({ onTab });
    render(<WorkbenchBar {...bar} />);

    for (const name of ["Data", "Analyze", "View", "Publish", "Home"]) {
      fireEvent.click(screen.getByRole("tab", { name }));
    }

    expect(onTab.mock.calls.map(([tab]) => tab)).toEqual([
      "data",
      "analyze",
      "view",
      "publish",
      "home",
    ]);
    expect(bar.onRun).not.toHaveBeenCalled();
    expect(bar.onExportPdf).not.toHaveBeenCalled();
    expect(bar.onDownload).not.toHaveBeenCalled();
    expect(bar.onClear).not.toHaveBeenCalled();
    expect(bar.onResetView).not.toHaveBeenCalled();
  });

  it("opens the data browser when the Data tab is chosen", () => {
    const bar = props();
    render(<WorkbenchBar {...bar} />);
    fireEvent.click(screen.getByRole("tab", { name: "Data" }));
    expect(bar.onOpenContents).toHaveBeenCalledWith("data");
  });

  it("unfolds the analysis pane for Analyze only when it is folded", () => {
    const folded = props({ rightOpen: false });
    const { rerender } = render(<WorkbenchBar {...folded} />);
    fireEvent.click(screen.getByRole("tab", { name: "Analyze" }));
    expect(folded.onToggleRight).toHaveBeenCalledTimes(1);

    const open = props();
    rerender(<WorkbenchBar {...open} />);
    fireEvent.click(screen.getByRole("tab", { name: "Analyze" }));
    expect(open.onToggleRight).not.toHaveBeenCalled();
  });
});

describe("WorkbenchBar Analyze", () => {
  it("marks the process the next run will execute and reports a change", () => {
    const bar = props({ tab: "analyze" });
    const { rerender } = render(<WorkbenchBar {...bar} />);

    expect(screen.getByRole("button", { name: "Water" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Run Water" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mineral Prospectivity" }));
    expect(bar.onProcess).toHaveBeenCalledWith("minerals");

    rerender(<WorkbenchBar {...props({ tab: "analyze", process: "minerals" })} />);
    expect(screen.getByRole("button", { name: "Mineral Prospectivity" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Water" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Run Mineral Prospectivity" })).toBeInTheDocument();
  });

  it("will not queue a second survey while one is running", () => {
    const bar = props({ tab: "analyze", running: true, process: "minerals" });
    render(<WorkbenchBar {...bar} />);
    expect(screen.getByRole("button", { name: "Run Mineral Prospectivity" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Run Mineral Prospectivity" }));
    expect(bar.onRun).not.toHaveBeenCalled();
  });
});

describe("WorkbenchBar View", () => {
  it("arms one canvas tool at a time", () => {
    const bar = props({ tab: "view" });
    const { rerender } = render(<WorkbenchBar {...bar} />);

    expect(screen.getByRole("button", { name: "Pan" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Measure" }));
    expect(bar.onMapTool).toHaveBeenCalledWith("measure");

    rerender(<WorkbenchBar {...props({ tab: "view", mapTool: "measure" })} />);
    expect(screen.getByRole("button", { name: "Measure" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Pan" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the attribute dock as the state it is in", () => {
    const bar = props({ tab: "view", tableOpen: true });
    render(<WorkbenchBar {...bar} />);
    const toggle = screen.getByRole("button", { name: "Attribute table" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    expect(bar.onToggleTable).toHaveBeenCalledTimes(1);
  });
});

describe("WorkbenchBar Publish", () => {
  it("offers nothing that a run has not produced, and says why on hover", () => {
    const bar = props({ tab: "publish" });
    render(<WorkbenchBar {...bar} />);

    const sheet = screen.getByRole("button", { name: "PDF map sheet" });
    expect(sheet).toBeDisabled();
    expect(sheet).toHaveAttribute("title", "Run or select a completed survey first");

    const kmz = screen.getByRole("button", { name: "KMZ" });
    expect(kmz).toBeDisabled();
    expect(kmz).toHaveAttribute("title", "This run did not publish that file");
    fireEvent.click(kmz);
    expect(bar.onDownload).not.toHaveBeenCalled();
  });

  it("publishes only what this run wrote, once asked", () => {
    const bar = props({
      tab: "publish",
      published: true,
      downloads: [
        { kind: "boreholes_kmz", label: "KMZ", available: true },
        { kind: "boreholes_geojson", label: "GeoJSON", available: false },
      ],
    });
    render(<WorkbenchBar {...bar} />);
    expect(bar.onExportPdf).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "PDF map sheet" }));
    expect(bar.onExportPdf).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "KMZ" }));
    expect(bar.onDownload).toHaveBeenCalledWith("boreholes_kmz");
    expect(screen.getByRole("button", { name: "GeoJSON" })).toBeDisabled();
  });
});

describe("WorkbenchBar Home", () => {
  let bar: ReturnType<typeof props>;

  beforeEach(() => {
    bar = props();
  });

  it("runs, reloads and clears only when pressed", () => {
    render(<WorkbenchBar {...bar} />);
    fireEvent.click(screen.getByRole("button", { name: "Run survey" }));
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear board" }));
    expect(bar.onRun).toHaveBeenCalledTimes(1);
    expect(bar.onReload).toHaveBeenCalledTimes(1);
    expect(bar.onClear).toHaveBeenCalledTimes(1);
  });

  it("offers the assistant only when there is a survey to hand over", () => {
    const { rerender } = render(<WorkbenchBar {...bar} />);
    expect(screen.queryByRole("button", { name: "Ask AI" })).not.toBeInTheDocument();

    const onAskAi = vi.fn();
    rerender(<WorkbenchBar {...props({ onAskAi })} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask AI" }));
    expect(onAskAi).toHaveBeenCalledTimes(1);
  });
});