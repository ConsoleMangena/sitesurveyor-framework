import { describe, expect, it } from "vitest";
import {
  AI_SURVEY_CONTEXT_KEY,
  clearAiSurveyContext,
  readAiSurveyContext,
  writeAiSurveyContext,
} from "./surveyHandover.ts";

function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe("survey handover", () => {
  it("round-trips the run the workbench handed over", () => {
    const storage = memoryStorage();
    writeAiSurveyContext(storage, { runId: "run-1", label: "Gweru South claim" });

    expect(readAiSurveyContext(storage)).toEqual({
      runId: "run-1",
      label: "Gweru South claim",
    });

    clearAiSurveyContext(storage);
    expect(readAiSurveyContext(storage)).toBeNull();
  });

  it("reads nothing when no handover happened", () => {
    expect(readAiSurveyContext(memoryStorage())).toBeNull();
  });

  it("survives a malformed or run-less payload", () => {
    const storage = memoryStorage();
    storage.setItem(AI_SURVEY_CONTEXT_KEY, "{not json");
    expect(readAiSurveyContext(storage)).toBeNull();

    storage.setItem(AI_SURVEY_CONTEXT_KEY, JSON.stringify({ label: "No run" }));
    expect(readAiSurveyContext(storage)).toBeNull();

    storage.setItem(AI_SURVEY_CONTEXT_KEY, JSON.stringify({ runId: "  " }));
    expect(readAiSurveyContext(storage)).toBeNull();
  });

  it("falls back to a plain label when the job name is missing", () => {
    const storage = memoryStorage();
    storage.setItem(AI_SURVEY_CONTEXT_KEY, JSON.stringify({ runId: "run-2" }));
    expect(readAiSurveyContext(storage)).toEqual({
      runId: "run-2",
      label: "Satellite survey",
    });
  });

  it("never traps the caller when storage is unavailable", () => {
    const blocked = {
      getItem: () => {
        throw new Error("private mode");
      },
      setItem: () => {
        throw new Error("private mode");
      },
      removeItem: () => {
        throw new Error("private mode");
      },
    };
    expect(readAiSurveyContext(blocked)).toBeNull();
    expect(() =>
      writeAiSurveyContext(blocked, { runId: "run-3", label: "Site" }),
    ).not.toThrow();
    expect(() => clearAiSurveyContext(blocked)).not.toThrow();
  });
});