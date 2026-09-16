// SiteSurveyor AI structured per-conversation memory.
//
// The agent persists discrete facts (active CAD layer, datum, stated
// preferences/defaults) as it learns them — keyed by conversation — and reads
// them back into context at the start of each run as a compact, reliable block.
// Facts survive MAX_HISTORY_TURNS truncation that would drop the prose that
// originally stated them, complementing the free-text rolling summary.

export interface DbFetchOpts {
  supabaseUrl: string;
  serviceKey: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  preferCount?: boolean;
}

export interface Db {
  supabaseFetch(
    opts: DbFetchOpts,
  ): Promise<{ ok: boolean; status: number; json: unknown; count: number | null }>;
}

export interface MemoryFact {
  key: string;
  value: unknown;
  updated_at: string;
}

/** Fetch all memory facts for a conversation (best-effort; empty on failure). */
export async function loadMemory(
  db: Db,
  opts: { supabaseUrl: string; serviceKey: string; conversationId: string },
): Promise<MemoryFact[]> {
  try {
    const out = await db.supabaseFetch({
      ...opts,
      method: "GET",
      path: `ai_memory?conversation_id=eq.${encodeURIComponent(opts.conversationId)}&select=key,value,updated_at&limit=50`,
    });
    if (!out.ok) return [];
    const rows = Array.isArray(out.json) ? (out.json as MemoryFact[]) : [];
    return rows.filter((r) => r.key);
  } catch {
    return [];
  }
}

/** Render a compact context block listing known memory facts. */
export function formatMemoryBlock(facts: MemoryFact[]): string {
  if (facts.length === 0) return "";
  const lines = facts
    .map((f) => `- ${f.key}: ${typeof f.value === "string" ? f.value : JSON.stringify(f.value)}`)
    .join("\n");
  return `\n\nSTRUCTURED MEMORY — verified facts about this conversation:\n${lines}\nTreat as real current state (not background). Re-verify exact numbers with tools only when precision matters.`;
}

function stringifyValue(value: unknown): unknown {
  return typeof value === "string" ? value : value;
}

/** Upsert a single memory fact (best-effort; never throws). */
export async function remember(
  db: Db,
  opts: { supabaseUrl: string; serviceKey: string; conversationId: string },
  key: string,
  value: unknown,
): Promise<boolean> {
  if (!key.trim()) return false;
  try {
    const out = await db.supabaseFetch({
      ...opts,
      method: "PATCH",
      path: `ai_memory?conversation_id=eq.${encodeURIComponent(opts.conversationId)}&key=eq.${encodeURIComponent(key)}`,
      body: { value: stringifyValue(value), updated_at: new Date().toISOString() },
    });
    if (out.ok && out.count !== null && out.count > 0) return true;
    await db.supabaseFetch({
      ...opts,
      method: "POST",
      path: "ai_memory",
      body: {
        conversation_id: opts.conversationId,
        key: key.trim(),
        value: stringifyValue(value),
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** Remove a memory fact (best-effort; never throws). */
export async function forget(
  db: Db,
  opts: { supabaseUrl: string; serviceKey: string; conversationId: string },
  key: string,
): Promise<boolean> {
  if (!key.trim()) return false;
  try {
    await db.supabaseFetch({
      ...opts,
      method: "DELETE",
      path: `ai_memory?conversation_id=eq.${encodeURIComponent(opts.conversationId)}&key=eq.${encodeURIComponent(key)}`,
    });
    return true;
  } catch {
    return false;
  }
}
