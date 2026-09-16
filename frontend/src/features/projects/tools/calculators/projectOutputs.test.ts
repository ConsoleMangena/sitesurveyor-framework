import { describe, it, expect, beforeEach } from "vitest";
import {
  loadProjectOutputs,
  addProjectOutput,
  deleteProjectOutput,
  toOutputBlob,
} from "./projectOutputs.ts";

const PID = "test-outputs-project";

describe("projectOutputs store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts empty", () => {
    expect(loadProjectOutputs(PID)).toEqual([]);
  });

  it("adds and lists outputs", () => {
    addProjectOutput(PID, {
      label: "Points CSV",
      fileName: "points.csv",
      mimeType: "text/csv",
      content: "a,b\n1,2",
    });
    const outputs = loadProjectOutputs(PID);
    expect(outputs).toHaveLength(1);
    expect(outputs[0].label).toBe("Points CSV");
    expect(outputs[0].size).toBeGreaterThan(0);
  });

  it("deletes an output by id", () => {
    const o = addProjectOutput(PID, {
      label: "Temp",
      fileName: "temp.csv",
      mimeType: "text/csv",
      content: "x",
    });
    expect(loadProjectOutputs(PID)).toHaveLength(1);
    expect(deleteProjectOutput(PID, o.id)).toBe(true);
    expect(loadProjectOutputs(PID)).toHaveLength(0);
  });

  it("returns false when deleting unknown id", () => {
    expect(deleteProjectOutput(PID, "nope")).toBe(false);
  });

  it("converts an output back to a blob", () => {
    const o = addProjectOutput(PID, {
      label: "JSON",
      fileName: "data.json",
      mimeType: "application/json",
      content: '{"ok":true}',
    });
    const blob = toOutputBlob(o);
    expect(blob.type).toBe("application/json");
  });
});
