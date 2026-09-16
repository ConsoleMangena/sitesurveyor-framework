import { describe, expect, it, vi } from "vitest";
import type { CadSelection, SurveyLinework, SurveySurface } from "../cadModel.ts";
import { runExtractProfile } from "./profileWorkflow";
import { fakeApi, fakeModel, fakeServices } from "./testHarness";

/** Slab at constant z=10, generously covering the section line so every sample lands inside the TIN. */
function tinSurface(): SurveySurface {
  return {
    id: "sf-slab",
    name: "Existing",
    layerId: "TOPO",
    visible: true,
    points: [
      { n: -10, e: -10, z: 10 },
      { n: -10, e: 40, z: 10 },
      { n: 30, e: 40, z: 10 },
      { n: 30, e: -10, z: 10 },
    ],
    triangles: [
      { a: 0, b: 1, c: 2 },
      { a: 0, b: 2, c: 3 },
    ],
  };
}

function sectionLinework(vertices: { n: number; e: number }[]): SurveyLinework {
  return {
    id: "lw-section",
    kind: "polyline",
    vertices,
    closed: false,
    layerId: "LINEWORK",
  };
}

describe("runExtractProfile", () => {
  it("samples chainage/level along the selected polyline, downloads CSV and opens the chart report", async () => {
    const lw = sectionLinework([{ n: 0, e: 0 }, { n: 0, e: 30 }]);
    const model = fakeModel({ surfaces: [tinSurface()], linework: [lw] });
    const selection: CadSelection = {
      type: "linework",
      id: lw.id,
      items: [{ type: "linework", id: lw.id }],
    };
    const { api } = fakeApi(model);
    const { services, log } = fakeServices({
      prompt: async (_msg, def) => def ?? "1",
    });
    await runExtractProfile(model, selection, api, services);

    const openReport = vi.mocked(services.openReport);
    expect(openReport).toHaveBeenCalledTimes(1);
    const [reportTitle] = openReport.mock.calls[0];
    expect(String(reportTitle)).toBe('Long Section — "Existing"');

    const downloadCsv = vi.mocked(services.downloadCsv);
    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [filename, rows] = downloadCsv.mock.calls[0];
    expect(filename).toBe("long-section.csv");
    expect(rows[0]).toEqual(["Chainage", "RL"]);
    const chainages = rows.slice(1).map((r) => Number(r[0]));
    // Chain length 30 m ⇒ default interval max(1, round(30/60)) = 1 m.
    expect(chainages).toHaveLength(31);
    expect(chainages[0]).toBe(0);
    expect(chainages[chainages.length - 1]).toBe(30);
    for (let i = 0; i < chainages.length; i++) {
      expect(chainages[i]).toBeCloseTo(i, 6);
    }
    for (const r of rows.slice(1)) {
      expect(Number(r[1])).toBeCloseTo(10, 6);
    }

    // The archived copy matches the downloaded CSV byte-for-byte and keeps
    // the dbId-suffixed file name.
    expect(services.addOutput).toHaveBeenCalledWith({
      label: "Long Section (Chainage/Level)",
      description: "31 stations, interval 1 m",
      fileName: "long-section-db-test-project.csv",
      mimeType: "text/csv",
      content: rows.map((r) => r.join(",")).join("\n"),
    });

    const logText = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logText).toContain("Long section:");
  });

  it("errors when nothing is selected", async () => {
    const model = fakeModel({ surfaces: [tinSurface()] });
    const { api } = fakeApi(model);
    const { services, log } = fakeServices();
    await runExtractProfile(model, { type: null, id: null, items: [] }, api, services);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("select a polyline"),
      "error",
    );
    expect(services.openReport).not.toHaveBeenCalled();
    expect(services.downloadCsv).not.toHaveBeenCalled();
  });

  it("errors when the model has no TIN surface yet", async () => {
    const lw = sectionLinework([{ n: 0, e: 0 }, { n: 0, e: 30 }]);
    const model = fakeModel({ linework: [lw] });
    const selection: CadSelection = {
      type: "linework",
      id: lw.id,
      items: [{ type: "linework", id: lw.id }],
    };
    const { api } = fakeApi(model);
    const { services, log } = fakeServices();
    await runExtractProfile(model, selection, api, services);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("build a TIN"),
      "error",
    );
    expect(services.openReport).not.toHaveBeenCalled();
  });
});
