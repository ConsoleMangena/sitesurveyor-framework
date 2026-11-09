import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";

import {
  CATEGORY_LEGEND_CODES,
  CATEGORY_LEGEND_TITLES,
  CATEGORY_RASTER_PALETTE,
  CATEGORY_ZONE_LABELS,
  type DossierCategory,
} from "./labels.ts";
import {
  drawSurveySheets,
  SHEET,
  sheetPanelRect,
  type PanelData,
  type SheetLegendItem,
  type SheetTable,
} from "./mapExport.ts";

/** One mark on the sheet: what was drawn, and where it landed. */
interface Mark {
  text?: string;
  top: number;
  bottom: number;
}

/**
 * Records what a page draws.
 *
 * The layout rules are about what fits and what does not, so the test has to see the
 * marks rather than the finished page.
 */
function trackInk(page: PDFPage): Mark[] {
  const marks: Mark[] = [];
  const height = SHEET.heightPt;

  const originalText = page.drawText.bind(page);
  page.drawText = ((value: string, options?: Parameters<PDFPage["drawText"]>[1]) => {
    const y = options?.y;
    if (typeof y === "number") {
      const size = options?.size ?? 10;
      marks.push({ text: value, top: height - y - size, bottom: height - y });
    }
    return originalText(value, options);
  }) as PDFPage["drawText"];

  const originalLine = page.drawLine.bind(page);
  page.drawLine = ((options: Parameters<PDFPage["drawLine"]>[0]) => {
    const startY = options.start?.y;
    const endY = options.end?.y;
    if (typeof startY === "number" && typeof endY === "number") {
      marks.push({ top: height - Math.max(startY, endY), bottom: height - Math.min(startY, endY) });
    }
    return originalLine(options);
  }) as PDFPage["drawLine"];

  const originalRectangle = page.drawRectangle.bind(page);
  page.drawRectangle = ((options?: Parameters<PDFPage["drawRectangle"]>[0]) => {
    const y = options?.y;
    const boxHeight = options?.height;
    if (typeof y === "number" && typeof boxHeight === "number") {
      marks.push({
        top: height - (y + boxHeight),
        bottom: height - y,
      });
    }
    return originalRectangle(options);
  }) as PDFPage["drawRectangle"];

  const originalCircle = page.drawCircle.bind(page);
  page.drawCircle = ((options: Parameters<PDFPage["drawCircle"]>[0]) => {
    const y = options?.y;
    const size = options?.size;
    if (typeof y === "number" && typeof size === "number") {
      marks.push({
        top: height - (y + size),
        bottom: height - (y - size),
      });
    }
    return originalCircle(options);
  }) as PDFPage["drawCircle"];

  const originalPath = page.drawSvgPath.bind(page);
  page.drawSvgPath = ((path: string, options?: Parameters<PDFPage["drawSvgPath"]>[1]) => {
    const y = options?.y;
    if (typeof y === "number") marks.push({ top: height - (y + 15), bottom: height - (y - 11) });
    return originalPath(path, options);
  }) as PDFPage["drawSvgPath"];

  return marks;
}

function legendFor(category: DossierCategory): SheetLegendItem[] {
  return [
    ...CATEGORY_LEGEND_CODES[category].map((code) => ({
      kind: "zone" as const,
      color: CATEGORY_RASTER_PALETTE[category][code],
      label: CATEGORY_ZONE_LABELS[category][code],
    })),
    { kind: "station" as const, color: "#f59e0b", label: "Recommended station (depth beside each)" },
    { kind: "aoi" as const, label: "Survey area (AOI) boundary" },
    { kind: "target" as const, label: "Survey centre" },
    { kind: "imagery" as const, label: "Satellite imagery base" },
  ];
}

const MINERAL_TABLE: SheetTable = {
  title: "System ground share · • indicated",
  columns: [
    { label: "SYSTEM", width: 104 },
    { label: "AREA sq km", width: 44, align: "right" },
    { label: "SHARE %", width: 40, align: "right" },
  ],
  rows: [
    ["• Gold (Au)", "42.3", "18.4"],
    ["• Lithium (pegmatite)", "12.1", "5.3"],
    ["• Rare earth elements (REE)", "8.4", "3.7"],
    ["• Nickel and platinum-group elements", "6.2", "2.7"],
    ["Copper, zinc and lead", "3.1", "1.3"],
    ["Iron ore (Fe)", "2.4", "1.0"],
    ["Chromium (chromitite)", "1.2", "0.5"],
    ["Bauxite (aluminium laterite)", "0.6", "0.3"],
    ["Manganese (oxide / supergene)", "0.2", "0.1"],
  ],
  emphasis: [true, true, true, true, false, false, false, false, false],
};

