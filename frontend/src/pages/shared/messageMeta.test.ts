import { describe, expect, it } from "vitest";
import { messageMeta, showRowMeta } from "./messageMeta.ts";

describe("messageMeta", () => {
  it("labels an assistant message", () => {
    const meta = messageMeta("assistant", "2026-09-16T10:00:00Z");
    expect(meta.label).toBe("SiteSurveyor");
  });

  it("labels a user message", () => {
    const meta = messageMeta("user", "2026-09-16T10:00:00Z");
    expect(meta.label).toBe("You");
  });

  it("formats a valid timestamp as h:mm", () => {
    const meta = messageMeta("user", "2026-09-16T10:30:00Z");
    expect(meta.timeLabel).toMatch(/^\d{1,2}:\d{2}/);
  });

  it("returns null timeLabel when createdAt is missing", () => {
    const meta = messageMeta("assistant", undefined);
    expect(meta.timeLabel).toBeNull();
  });
});

describe("showRowMeta", () => {
  it("shows metadata on the first message", () => {
    expect(showRowMeta("user", undefined)).toBe(true);
  });

  it("shows metadata when the role changes (turn boundary)", () => {
    expect(showRowMeta("user", "assistant")).toBe(true);
    expect(showRowMeta("assistant", "user")).toBe(true);
  });

  it("hides metadata on a consecutive same-role message", () => {
    expect(showRowMeta("assistant", "assistant")).toBe(false);
  });
});
