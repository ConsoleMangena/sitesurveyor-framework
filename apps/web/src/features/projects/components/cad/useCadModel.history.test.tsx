import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCadModel } from "./useCadModel";
import { emptyModel } from "./cadModel";

// jsdom must never hit the network: the backend repository calls are stubbed
// out and the hook treats their failures as offline-tolerant errors.
vi.mock("../../../../lib/repositories/cadDrawings.ts", () => ({
  getCadDrawing: vi.fn(async () => null),
  saveCadDrawing: vi.fn(async () => undefined),
}));

describe("useCadModel history (characterization)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("navigator", { ...navigator, onLine: true });
    // Backend repo calls fail fast in tests; the hook treats them as offline-tolerant errors.
  });
  afterEach(() => vi.unstubAllGlobals());

  function setup() {
    return renderHook(() => useCadModel("proj-history"));
  }

  it("single addPoint = one undo step; redo restores", () => {
    const { result } = setup();
    let added: { id: string };
    act(() => {
      added = result.current.addPoint({ pointNo: "1", n: 0, e: 0, z: null, code: "" });
    });
    expect(result.current.canUndo).toBe(true);
    act(() => {
      expect(result.current.undo()).toBe(true);
    });
    expect(result.current.model.points).toHaveLength(0);
    expect(result.current.canRedo).toBe(true);
    act(() => {
      expect(result.current.redo()).toBe(true);
    });
    expect(result.current.model.points.map((p) => p.id)).toEqual([added!.id]);
  });

  it("transaction collapses multiple commits into ONE undo step", () => {
    const { result } = setup();
    act(() => {
      result.current.beginTransaction();
      result.current.addPoint({ pointNo: "1", n: 0, e: 0, z: null, code: "" });
      result.current.addPoint({ pointNo: "2", n: 1, e: 1, z: null, code: "" });
      result.current.endTransaction();
    });
    act(() => {
      result.current.undo();
    });
    expect(result.current.model.points).toHaveLength(0);
  });

  it("discardTransaction restores the base model and drops its history entry", () => {
    const { result } = setup();
    act(() => {
      result.current.beginTransaction();
      result.current.addPoint({ pointNo: "1", n: 5, e: 5, z: null, code: "" });
      result.current.discardTransaction();
    });
    expect(result.current.model.points).toHaveLength(0);
    expect(result.current.canUndo).toBe(false);
  });

  it("HISTORY_LIMIT caps at 100 entries (101st edit evicts the oldest)", () => {
    const { result } = setup();
    act(() => {
      for (let i = 0; i < 101; i++) {
        result.current.addPoint({ pointNo: String(i), n: i, e: i, z: null, code: "" });
      }
    });
    // Undo all the way: exactly 100 steps available.
    let steps = 0;
    act(() => {
      while (result.current.undo()) steps += 1;
    });
    expect(steps).toBe(100);
    expect(result.current.model.points).toHaveLength(1); // the first point remains
  });

  it("undo past the start returns false and keeps the model intact", () => {
    const { result } = setup();
    act(() => {
      result.current.addPoint({ pointNo: "1", n: 0, e: 0, z: null, code: "" });
    });
    const snapshot = result.current.model;
    act(() => {
      expect(result.current.undo()).toBe(true);
      expect(result.current.undo()).toBe(false);
    });
    expect(result.current.model.points).toHaveLength(0);
    expect(snapshot.points).toHaveLength(1);
  });

  it("cache write is debounced at ~600ms", () => {
    vi.useFakeTimers(); // BEFORE mount so the mount-time timer is also fake
    try {
      localStorage.setItem(
        "sitesurveyorCad:proj-cache",
        JSON.stringify(emptyModel()),
      );
      const { result } = renderHook(() => useCadModel("proj-cache"));
      act(() => {
        vi.advanceTimersByTime(700); // let any mount-time debounce settle
      });
      act(() => {
        result.current.addPoint({ pointNo: "9", n: 2, e: 2, z: null, code: "" });
      });
      // Not yet flushed.
      expect(localStorage.getItem("sitesurveyorCad:proj-cache")).not.toContain('"pointNo":"9"');
      act(() => {
        vi.advanceTimersByTime(700);
      });
      expect(localStorage.getItem("sitesurveyorCad:proj-cache")).toContain('"pointNo":"9"');
    } finally {
      vi.useRealTimers();
    }
  });
});
