import { describe, it, expect, vi } from "vitest";
import {
  executeAiCadCommands,
  extractCadBlocks,
  parseCadCommands,
} from "./cadAiExecutor.ts";
import type { UseCadModel } from "./useCadModel.ts";

function mockCad() {
  const deletable = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `e${i}`, layerId: "L1" }));
  return {
    model: {
      layers: [{ id: "L1", name: "Project Coordinates", color: "#000000", visible: true, locked: false }],
      points: deletable(3),
      linework: [],
      texts: [],
      circles: [],
      arcs: [],
      ellipses: [],
      hatches: [],
      dimensions: [],
      surfaces: [],
    },
    selection: {} as never,
    addPoint: vi.fn((p: Record<string, unknown>) => ({ id: "pt-id", layerId: "0", ...p })),
    addLinework: vi.fn((l: Record<string, unknown>) => ({ id: "lw-id", layerId: "0", ...l })),
    addText: vi.fn((t: Record<string, unknown>) => ({ id: "tx-id", layerId: "0", ...t })),
    addCircle: vi.fn((c: Record<string, unknown>) => ({ id: "ci-id", layerId: "0", ...c })),
    addArc: vi.fn((a: Record<string, unknown>) => ({ id: "ar-id", layerId: "0", ...a })),
    addLayer: vi.fn((name: string, color?: string) => ({
      id: name,
      name,
      color: color ?? "#ffffff",
      visible: true,
      locked: false,
    })),
    ensureLayerById: vi.fn((id: string) => ({ id, name: id, color: "#ffffff", visible: true, locked: false })),
    nextPointNo: vi.fn(() => "1001"),
    beginTransaction: vi.fn(),
    endTransaction: vi.fn(),
    clearAll: vi.fn(),
    deletePoint: vi.fn(),
    deleteLinework: vi.fn(),
    deleteText: vi.fn(),
    deleteCircle: vi.fn(),
    deleteArc: vi.fn(),
    deleteEllipse: vi.fn(),
    deleteHatch: vi.fn(),
    deleteDimension: vi.fn(),
    deleteSurface: vi.fn(),
  };
}

describe("extractCadBlocks", () => {
  it("extracts a single block body trimmed", () => {
    const out = extractCadBlocks("before\n[CAD]\n  POINT 1 2\n[/CAD]\nafter");
    expect(out).toEqual(["POINT 1 2"]);
  });

  it("extracts multiple blocks in order", () => {
    const out = extractCadBlocks("[CAD]POINT 1 2[/CAD] middle [CAD]LINE 0,0 1,1[/CAD]");
    expect(out).toEqual(["POINT 1 2", "LINE 0,0 1,1"]);
  });

  it("returns an empty array when there are no blocks", () => {
    expect(extractCadBlocks("no cad here")).toEqual([]);
  });

  it("matches case-insensitive tags", () => {
    const out = extractCadBlocks("[cad]\nZOOM EXTENTS\n[/cad]");
    expect(out).toEqual(["ZOOM EXTENTS"]);
  });
});

describe("parseCadCommands", () => {
  it("splits lines and trims whitespace", () => {
    expect(parseCadCommands("  POINT 1 2  \n\n  LINE 0,0 1,1")).toEqual([
      "POINT 1 2",
      "LINE 0,0 1,1",
    ]);
  });

  it("drops blank lines and # comments", () => {
    const out = parseCadCommands("# a comment\n\n   \nPOINT 1 2\n   # indented comment\n");
    expect(out).toEqual(["POINT 1 2"]);
  });
});

