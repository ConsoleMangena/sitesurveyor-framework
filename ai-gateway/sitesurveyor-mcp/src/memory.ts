// Per-conversation memory store for the SiteSurveyor MCP server. Replicates the
// behaviour of the shared memory.ts so `remember`/`forget` and the memory prompt
// behave identically to the cloud agent.
//
// Because `agent exec` is a fresh process per turn, state is keyed on the
// session id supplied by the host and persisted to a JSONL file under a state
// dir. The host passes --state-dir so memory survives across turns.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface MemoryEntry {
  scope: string;
  key: string;
  value: string;
}

export interface MemoryStore {
  sessionId: string;
  stateDir: string;
}

function memoryFile(stateDir: string, sessionId: string): string {
  return join(stateDir, `memory-${safeSession(sessionId)}.jsonl`);
}

function safeSession(sessionId: string): string {
  return sessionId.replace(/[^A-Za-z0-9_-]/g, "_");
}

export async function loadMemoryEntries(stateDir: string, sessionId: string): Promise<MemoryEntry[]> {
  try {
    const text = await readFile(memoryFile(stateDir, sessionId), "utf8");
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as MemoryEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is MemoryEntry => e != null);
  } catch {
    return [];
  }
}

async function persist(entries: MemoryEntry[], stateDir: string, sessionId: string): Promise<void> {
  const file = memoryFile(stateDir, sessionId);
  await mkdir(dirname(file), { recursive: true });
  const lines = entries.map((e) => JSON.stringify(e)).join("\n");
  await writeFile(file, lines + (lines ? "\n" : ""), "utf8");
}

export async function remember(
  stateDir: string,
  sessionId: string,
  entry: MemoryEntry,
): Promise<{ ok: boolean; memory: MemoryEntry[]; changed: boolean }> {
  const entries = await loadMemoryEntries(stateDir, sessionId);
  const idx = entries.findIndex((e) => e.scope === entry.scope && e.key === entry.key);
  if (idx >= 0) {
    if (entries[idx].value === entry.value) {
      return { ok: true, memory: entries, changed: false };
    }
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }
  await persist(entries, stateDir, sessionId);
  return { ok: true, memory: entries, changed: true };
}

export async function forget(
  stateDir: string,
  sessionId: string,
  scope: string,
  key: string,
): Promise<{ ok: boolean; memory: MemoryEntry[]; changed: boolean; found: boolean }> {
  const entries = await loadMemoryEntries(stateDir, sessionId);
  const remaining = entries.filter((e) => !(e.scope === scope && e.key === key));
  const found = remaining.length !== entries.length;
  if (!found) return { ok: true, memory: entries, changed: false, found };
  await persist(remaining, stateDir, sessionId);
  return { ok: true, memory: remaining, changed: true, found };
}

export function memoryPrompt(entries: MemoryEntry[]): string {
  if (!entries.length) return "";
  const lines = entries.map((e) => `- (${e.scope}) ${e.key}: ${e.value}`);
  return `Known facts about the user / project:\n${lines.join("\n")}\n`;
}
