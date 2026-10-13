import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyModel } from "../cadModel";
import {
  CACHE_DEBOUNCE_MS, SAVE_DEBOUNCE_MS, loadCachedModel, normalizeModel, CadPersistenceScheduler, LoadGeneration,
} from "./cadPersistence";

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe("cadPersistence cache", () => {
  it("round-trips a model through localStorage and tolerates corrupt JSON", () => {
    localStorage.setItem("sitesurveyorCad:p1", JSON.stringify({ points: [{ id: "x" }] }));
    expect(loadCachedModel("p1").points).toHaveLength(1);
    localStorage.setItem("sitesurveyorCad:p1", "{not json");
    expect(loadCachedModel("p1")).toEqual(emptyModel());
  });
  it("normalizeModel fills missing collections and defaults", () => {
    const m = normalizeModel({});
    expect(m.layers).toEqual(emptyModel().layers);
    expect(m.activeLayerId).toBe("0");
  });
});

describe("LoadGeneration", () => {
  it("next() increments and only the freshest generation is current", () => {
    const g = new LoadGeneration();
    const first = g.next();
    expect(g.isCurrent(first)).toBe(true);
    expect(g.isCurrent(first - 1)).toBe(false);
    const second = g.next();
    expect(second).toBe(first + 1);
    expect(g.isCurrent(first)).toBe(false);
    expect(g.isCurrent(second)).toBe(true);
  });
});

describe("CadPersistenceScheduler", () => {
  function makeDeps() {
    return {
      projectId: "p",
      getCachedModel: () => ({ ...emptyModel() }),
      hydrated: () => true,
      online: () => true,
      save: vi.fn(async () => undefined),
    };
  }

  it("flush writes the cache immediately and saves only a PENDING save", async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    const s = new CadPersistenceScheduler(deps);
    await s.flush(); // nothing pending
    expect(deps.save).not.toHaveBeenCalled();

    s.onModelChange();
    await s.flush(); // cache write + pending save fire now
    expect(JSON.parse(localStorage.getItem("sitesurveyorCad:p")!)).toEqual(emptyModel());
    expect(deps.save).toHaveBeenCalledTimes(1);
    s.dispose();
  });

  it("save timer fires at SAVE_DEBOUNCE_MS after onModelChange", async () => {
    vi.useFakeTimers();
    const deps = makeDeps();
    const s = new CadPersistenceScheduler(deps);
    s.onModelChange();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 1);
    expect(deps.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.save).toHaveBeenCalledTimes(1);
    s.dispose();
  });

  it("skips scheduling save when not hydrated or offline", async () => {
    vi.useFakeTimers();
    const deps = { ...makeDeps(), hydrated: () => false, online: () => false };
    const s = new CadPersistenceScheduler(deps);
    s.onModelChange();
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS + CACHE_DEBOUNCE_MS + 10_000);
    expect(deps.save).not.toHaveBeenCalled();
    s.dispose();
  });
});
