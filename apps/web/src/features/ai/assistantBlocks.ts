/**
 * Parsers for the structured blocks the AI agent embeds in replies.
 *
 *  [ASK] ... [/ASK]  — a clarifying question with quick-reply options:
 *                      plain lines form the question, "- " lines are options.
 *
 * The page renders these blocks as interactive UI and shows only the
 * remaining prose as markdown.
 */
export interface AssistantAsk {
  question: string;
  options: string[];
}

export interface ParsedAssistantText {
  /** Reply text with every structured block removed, ready for markdown. */
  clean: string;
  ask: AssistantAsk | null;
}

const ASK_RE = /\[ASK\]([\s\S]*?)\[\/ASK\]/gi;

function stripBlocks(text: string): string {
  return text
    .replace(ASK_RE, "")
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

export function parseAssistantBlocks(text: string): ParsedAssistantText {
  let ask: AssistantAsk | null = null;
  let m: RegExpExecArray | null;
  ASK_RE.lastIndex = 0;
  while ((m = ASK_RE.exec(text)) !== null) {
    const parsed = parseAsk(m[1]);
    if (parsed && !ask) ask = parsed;
  }
  return { clean: stripBlocks(text), ask };
}
