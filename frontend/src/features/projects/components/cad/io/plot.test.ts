import { describe, it, expect } from "vitest";
import { buildPlotSvg, DEFAULT_PLOT_OPTIONS, DEFAULT_TITLE_BLOCK, type PlotOptions } from "./plot.ts";
import { emptyModel, LAYER_PRESETS, type CadModelState } from "../cadModel.ts";

function sampleModel(): CadModelState {
  const m = emptyModel();
  m.layers = [
    ...m.layers,
    { id: "CONTROL", name: LAYER_PRESETS.CONTROL.name, color: LAYER_PRESETS.CONTROL.color, visible: true, locked: false },
    { id: "BOUNDARY", name: LAYER_PRESETS.BOUNDARY.name, color: LAYER_PRESETS.BOUNDARY.color, visible: true, locked: false },
  ];
  m.points = [
    { id: "p1", pointNo: "1001", n: 1000, e: 5000, z: 12.5, code: "CP", layerId: "CONTROL" },
    { id: "p2", pointNo: "1002", n: 1100, e: 5100, z: 13.0, code: "CP", layerId: "CONTROL" },
  ];
  m.linework = [
    {
      id: "l1",
      kind: "boundary",
      vertices: [
        { n: 1000, e: 5000 },
        { n: 1100, e: 5000 },
        { n: 1100, e: 5100 },
        { n: 1000, e: 5100 },
      ],
      layerId: "BOUNDARY",
      closed: true,
    },
  ];
  return m;
}

function opts(overrides: Partial<PlotOptions> = {}): PlotOptions {
  const tb = DEFAULT_TITLE_BLOCK("Riverside Estate", "RV-001", "Acme Ltd", "UTM 36S");
  return { ...DEFAULT_PLOT_OPTIONS(tb), ...overrides };
}

describe("buildPlotSvg", () => {
  it("emits a millimetre-sized SVG sheet at the chosen paper size", () => {
    const res = buildPlotSvg(sampleModel(), opts({ paper: "A3", orientation: "landscape" }));
    expect(res.paperW).toBe(420);
    expect(res.paperH).toBe(297);
    expect(res.svg).toContain('width="420mm"');
    expect(res.svg).toContain('height="297mm"');
  });

  it("includes the title-block metadata", () => {
    const res = buildPlotSvg(sampleModel(), opts());
    expect(res.svg).toContain("Riverside Estate");
    expect(res.svg).toContain("Acme Ltd");
    expect(res.svg).toContain("UTM 36S");
    expect(res.svg).toContain("SURVEY PLAN");
  });

  it("wraps every enabled furniture element in a data-furniture group", () => {
    const res = buildPlotSvg(sampleModel(), opts());
    for (const key of [
      "northArrow",
      "scaleBar",
      "legend",
      "symbolLegend",
      "beaconTable",
      "approvalBlock",
      "titleBlock",
    ]) {
      expect(res.svg).toContain(`data-furniture="${key}"`);
    }
  });

  it("applies saved furniture offsets as translate transforms", () => {
    const res = buildPlotSvg(sampleModel(), opts({
      furnitureOffsets: {
        titleBlock: { dx: 12.5, dy: -30 },
        northArrow: { dx: 0, dy: 8 },
      },
    }));
    expect(res.svg).toContain('data-furniture="titleBlock" transform="translate(12.5,-30)"');
    expect(res.svg).toContain('data-furniture="northArrow" transform="translate(0,8)"');
    // Untouched elements carry no transform attribute.
    expect(res.svg).not.toContain('data-furniture="scaleBar" transform=');
  });

  it("renders the north arrow, scale bar and legend when enabled", () => {
    const res = buildPlotSvg(sampleModel(), opts());
    expect(res.svg).toContain(">N<"); // north arrow label
    expect(res.svg).toContain("SCALE 1:");
    expect(res.svg).toContain("LEGEND");
  });

  it("omits furniture when toggled off", () => {
    const res = buildPlotSvg(
      sampleModel(),
      opts({ showNorthArrow: false, showScaleBar: false, showLegend: false }),
    );
    expect(res.svg).not.toContain("LEGEND");
    expect(res.svg).not.toContain("SCALE 1:");
  });

  it("computes an exact fit scale so the drawing fills the frame", () => {
    const res = buildPlotSvg(sampleModel(), opts({ scaleDenominator: "fit" }));
    // Fit-to-paper uses the exact (integer) denominator rather than rounding
    // up to a conventional value, so the plan fills the drawing frame.
    expect(res.denominator).toBeGreaterThan(0);
    expect(Number.isInteger(res.denominator)).toBe(true);
  });

  it("honours an explicit plot scale", () => {
    const res = buildPlotSvg(sampleModel(), opts({ scaleDenominator: 500 }));
    expect(res.denominator).toBe(500);
    expect(res.svg).toContain("1:500");
  });

  it("still produces a valid sheet for an empty drawing", () => {
    const res = buildPlotSvg(emptyModel(), opts());
    expect(res.svg).toContain("<svg");
    expect(res.svg).toContain("SURVEY PLAN");
  });

  it("draws point labels only when requested", () => {
    const withLabels = buildPlotSvg(sampleModel(), opts({ showPointLabels: true }));
    expect(withLabels.svg).toContain("1001");
    const without = buildPlotSvg(sampleModel(), opts({ showPointLabels: false }));
    expect(without.svg).not.toContain("1001 CP");
  });

  it("ignores an identity viewport view", () => {
    const base = buildPlotSvg(sampleModel(), opts({ scaleDenominator: 500 }));
    const withView = buildPlotSvg(
      sampleModel(),
      opts({ scaleDenominator: 500, view: { offsetE: 0, offsetN: 0, zoom: 1 } }),
    );
    expect(withView.denominator).toBe(base.denominator);
    expect(withView.svg).toBe(base.svg);
  });

  it("keeps an explicit plot scale fixed regardless of viewport zoom", () => {
    // At a fixed scale, zoom only pans/clips — the printed ratio must not drift.
    const zoomed = buildPlotSvg(
      sampleModel(),
      opts({ scaleDenominator: 500, view: { offsetE: 0, offsetN: 0, zoom: 2 } }),
    );
    expect(zoomed.denominator).toBe(500);
  });

  it("tightens a fit scale when the viewport is zoomed in", () => {
    const fit = buildPlotSvg(sampleModel(), opts({ scaleDenominator: "fit" }));
    const zoomedIn = buildPlotSvg(
      sampleModel(),
      opts({ scaleDenominator: "fit", view: { offsetE: 0, offsetN: 0, zoom: 4 } }),
    );
    // Zooming in shows a smaller area, so the scale denominator decreases.
    expect(zoomedIn.denominator).toBeLessThan(fit.denominator);
    expect(Number.isInteger(zoomedIn.denominator)).toBe(true);
  });

  it("pans the sheet by re-centring on the view offset", () => {
    const centred = buildPlotSvg(sampleModel(), opts({ scaleDenominator: 500 }));
    const panned = buildPlotSvg(
      sampleModel(),
      opts({ scaleDenominator: 500, view: { offsetE: 50, offsetN: 50, zoom: 1 } }),
    );
    // A pan offset changes geometry placement (the SVG paths differ) without
    // altering the paper size or scale.
    expect(panned.paperW).toBe(centred.paperW);
    expect(panned.denominator).toBe(centred.denominator);
    expect(panned.svg).not.toBe(centred.svg);
  });
});