const CATEGORY_SUMMARY: Record<DossierCategory, { label: string; value: string }[]> = {
  water: [
    { label: "SURVEY SCORE", value: "72.4 / 100 · High potential" },
    { label: "BOREHOLE TARGETS", value: "6" },
  ],
  minerals: [
    { label: "PROSPECTIVITY SCORE", value: "61.2 / 100 · Moderate" },
    { label: "DOMINANT SYSTEM", value: "Gold (Au) · 42.3 sq km · 18.4% of area" },
    { label: "SYSTEMS SCREENED", value: "4 of 9 indicated" },
  ],
  soil_land: [
    { label: "LAND CAPABILITY", value: "58.0 / 100 · Moderate capability" },
    { label: "AREA CLASSIFIED", value: "230.4 sq km" },
  ],
  hazard_safety: [
    { label: "HAZARD SCORE", value: "33.7 / 100 · Low hazard" },
    { label: "AREA CLASSIFIED", value: "230.4 sq km" },
  ],
};

function panelFor(category: DossierCategory): PanelData {
  return {
    includeHeader: true,
    title: `${category.replace("_", " ").toUpperCase()} — SITE SURVEY`,
    client: "Site Survey",
    categoryName: category.toUpperCase(),
    coords: "19.5049°S, 29.8460°E",
    coverageText: "18.4 km E-W x 18.4 km N-S",
    gridText: "WGS 84 / UTM zone 35S · X=Easting, Y=Northing (m)",
    opticalSource: "Copernicus Sentinel-2",
    imageryText: "z15 · ~4.9 m/px source · sheet ~2.4 m/px",
    scaleText: "1:48,000 (approx.) · 2.40 m/px at 240 DPI",
    scaleRatioText: "1:48,000 (approx.)",
    sheetNo: "EO-20261109-0730",
    generatedText: "Nov 9, 2026",
    waterTableText: category === "water" ? "28 m below ground" : "",
    fieldTargetText: category === "water" ? "" : "Auger · overburden 4-12 m",
    summaryRows: CATEGORY_SUMMARY[category],
    table: category === "minerals" ? MINERAL_TABLE : null,
    includeLegend: true,
    legendTitle: CATEGORY_LEGEND_TITLES[category],
    legendItems: legendFor(category),
    candidates: [
      {
        latitude: -19.52,
        longitude: 29.83,
        color: "#f59e0b",
        label: "overburden 4-12 m",
        kind: "Target",
        rank: 1,
        readout: "Auger · overburden 4-12 m",
        distanceKm: 2.3,
        score: 78,
      },
      {
        latitude: -19.48,
        longitude: 29.86,
        color: "#f59e0b",
        label: "overburden 6-14 m",
        kind: "Target",
        rank: 2,
        readout: "Auger · overburden 6-14 m",
        distanceKm: 3.8,
        score: 71,
      },
      {
        latitude: -19.53,
        longitude: 29.87,
        color: "#f59e0b",
        label: "overburden 3-9 m",
        kind: "Target",
        rank: 3,
        readout: "Auger · overburden 3-9 m",
        distanceKm: 5.1,
        score: 66,
      },
    ],
    scheduleOnPanel: false,
    keyOnPanel: false,
    includeScaleBar: true,
    scaleBarMeters: 5000,
    scaleBarWidthPt: 84,
    includeNorthArrow: true,
    footerText:
      "Confidential & proprietary. Generated by SiteSurveyor on Nov 9, 2026. Imagery © Esri, Earthstar Geographics.",
    logo: null,
  };
}

