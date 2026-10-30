import { describe, it, expect } from "vitest";
import { parseAssistantBlocks } from "./assistantBlocks.ts";

describe("parseAssistantBlocks", () => {
  it("parses an ASK block into question + options", () => {
    const r = parseAssistantBlocks(
      "Before we continue:\n[ASK]\nWhich workspace should I use?\n- Field team\n- Office\n- Create a new workspace\n[/ASK]",
    );
    expect(r.ask).toEqual({
      question: "Which workspace should I use?",
      options: ["Field team", "Office", "Create a new workspace"],
    });
    expect(r.clean).toBe("Before we continue:");
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
    expect(r.ask).toBeNull();
  });

  it("collapses blank runs left behind by stripped blocks", () => {
    const r = parseAssistantBlocks("top\n[ASK]q?\n- a[/ASK]\n\n\n\nbottom");
    expect(r.clean).toBe("top\n\nbottom");
  });
});
