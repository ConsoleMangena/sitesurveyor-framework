/**
 * Parsers for the structured blocks the AI agent embeds in replies.
 *
 *  [ASK] ... [/ASK]              — a clarifying question with quick-reply options:
 *                                  plain lines form the question, "- " lines are options.
 *  [WORKBENCH runId=.. jobId=.. projectId=..]
 *                                — the deep-link context for the "Open in
 *                                  Satellite Workbench" button, so the reader
 *                                  lands on the exact run the agent is talking
 *                                  about instead of the project picker.
 *
 * The page renders these blocks as interactive UI and shows only the
 * remaining prose as markdown.
 */
export interface AssistantAsk {
  question: string;
  options: string[];
}

/** Deep-link context the agent echoes from a satellite survey tool result.
 *  Any subset is valid — the workbench resolves the rest from a job or run. */
export interface AssistantWorkbench {
  runId: string | null;
  jobId: string | null;
  projectId: string | null;
}

export interface ParsedAssistantText {
  /** Reply text with every structured block removed, ready for markdown. */
  clean: string;
  ask: AssistantAsk | null;
  workbench: AssistantWorkbench | null;
}

const ASK_RE = /\[ASK\]([\s\S]*?)\[\/ASK\]/gi;
const WORKBENCH_RE = /\[WORKBENCH\b([^\]]*)\]/gi;

function stripBlocks(text: string): string {
  return text
    .replace(ASK_RE, "")
    .replace(WORKBENCH_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseAsk(body: string): AssistantAsk | null {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const options = lines
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim())
    .filter(Boolean);
  const question = lines.filter((l) => !l.startsWith("- ")).join(" ").trim();
  if (!question || options.length === 0) return null;
  return { question, options };
}

function parseWorkbench(body: string): AssistantWorkbench | null {
  const attrs = new Map<string, string>();
  for (const pair of body.matchAll(/([A-Za-z_]+)\s*=\s*([^\s\]]+)/g)) {
    attrs.set(pair[1].toLowerCase(), pair[2]);
  }
  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = attrs.get(key);
      if (value) return value;
    }
    return null;
  };
  const handoff: AssistantWorkbench = {
    runId: pick("runid", "run_id"),
    jobId: pick("jobid", "job_id"),
    projectId: pick("projectid", "project_id"),
  };
  return handoff.runId || handoff.jobId || handoff.projectId ? handoff : null;
}

export function parseAssistantBlocks(text: string): ParsedAssistantText {
  let ask: AssistantAsk | null = null;
  let workbench: AssistantWorkbench | null = null;
  let m: RegExpExecArray | null;
  ASK_RE.lastIndex = 0;
  while ((m = ASK_RE.exec(text)) !== null) {
    const parsed = parseAsk(m[1]);
    if (parsed && !ask) ask = parsed;
  }
  WORKBENCH_RE.lastIndex = 0;
  while ((m = WORKBENCH_RE.exec(text)) !== null) {
    const parsed = parseWorkbench(m[1]);
    if (parsed && !workbench) workbench = parsed;
  }
  return { clean: stripBlocks(text), ask, workbench };
}