describe("executeAiCadCommands", () => {
  it("adds a point with full params", () => {
    const cad = mockCad();
    const results = executeAiCadCommands(
      "POINT 501234.5 2845678.25 1250 code=CP1 layer=CONTROL",
      cad as unknown as UseCadModel,
    );
    expect(cad.addPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        pointNo: "1001",
        n: 501234.5,
        e: 2845678.25,
        z: 1250,
        code: "CP1",
        layerId: "CONTROL",
      }),
    );
    expect(cad.nextPointNo).toHaveBeenCalledOnce();
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
  });

  it("defaults z to null and code to empty string", () => {
    const cad = mockCad();
    executeAiCadCommands("POINT 10 20", cad as unknown as UseCadModel);
    expect(cad.addPoint).toHaveBeenCalledWith(
      expect.objectContaining({ n: 10, e: 20, z: null, code: "" }),
    );
  });

  it("creates a line from two vertices", () => {
    const cad = mockCad();
    executeAiCadCommands("LINE 100,200 300,400", cad as unknown as UseCadModel);
    expect(cad.addLinework).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "line",
        closed: false,
        vertices: [
          { n: 100, e: 200 },
          { n: 300, e: 400 },
        ],
      }),
    );
  });

  it("creates a boundary when closed flag given", () => {
    const cad = mockCad();
    executeAiCadCommands(
      "LINE 0,0 10,0 10,10 closed layer=BOUNDARY",
      cad as unknown as UseCadModel,
    );
    expect(cad.ensureLayerById).toHaveBeenCalledWith("BOUNDARY");
    expect(cad.addLinework).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "boundary",
        closed: true,
        layerId: "BOUNDARY",
      }),
    );
  });

  it("rejects linework with fewer than 2 vertices", () => {
    const cad = mockCad();
    const results = executeAiCadCommands("LINE 1,2", cad as unknown as UseCadModel);
    expect(results[0].ok).toBe(false);
    expect(results[0].detail).toContain("at least 2");
    expect(cad.addLinework).not.toHaveBeenCalled();
  });

  it("adds text with quoted content and params", () => {
    const cad = mockCad();
    executeAiCadCommands('TEXT 500 600 "Boundary Marker" h=2.5 rot=45', cad as unknown as UseCadModel);
    expect(cad.addText).toHaveBeenCalledWith(
      expect.objectContaining({
        n: 500,
        e: 600,
        text: "Boundary Marker",
        height: 2.5,
        rotation: 45,
      }),
    );
  });

  it("rejects text without quoted content", () => {
    const cad = mockCad();
    const results = executeAiCadCommands("TEXT 500 600 no quotes", cad as unknown as UseCadModel);
    expect(results[0].ok).toBe(false);
    expect(results[0].detail).toContain('"content"');
    expect(cad.addText).not.toHaveBeenCalled();
  });

  it("adds a circle with a positive radius and rejects invalid radii", () => {
    const cad = mockCad();
    executeAiCadCommands("CIRCLE 10,20 5.5", cad as unknown as UseCadModel);
    expect(cad.addCircle).toHaveBeenCalledWith(
      expect.objectContaining({ center: { n: 10, e: 20 }, radius: 5.5 }),
    );

    for (const bad of ["CIRCLE 10,20 0", "CIRCLE 10,20 abc"]) {
      const res = executeAiCadCommands(bad, cad as unknown as UseCadModel);
      expect(res[res.length - 1].ok).toBe(false);
    }
  });

  it("adds an arc with angles in degrees", () => {
    const cad = mockCad();
    executeAiCadCommands("ARC 0,0 25 30 120 layer=CULVERTS", cad as unknown as UseCadModel);
    expect(cad.addArc).toHaveBeenCalledWith(
      expect.objectContaining({
        center: { n: 0, e: 0 },
        radius: 25,
        startAngle: 30,
        endAngle: 120,
        layerId: "CULVERTS",
      }),
    );
  });

  it("creates a layer with name and colour", () => {
    const cad = mockCad();
    const results = executeAiCadCommands(
      "LAYER CREATE SETOUT color=#00ff00",
      cad as unknown as UseCadModel,
    );
    expect(cad.addLayer).toHaveBeenCalledWith("SETOUT", "#00ff00");
    expect(results[0].ok).toBe(true);
  });

  it("reports zoom requests without touching the model", () => {
    const cad = mockCad();
    const results = executeAiCadCommands("ZOOM E", cad as unknown as UseCadModel);
    expect(results[0].ok).toBe(true);
    expect(results[0].detail).toMatch(/zoom/i);
    expect(cad.addPoint).not.toHaveBeenCalled();
  });

  it("rejects unknown commands", () => {
    const cad = mockCad();
    const results = executeAiCadCommands("FROBNICATE 1 2", cad as unknown as UseCadModel);
    expect(results[0].ok).toBe(false);
    expect(results[0].detail).toBe("Unknown command: FROBNICATE");
  });

  it("wraps the whole batch in one transaction", () => {
    const cad = mockCad();
    executeAiCadCommands("POINT 1 2\nPOINT 3 4", cad as unknown as UseCadModel);
    expect(cad.beginTransaction).toHaveBeenCalledOnce();
    expect(cad.endTransaction).toHaveBeenCalledOnce();
  });

  it("keeps executing good commands after a bad one", () => {
    const cad = mockCad();
    const results = executeAiCadCommands(
      "TOTALLY BOGUS\nPOINT 5 6",
      cad as unknown as UseCadModel,
    );
    expect(results).toHaveLength(2);
    expect(results[0].ok).toBe(false);
    expect(results[1].ok).toBe(true);
    expect(cad.addPoint).toHaveBeenCalledWith(expect.objectContaining({ n: 5, e: 6 }));
  });

  it("accepts mixed-case verbs", () => {
    const cad = mockCad();
    const results = executeAiCadCommands("point 1 2", cad as unknown as UseCadModel);
    expect(results[0].ok).toBe(true);
    expect(cad.addPoint).toHaveBeenCalledWith(expect.objectContaining({ n: 1, e: 2 }));
  });
});