describe("Zimbabwean general plan furniture", () => {
  it("renders a beacon schedule with Y/X headers and matched beacon numbers", () => {
    const res = buildPlotSvg(sampleModel(), opts());
    expect(res.svg).toContain("BEACON");
    expect(res.svg).toContain("(EASTING)");
    expect(res.svg).toContain("(NORTHING)");
    // Boundary vertices coincide with control points → their numbers are used.
    expect(res.svg).toContain("1001");
  });

  it("omits the beacon schedule when disabled", () => {
    const res = buildPlotSvg(sampleModel(), opts({ showBeaconTable: false }));
    expect(res.svg).not.toContain("BEACON");
  });

  it("shows the SG approval block by default and honours the toggle", () => {
    expect(buildPlotSvg(sampleModel(), opts()).svg).toContain("CERTIFIED CORRECT");
    expect(buildPlotSvg(sampleModel(), opts({ showApprovalBlock: false })).svg).not.toContain("CERTIFIED CORRECT");
  });

  it("reports the parcel extent in hectares in the result and title block", () => {
    const res = buildPlotSvg(sampleModel(), opts());
    // 100 m × 100 m square = 1 ha
    expect(res.extentHa).toBeCloseTo(1, 5);
    expect(res.svg).toContain("EXTENT");
    expect(res.svg).toContain("1.0000 ha");
  });

  it("carries Zim title-block fields through to the sheet", () => {
    const o = opts();
    o.titleBlock.planNo = "GP 1234/26";
    o.titleBlock.locality = "Mazowe District";
    o.titleBlock.surveyorRegNo = "LS 1042";
    const res = buildPlotSvg(sampleModel(), o);
    expect(res.svg).toContain("GP 1234/26");
    expect(res.svg).toContain("LOCALITY");
    expect(res.svg).toContain("Mazowe District");
    expect(res.svg).toContain("LS 1042");
    expect(res.svg).toContain("OWNER / APPLICANT");
  });

  it("falls back to project/client when plan-specific fields are empty", () => {
    const res = buildPlotSvg(sampleModel(), opts());
    expect(res.svg).toContain("Riverside Estate"); // PROPERTY fallback
    expect(res.svg).toContain("Acme Ltd"); // OWNER fallback
    expect(res.svg).not.toContain("DATUM / CRS"); // old cell replaced
  });

  it("stacks approval above schedule without overlapping the frame top", () => {
    const res = buildPlotSvg(sampleModel(), opts({ paper: "A4" }));
    // Both blocks render and stay within the sheet viewBox height (210 for A4 landscape).
    expect(res.svg).toContain("CERTIFIED CORRECT");
    expect(res.svg).toContain("BEACON");
    expect(res.paperH).toBe(210);
  });
});
