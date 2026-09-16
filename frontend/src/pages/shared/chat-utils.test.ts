import { describe, it, expect } from "vitest";
import { truncatePreview, filterMembers, deriveMemberPreviews } from "./chat-utils.ts";

describe("truncatePreview", () => {
  it("returns text unchanged when under 40 chars", () => {
    expect(truncatePreview("Hello world")).toBe("Hello world");
  });

  it("truncates and appends ellipsis when over 40 chars", () => {
    const long = "A".repeat(50);
    expect(truncatePreview(long)).toBe("A".repeat(40) + "…");
  });

  it("returns 'No messages yet' for empty string", () => {
    expect(truncatePreview("")).toBe("No messages yet");
  });
});

function m(id: string, name: string) {
  return { user_id: id, full_name: name } as any;
}

describe("filterMembers", () => {
  const members = [m("a", "Alice"), m("b", "Bob"), m("c", "Charlie")];

  it("returns all members when search is empty", () => {
    expect(filterMembers(members, "")).toHaveLength(3);
  });

  it("filters by display name case-insensitively", () => {
    expect(filterMembers(members, "bob")).toHaveLength(1);
    expect(filterMembers(members, "ALICE")).toHaveLength(1);
  });

  it("filters by partial match", () => {
    expect(filterMembers(members, "li")).toHaveLength(2);
  });

  it("returns empty when nothing matches", () => {
    expect(filterMembers(members, "zzz")).toHaveLength(0);
  });
});

describe("deriveMemberPreviews", () => {
  const members = [
    { user_id: "a", full_name: "Alice", role: "manager" },
    { user_id: "b", full_name: "Bob", role: "member" },
  ] as any[];

  it("returns null messageId for members with no messages", () => {
    const previews = deriveMemberPreviews(members, []);
    expect(previews.get("a")).toEqual({ text: "", messageId: null });
  });

  it("picks the most recent message per member", () => {
    const messages = [
      { id: "m1", user_id: "a", text: "first", sent_at: "2026-01-01T09:00:00Z" },
      { id: "m2", user_id: "a", text: "second message from Alice", sent_at: "2026-01-01T10:00:00Z" },
      { id: "m3", user_id: "b", text: "hey there", sent_at: "2026-01-01T09:30:00Z" },
    ] as any[];
    const previews = deriveMemberPreviews(members, messages);
    expect(previews.get("a")?.messageId).toBe("m2");
    expect(previews.get("a")?.text).toBe("second message from Alice");
    expect(previews.get("b")?.messageId).toBe("m3");
  });

  it("ignores messages from unknown members", () => {
    const messages = [{ id: "x", user_id: "z", text: "ghost", sent_at: "2026-01-01T08:00:00Z" }] as any[];
    const previews = deriveMemberPreviews(members, messages);
    expect(previews.size).toBe(2);
    expect(previews.get("a")?.messageId).toBeNull();
  });
});