describe("ERASE commands", () => {
  it("ERASE ALL clears the drawing and reports the count", () => {
    const cad = mockCad();
    const results = executeAiCadCommands("ERASE ALL", cad as unknown as UseCadModel);
    expect(results[0].ok).toBe(true);
    expect(cad.clearAll).toHaveBeenCalledOnce();
    expect(results[0].detail).toContain("3 entities");
  });

  it("ERASE LAYER matches by name (case-insensitive) and deletes per type", () => {
    const cad = mockCad();
    const results = executeAiCadCommands(
      "ERASE LAYER project coordinates",
      cad as unknown as UseCadModel,
    );
    expect(results[0].ok).toBe(true);
    expect(cad.deletePoint).toHaveBeenCalledTimes(3);
    expect(results[0].detail).toContain('layer "Project Coordinates"');
  });

  it("ERASE LAYER matches by id too", () => {
    const cad = mockCad();
    const results = executeAiCadCommands("ERASE LAYER L1", cad as unknown as UseCadModel);
    expect(results[0].ok).toBe(true);
    expect(cad.deletePoint).toHaveBeenCalledTimes(3);
  });

  it("ERASE LAYER with an unknown layer fails without deleting", () => {
    const cad = mockCad();
    const results = executeAiCadCommands("ERASE LAYER NOPE", cad as unknown as UseCadModel);
    expect(results[0].ok).toBe(false);
    expect(cad.deletePoint).not.toHaveBeenCalled();
  });

  it("ERASE TYPE point deletes only that entity kind", () => {
    const cad = mockCad();
    const results = executeAiCadCommands("ERASE TYPE point", cad as unknown as UseCadModel);
    expect(results[0].ok).toBe(true);
    expect(cad.deletePoint).toHaveBeenCalledTimes(3);
    expect(cad.deleteLinework).not.toHaveBeenCalled();
  });

  it("ERASE TYPE accepts plurals and rejects unknown types", () => {
    const cad = mockCad();
    expect(executeAiCadCommands("ERASE TYPE points", cad as unknown as UseCadModel)[0].ok).toBe(true);
    const bad = executeAiCadCommands("ERASE TYPE vehicle", cad as unknown as UseCadModel);
    expect(bad[0].ok).toBe(false);
  });

  it("DELETE is accepted as an alias of ERASE; bare ERASE fails cleanly", () => {
    const cad = mockCad();
    expect(executeAiCadCommands("DELETE ALL", cad as unknown as UseCadModel)[0].ok).toBe(true);
    const bare = executeAiCadCommands("ERASE", cad as unknown as UseCadModel);
    expect(bare[0].ok).toBe(false);
    expect(bare[0].detail).toContain("ERASE expects");
  });

  it("an erase batch still runs in one undoable transaction", () => {
    const cad = mockCad();
    executeAiCadCommands("ERASE ALL", cad as unknown as UseCadModel);
    expect(cad.beginTransaction).toHaveBeenCalledOnce();
    expect(cad.endTransaction).toHaveBeenCalledOnce();
  });
});
