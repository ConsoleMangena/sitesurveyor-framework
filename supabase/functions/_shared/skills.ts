// SiteSurveyor AI skill store — routing + context injection + auto-promotion.
//
// Skills are reusable guidance rows in `ai_skills` (key, title, description,
// body, examples). Before each run the agent loads active skills, selects the
// ~3 most relevant to the current message with a cheap deterministic router,
// and inlines their body + verified examples into the system context. After a
// successful workflow run it auto-promotes the transcript into the matching
// skill's examples (bounded + deduped), so the model gets ground-truth few-shots
// of exactly how the system wants a task done.

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

export interface SkillExample {
  prompt: string;
  tools: { name: string; args: Record<string, unknown> }[];
  result: string;
}

export interface Skill {
  id: string;
  key: string;
  title: string;
  description: string;
  body: string;
  examples: SkillExample[];
  active: boolean;
}

interface SkillRow {
  id: string;
  key: string;
  title: string;
  description: string;
  body: string;
  examples: unknown;
  active: boolean;
}

/** Keyword -> skill key routing table (cheap, deterministic, model-free). */
const ROUTER: { key: string; keywords: string[] }[] = [
  {
    key: "close-overdue-invoices",
    keywords: ["overdue", "close invoice", "settle invoice", "mark paid", "close the invoice"],
  },
  {
    key: "create-quote",
    keywords: ["quote", "proposal", "estimate", "line item", "line items", "create a quote", "build a quote"],
  },
  {
    key: "schedule-job",
    keywords: ["schedule", "assign", "assignment", "book the job", "when is"],
  },
  {
    key: "contact-records",
    keywords: ["contact", "client", "customer", "add person", "new person", "company"],
  },
  {
    key: "default-cad-layers",
    keywords: ["cad", "draw", "layer", "setout", "fence", "block", "dwg", "drawing"],
  },
  {
    key: "destructive-action-policy",
    keywords: ["delete", "remove", "erase", "destroy", "archive", "permanent"],
  },
];

export function parseExamples(raw: unknown): SkillExample[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is SkillExample =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as SkillExample).prompt === "string" &&
      typeof (e as SkillExample).result === "string" &&
      Array.isArray((e as SkillExample).tools),
    )
    .slice(0, 20);
}

function asSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    description: row.description,
    body: row.body,
    examples: parseExamples(row.examples),
    active: row.active,
  };
}

/** Fetch all active skills (best-effort; empty on any failure). */
export async function loadSkills(db: Db, opts: { supabaseUrl: string; serviceKey: string }): Promise<Skill[]> {
  try {
    const out = await db.supabaseFetch({
      ...opts,
      method: "GET",
      path: "ai_skills?select=id,key,title,description,body,examples,active&active=eq.true&limit=50",
    });
    if (!out.ok) return [];
    const rows = Array.isArray(out.json) ? (out.json as SkillRow[]) : [];
    return rows.map(asSkill).filter((s) => s.key);
  } catch {
    return [];
  }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Deterministic router: pick up to 3 skills whose keyword set overlaps the
 * user's message. Scores by number of matched keywords (no embeddings/LLM).
 */
export function selectSkills(userMessage: string, skills: Skill[]): Skill[] {
  const msg = normalize(userMessage);
  const scored: { skill: Skill; score: number }[] = [];
  for (const rule of ROUTER) {
    const skill = skills.find((s) => s.key === rule.key);
    if (!skill) continue;
    let score = 0;
    for (const kw of rule.keywords) {
      if (msg.includes(kw)) score += 1;
    }
    if (score > 0) scored.push({ skill, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.skill).filter((s, i, arr) => arr.indexOf(s) === i);
}

/** Render a compact context block + examples for the selected skills. */
export function formatSkillContext(skills: Skill[]): string {
  if (skills.length === 0) return "";
  const parts: string[] = [];
  for (const skill of skills) {
    const lines = [`## Skill: ${skill.title}`, skill.body];
    if (skill.examples.length > 0) {
      lines.push("Verified examples (follow these patterns exactly):");
      for (const ex of skill.examples.slice(0, 2)) {
        lines.push(`- Prompt: ${ex.prompt}`);
        lines.push(`  Tools: ${ex.tools.map((t) => t.name).join(", ") || "none"}`);
        lines.push(`  Result: ${ex.result}`);
      }
    }
    parts.push(lines.join("\n"));
  }
  return "\n\nSKILLS (relevant guidance for this request):\n" + parts.join("\n\n");
}

const MAX_EXAMPLES = 20;

function promptHash(prompt: string): string {
  let h = 5381;
  for (let i = 0; i < prompt.length; i++) {
    h = (h * 33) ^ prompt.charCodeAt(i);
  }
  return String(h >>> 0);
}

/**
 * Auto-promote a successful run transcript into a skill's examples (bounded to
 * the newest MAX_EXAMPLES, deduped by normalized prompt). Never throws.
 */
export async function promoteExample(
  db: Db,
  opts: { supabaseUrl: string; serviceKey: string },
  skillKey: string,
  example: SkillExample,
): Promise<void> {
  if (!skillKey || !example.prompt?.trim()) return;
  try {
    const out = await db.supabaseFetch({
      ...opts,
      method: "GET",
      path: `ai_skills?key=eq.${encodeURIComponent(skillKey)}&select=id,examples&limit=1`,
    });
    if (!out.ok) return;
    const row = (Array.isArray(out.json) ? out.json : [])[0] as { id?: string; examples?: unknown } | undefined;
    if (!row?.id) return;
    const examples = parseExamples(row.examples);
    const key = promptHash(example.prompt.trim());
    const filtered = examples.filter((e) => promptHash(e.prompt.trim()) !== key);
    filtered.push(example);
    const next = filtered.slice(-MAX_EXAMPLES);
    await db.supabaseFetch({
      ...opts,
      method: "PATCH",
      path: `ai_skills?id=eq.${row.id}`,
      body: { examples: next, updated_at: new Date().toISOString() },
    });
  } catch {
    // Promotion must never break the chat.
  }
}
