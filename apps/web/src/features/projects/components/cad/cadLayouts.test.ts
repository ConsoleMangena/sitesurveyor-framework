import { describe, it, expect } from "vitest";
import {
  MODEL_TAB,
  addLayout,
  defaultLayoutsState,
  deleteLayout,
  duplicateLayout,
  getLayout,
  normalizeLayoutsState,
  renameLayout,
  setLayoutOptions,
} from "./cadLayouts.ts";
import { DEFAULT_TITLE_BLOCK } from "./io/plot.ts";

const seed = () => DEFAULT_TITLE_BLOCK("Riverside", "RV-001", "Acme", "UTM 36S");

describe("cadLayouts", () => {
  it("ships two default layouts on the Model tab", () => {
    const s = defaultLayoutsState(seed());
    expect(s.layouts).toHaveLength(2);
    expect(s.layouts.map((l) => l.name)).toEqual(["Layout1", "Layout2"]);
    expect(s.active).toBe(MODEL_TAB);
  });

  it("seeds layout title blocks from project metadata", () => {
    const s = defaultLayoutsState(seed());
    expect(s.layouts[0].options.titleBlock.projectName).toBe("Riverside");
    expect(s.layouts[0].options.titleBlock.datum).toBe("UTM 36S");
  });

  it("keeps saved furniture offsets through normalization of old layouts", () => {
    const stored = {
      active: "lay1",
      layouts: [
        {
          id: "lay1",
          name: "Layout1",
          options: {
            paper: "A4",
            titleBlock: { drawingTitle: "Old sheet" },
            furnitureOffsets: { titleBlock: { dx: 10, dy: -20 } },
          },
        },
      ],
    };
    const s = normalizeLayoutsState(
      stored as unknown as Parameters<typeof normalizeLayoutsState>[0],
      seed(),
    );
    expect(s.layouts[0].options.furnitureOffsets?.titleBlock).toEqual({ dx: 10, dy: -20 });
  });

  it("adds a uniquely named layout and makes it active", () => {
    const s0 = defaultLayoutsState(seed());
    const s1 = addLayout(s0, seed());
    expect(s1.layouts).toHaveLength(3);
    expect(s1.layouts[2].name).toBe("Layout3");
    expect(s1.active).toBe(s1.layouts[2].id);
  });

  it("duplicates a layout right after the source and selects the copy", () => {
    const s0 = defaultLayoutsState(seed());
    const srcId = s0.layouts[0].id;
    const s1 = duplicateLayout(s0, srcId);
    expect(s1.layouts).toHaveLength(3);
    expect(s1.layouts[1].name).toBe("Layout1 (copy)");
    expect(s1.active).toBe(s1.layouts[1].id);
  });

  it("renames a layout, ignoring blank names", () => {
    const s0 = defaultLayoutsState(seed());
    const id = s0.layouts[0].id;
    expect(renameLayout(s0, id, "Site Plan").layouts[0].name).toBe("Site Plan");
    expect(renameLayout(s0, id, "   ").layouts[0].name).toBe("Layout1");
  });

  it("deletes a layout and falls back to Model when the active one is removed", () => {
    const s0 = { ...defaultLayoutsState(seed()), active: defaultLayoutsState(seed()).layouts[0].id };
    const active = s0.layouts[0].id;
    const s1 = deleteLayout({ ...s0, active }, active);
    expect(s1.layouts).toHaveLength(1);
    expect(s1.active).toBe(MODEL_TAB);
  });

  it("never deletes the last remaining layout", () => {
    let s = defaultLayoutsState(seed());
    s = deleteLayout(s, s.layouts[0].id);
    const onlyId = s.layouts[0].id;
    const after = deleteLayout(s, onlyId);
    expect(after.layouts).toHaveLength(1);
  });

  it("persists edited plot options for a layout", () => {
    const s0 = defaultLayoutsState(seed());
    const id = s0.layouts[0].id;
    const opts = { ...s0.layouts[0].options, paper: "A1" as const, scaleDenominator: 500 as const };
    const s1 = setLayoutOptions(s0, id, opts);
    expect(getLayout(s1, id)?.options.paper).toBe("A1");
    expect(getLayout(s1, id)?.options.scaleDenominator).toBe(500);
  });

  it("normalizes malformed stored state back to defaults", () => {
    expect(normalizeLayoutsState(null, seed()).layouts).toHaveLength(2);
    expect(normalizeLayoutsState({ layouts: [] }, seed()).layouts).toHaveLength(2);
  });

  it("merges stored options over current defaults and keeps a valid active tab", () => {
    const stored = {
      layouts: [{ id: "x1", name: "Custom", options: { paper: "A0" } }],
      active: "missing-id",
    };
    // @ts-expect-error — exercising the tolerant normalizer with a partial shape.
    const s = normalizeLayoutsState(stored, seed());
    expect(s.layouts[0].name).toBe("Custom");
    expect(s.layouts[0].options.paper).toBe("A0");
    // Falls back to Model because the stored active id no longer exists.
    expect(s.active).toBe(MODEL_TAB);
  });
});
