// Supabase Edge Function: market-chat
// POST { message, history? }  — no Authorization header required.
// Streams NDJSON agent events: {"type":"delta"|"final"|"error", ...}
//
// The anonymous public-market concierge that backs the chat panel on /market.
// It runs the shared Nemotron agent core in `market` mode: read-only tools
// over the published market views only (no workspace records, no writes, no
// conversation persistence), with its own system prompt. Visitors browse the
// market without an account, so this endpoint is public (verify_jwt = false
// in config.toml) and protects itself with a per-IP rate limit plus hard
// caps on message and history size.

import { runAgent, type ChatTurn } from "../_shared/ai-agent.ts";
import { resolveModel, scoreComplexity } from "../_shared/models.ts";
import { checkRateLimit, clientIp } from "../_shared/rate_limit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NVIDIA_API_KEY = Deno.env.get("NVIDIA_API_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Messages per IP per minute. Generous for a human, hostile to a scraper. */
const RATE_LIMIT = { limit: 8, windowMs: 60_000 };
/** Hard caps so one request cannot bloat the prompt or the model window. */
const MAX_MESSAGE_CHARS = 2_000;
const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_TURN_CHARS = 1_200;

function sanitizeHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-MAX_HISTORY_TURNS)
    .map((turn): ChatTurn | null => {
      if (!turn || typeof turn !== "object") return null;
      const role = (turn as { role?: unknown }).role;
      const content = (turn as { content?: unknown }).content;
      if (role !== "user" && role !== "assistant") return null;
      if (typeof content !== "string" || !content.trim()) return null;
      return { role, content: content.slice(0, MAX_HISTORY_TURN_CHARS) };
    })
    .filter((turn): turn is ChatTurn => turn !== null);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Use POST." });
  }

  const limit = checkRateLimit({
    key: `market-chat:${clientIp(req)}`,
    limit: RATE_LIMIT.limit,
    windowMs: RATE_LIMIT.windowMs,
  });
  if (!limit.allowed) {
    return json(429, {
      error: `Too many messages — try again in ${limit.retryAfterSeconds}s.`,
      retry_after: limit.retryAfterSeconds,
    });
  }

  if (!NVIDIA_API_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(503, { error: "The market concierge is not configured on this host." });
  }

  let body: { message?: unknown; history?: unknown; model?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return json(400, { error: "message is required." });
  if (message.length > MAX_MESSAGE_CHARS) {
    return json(400, {
      error: `Keep the message under ${MAX_MESSAGE_CHARS} characters.`,
    });
  }

  const history = sanitizeHistory(body.history);
  // Unknown model ids silently fall back to the default (models.ts is the
  // single allowlist); complexity escalates multi-part asks to a stronger
  // free Nemotron model.
  const rawModel = typeof body.model === "string" ? body.model.trim() : "";
  const model = resolveModel(rawModel || undefined, scoreComplexity(message, 0));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        for await (const event of runAgent({
          mode: "market",
          context: "marketplace",
          history,
          userMessage: message,
          nvidiaApiKey: NVIDIA_API_KEY,
          supabaseUrl: SUPABASE_URL,
          serviceKey: SERVICE_ROLE_KEY,
          model,
        })) {
          send(event);
        }
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
});
