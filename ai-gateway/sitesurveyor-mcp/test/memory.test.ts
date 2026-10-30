import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  remember,
  forget,
  loadMemoryEntries,
  memoryPrompt,
} from "../src/memory.js";

let dir: string;
const session = "session-abc";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sitesurveyor-mem-"));
});

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("memory store", () => {
  it("remembers, reads back the persisted fact, and exposes a prompt block", async () => {
    const r = await remember(dir, session, { scope: "user", key: "role", value: "surveyor" });
    expect(r.changed).toBe(true);

    const entries = await loadMemoryEntries(dir, session);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({ scope: "user", key: "role", value: "surveyor" });
    expect(memoryPrompt(entries)).toContain("role: surveyor");
  });

  it("updates an existing key rather than duplicating", async () => {
    await remember(dir, session, { scope: "user", key: "w", value: "v1" });
    await remember(dir, session, { scope: "user", key: "w", value: "v2" });
    const entries = await loadMemoryEntries(dir, session);
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe("v2");
  });

  it("forgets a remembered fact", async () => {
    await remember(dir, session, { scope: "project", key: "code", value: "XYZ" });
    const f = await forget(dir, session, "project", "code");
    expect(f.found).toBe(true);
    expect(f.changed).toBe(true);
    expect(await loadMemoryEntries(dir, session)).toHaveLength(0);
  });

  it("forget on a missing key reports found=false without change", async () => {
    const f = await forget(dir, session, "user", "nope");
    expect(f.found).toBe(false);
    expect(f.changed).toBe(false);
  });

  it("keeps sessions isolated by id", async () => {
    await remember(dir, "session-one", { scope: "user", key: "k", value: "a" });
    expect(await loadMemoryEntries(dir, "session-two")).toHaveLength(0);
  });
});
