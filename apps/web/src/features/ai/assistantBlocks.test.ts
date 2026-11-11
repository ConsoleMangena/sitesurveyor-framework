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

  it("parses a WORKBENCH block into the run/job/project handoff", () => {
    const text =
      "🛰️ Survey queued. [WORKBENCH runId=11111111-1111-1111-1111-111111111111 " +
      "jobId=22222222-2222-2222-2222-222222222222 projectId=33333333-3333-3333-3333-333333333333]";
    const r = parseAssistantBlocks(text);
    expect(r.workbench).toEqual({
      runId: "11111111-1111-1111-1111-111111111111",
      jobId: "22222222-2222-2222-2222-222222222222",
      projectId: "33333333-3333-3333-3333-333333333333",
    });
    expect(r.clean).toBe("🛰️ Survey queued.");
  });

  it("accepts snake_case tool-echo variants and any attribute subset", () => {
    const r = parseAssistantBlocks(
      "Done. [WORKBENCH run_id=44444444-4444-4444-4444-444444444444 job_id=55555555-5555-5555-5555-555555555555]",
    );
    expect(r.workbench).toEqual({
      runId: "44444444-4444-4444-4444-444444444444",
      jobId: "55555555-5555-5555-5555-555555555555",
      projectId: null,
    });
  });

  it("keeps only the first WORKBENCH block and ignores malformed ones", () => {
    const r = parseAssistantBlocks(
      "a [WORKBENCH runId=11111111-1111-1111-1111-111111111111] b [WORKBENCH runId=99999999-9999-9999-9999-999999999999] c [WORKBENCH nothing=here]",
    );
    expect(r.workbench?.runId).toBe("11111111-1111-1111-1111-111111111111");
    expect(r.clean).toBe("a  b  c");
  });

  it("reports no workbench when no block exists", () => {
    const r = parseAssistantBlocks("Plain reply, no handoff.");
    expect(r.workbench).toBeNull();
    expect(r.clean).toBe("Plain reply, no handoff.");
  });

  it("recovers the run id from a legacy markdown workbench link", () => {
    const text =
      "🛰️ Queued! [Open in Survey Workbench](?view=satellite&runId=11111111-1111-1111-1111-111111111111)";
    const r = parseAssistantBlocks(text);
    expect(r.legacyRunId).toBe("11111111-1111-1111-1111-111111111111");
    expect(r.workbench).toBeNull();
    // The link stays in the prose; only structured blocks are stripped.
    expect(r.clean).toContain("Open in Survey Workbench");
  });

  it("recovers nothing from links that name no run", () => {
    const r = parseAssistantBlocks("See [the project](?view=projects&projectId=abc).");
    expect(r.legacyRunId).toBeNull();
  });
});
