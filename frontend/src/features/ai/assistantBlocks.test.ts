import { describe, it, expect } from "vitest";
import { parseAssistantBlocks } from "./assistantBlocks.ts";

describe("parseAssistantBlocks", () => {
  it("extracts CAD blocks and strips them from the prose", () => {
    const r = parseAssistantBlocks("Here you go:\n[CAD]\nPOINT 1 2\n[/CAD]\nDone.");
    expect(r.cadBlocks).toEqual(["POINT 1 2"]);
    expect(r.clean).toBe("Here you go:\n\nDone.");
    expect(r.ask).toBeNull();
  });

  it("extracts multiple CAD blocks in order", () => {
    const r = parseAssistantBlocks("[CAD]A[/CAD] mid [cad]B[/cad]");
    expect(r.cadBlocks).toEqual(["A", "B"]);
  });

  it("parses an ASK block into question + options", () => {
    const r = parseAssistantBlocks(
      "Before I draw:\n[ASK]\nWhich layer should the boundary go on?\n- BOUNDARY\n- SETOUT\n- Create a new layer\n[/ASK]",
    );
    expect(r.ask).toEqual({
      question: "Which layer should the boundary go on?",
      options: ["BOUNDARY", "SETOUT", "Create a new layer"],
    });
    expect(r.clean).toBe("Before I draw:");
  });

  it("keeps only the first ASK block when several appear", () => {
    const r = parseAssistantBlocks(
      "[ASK]q1?\n- a[/ASK] [ASK]q2?\n- b[/ASK]",
    );
    expect(r.ask?.question).toBe("q1?");
    expect(r.ask?.options).toEqual(["a"]);
  });

  it("ignores a malformed ASK block (no options) but still strips it", () => {
    const r = parseAssistantBlocks("[ASK]just a question, no options[/ASK] hello");
    expect(r.ask).toBeNull();
    expect(r.clean).toBe("hello");
  });

  it("returns prose untouched when no blocks exist", () => {
    const text = "Plain **markdown** reply.";
    const r = parseAssistantBlocks(text);
    expect(r.clean).toBe(text);
    expect(r.cadBlocks).toEqual([]);
    expect(r.ask).toBeNull();
  });

  it("collapses blank runs left behind by stripped blocks", () => {
    const r = parseAssistantBlocks("top\n[CAD]X[/CAD]\n\n\n\nbottom");
    expect(r.clean).toBe("top\n\nbottom");
  });
});