async function render(category: DossierCategory) {
  const pdf = await PDFDocument.create();
  const tracks = new Map<number, Mark[]>();
  const originalAddPage = pdf.addPage.bind(pdf);
  pdf.addPage = ((size?: [number, number]) => {
    const page = originalAddPage(size);
    tracks.set(pdf.getPageCount() - 1, trackInk(page));
    return page;
  }) as PDFDocument["addPage"];

  const page = pdf.addPage([SHEET.widthPt, SHEET.heightPt]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const data = panelFor(category);

  drawSurveySheets(pdf, { page, font, bold }, sheetPanelRect("right"), data);

  return { pdf, data, marks: tracks.get(0) ?? [], secondMarks: tracks.get(1) ?? [] };
}

const CATEGORIES: DossierCategory[] = ["water", "minerals", "soil_land", "hazard_safety"];

describe("survey sheet layout", () => {
  for (const category of CATEGORIES) {
    it(`keeps every mark of the ${category} sheet inside the panel`, async () => {
      const { marks } = await render(category);
      const rect = sheetPanelRect("right");
      expect(marks.length).toBeGreaterThan(0);
      for (const mark of marks) {
        expect(mark.top).toBeGreaterThanOrEqual(rect.y - 0.01);
        expect(mark.bottom).toBeLessThanOrEqual(rect.y + rect.h + 0.01);
        expect(mark.top).toBeGreaterThanOrEqual(0);
        expect(mark.bottom).toBeLessThanOrEqual(SHEET.heightPt);
      }
    });

    it(`never drops the key or the schedule for ${category}`, async () => {
      const { pdf, data, marks, secondMarks } = await render(category);
      const keyTitle = CATEGORY_LEGEND_TITLES[category].toUpperCase();
      const onPanel = marks.some((mark) => mark.text === keyTitle);
      const onSecond = secondMarks.some((mark) => mark.text === keyTitle);

      // The key prints whole on one sheet or the other, never cut and never missing.
      expect(onPanel || onSecond).toBe(true);
      expect(data.keyOnPanel).toBe(onPanel);

      // The stations a crew works from print on one sheet or the other too.
      const scheduleOnPanel = marks.some((mark) => mark.text === "RECOMMENDED TARGETS");
      const scheduleOnSecond = secondMarks.some(
        (mark) => mark.text === "RECOMMENDED TARGETS",
      );
      expect(scheduleOnPanel || scheduleOnSecond).toBe(true);
      expect(data.scheduleOnPanel).toBe(scheduleOnPanel);

      // One sheet, or the sheet behind it — never a third.
      expect(pdf.getPageCount()).toBeLessThanOrEqual(2);
    });
  }

  it("moves the mineral key to the sheet behind, where it fits whole", async () => {
    const { data, marks, secondMarks } = await render("minerals");
    const keyTitle = CATEGORY_LEGEND_TITLES.minerals.toUpperCase();
    expect(marks.some((mark) => mark.text === keyTitle)).toBe(false);
    expect(secondMarks.some((mark) => mark.text === keyTitle)).toBe(true);
    expect(data.keyOnPanel).toBe(false);
  });

  it("prints the mineral system's own table of figures on the map sheet", async () => {
    const { marks } = await render("minerals");
    const texts = marks.map((mark) => mark.text).filter((text): text is string => text !== undefined);
    expect(texts).toContain("SYSTEM GROUND SHARE · • INDICATED");
    expect(texts).toContain("• Gold (Au)");
    expect(texts).toContain("42.3");
    expect(texts).toContain("18.4");
  });

  it("keeps the sheet's own furniture on the map sheet", async () => {
    const { marks } = await render("water");
    const texts = marks.map((mark) => mark.text).filter((text): text is string => text !== undefined);
    expect(texts).toContain("SCALE BAR");
    expect(texts).toContain("GRID NORTH");
    expect(texts).toContain("SITESURVEYOR™");
  });

  it("keeps the stations on the map sheet when the key leaves room for them", async () => {
    for (const category of ["water", "soil_land", "hazard_safety"] as DossierCategory[]) {
      const { pdf, data, marks } = await render(category);
      expect(marks.some((mark) => mark.text === "RECOMMENDED TARGETS")).toBe(true);
      expect(data.scheduleOnPanel).toBe(true);
      expect(pdf.getPageCount()).toBe(1);
    }
  });

  it("names the survey domain in words, not in the platform's key", async () => {
    const { marks } = await render("hazard_safety");
    const texts = marks.map((mark) => mark.text).filter((text): text is string => text !== undefined);
    expect(texts).toContain("HAZARD & SAFETY");
    expect(texts.some((text) => text.includes("_"))).toBe(false);
  });

  it("carries the survey record on the sheet behind the map", async () => {
    const { secondMarks } = await render("minerals");
    const texts = secondMarks.map((mark) => mark.text).filter((text): text is string => text !== undefined);
    expect(texts).toContain("SURVEY SUMMARY");
    expect(texts).toContain("SURVEY REFERENCE");
    expect(texts).toContain("RECOMMENDED TARGETS");
    expect(texts).toContain("61.2 / 100 · Moderate");
  });
});
