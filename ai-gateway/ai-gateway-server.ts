// SiteSurveyor AI host server.
//
// Serves the built frontend (frontend/dist) and exposes /api/chat — the
// offline-fallback runtime for the SiteSurveyor AI agent (primary is the
// `ai-chat` Supabase Edge Function). /api/market-chat is the same fallback
// for the anonymous public-market concierge (`market-chat` Edge Function).
// Both speak identical NDJSON events:
// {"type":"delta"|"final"|"error"|"status", ...}.
//
// Agent engine: the inline streaming NVIDIA NIM (Nemotron)
// core (shared with the cloud `ai-chat` Edge Function) so replies stream
// token-by-token. The OpenAI-compatible NIM endpoint is used with the same
// contract. An opt-in openclaw Gateway path (openclaw agent --agent
// sitesurveyor) is available via USE_OPENCLAW=1; it is buffered. Configuration
// via ai-gateway/.env:
//   NVIDIA_API_KEY=nvapi-...                  provider key (from build.nvidia.com)
//   SUPABASE_URL=https://<project>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=<service role key>
//
// The USE_OPENCLAW path requires the ambient openclaw config (~/.openclaw/
// openclaw.json) to register:
//   mcp.servers.sitesurveyor  → ai-gateway/sitesurveyor-mcp (stdio)
//   agents.entries.sitesurveyor → routing + model policy
// See ai-gateway/README.md for the one-time setup.
//
// Usage:
//   npm run build            # in frontend/  and  sitesurveyor-mcp/
//   npm start                # in server/

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ── Minimal .env loader (server/.env; never committed) ────────────────────
const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] == null) process.env[match[1]] = match[2];
  }
}

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY ?? "";
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, "../apps/web/dist");
const MCP_DIST = path.resolve(here, "sitesurveyor-mcp/dist/index.js");

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error(
    `[host] missing ${DIST}/index.html — run "npm run build" inside apps/web/ first.`,
  );
  process.exit(1);
}
if (!fs.existsSync(MCP_DIST)) {
  console.error(
    `[host] missing SiteSurveyor MCP server: ${MCP_DIST} — run "npm install && npm run build" inside sitesurveyor-mcp/ first.`,
  );
  process.exit(1);
}
for (const [name, value] of Object.entries({
  NVIDIA_API_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
})) {
  if (!value) console.warn(`[host] warning: ${name} is not set — /api/chat disabled.`);
}

// The model id is resolved from models.ts (single source of truth) so both
// serve paths agree. When the openclaw Gateway path below is opted in, auth is
// delegated to `openclaw agent exec --auth-env-only`.
const { resolveModel, scoreComplexity } = await import(
  pathToFileURL(path.resolve(here, "../supabase/functions/_shared/models.ts")).href
) as typeof import("../supabase/functions/_shared/models.ts");

const { execOpenclawAgent, openclawAgentEvents, buildOpenclawEnv } = await import(
  pathToFileURL(path.resolve(here, "openclaw-runner.ts")).href
) as typeof import("./openclaw-runner.ts");

// Agent engine. Default is the inline streaming agent core (shared with
// the cloud `ai-chat` Edge Function) so replies stream token-by-token exactly
// like the cloud path. The buffered openclaw Gateway path (`openclaw agent
// --agent sitesurveyor`) remains available via USE_OPENCLAW=1.
const AGENT_CORE = path.resolve(
  here,
  "../supabase/functions/_shared/ai-agent.ts",
);
const useOpenclawGateway = process.env.USE_OPENCLAW === "1";
const streamRunAgent = fs.existsSync(AGENT_CORE)
  ? (
      await import(pathToFileURL(AGENT_CORE).href)
    ) as typeof import("../supabase/functions/_shared/ai-agent.ts")
  : null;

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Validate a Supabase access token; returns the user id or null. */
async function authenticate(req: http.IncomingMessage): Promise<string | null> {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string };
    return user.id ?? null;
  } catch {
    return null;
  }
}

async function rest<T>(
  method: "GET" | "POST" | "PATCH",
  reqPath: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: T | null }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${reqPath}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: T | null = null;
  try {
    json = text ? (JSON.parse(text) as T) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

// ── AI credit accounting (mirrors the ai-chat Edge Function) ──────────────
// The fallback route must bill too, otherwise falling back here becomes a way
// to use AI without spending credits. Idempotent on (workspace, turn id).
const AI_CREDITS_OPERATION = "ai.chat";

// A retried request (same turn id, same text) must not spend twice, while a
// re-used turn id carrying a new question must still be billed — so the ledger
// key binds the turn id to the message it was issued for.
async function turnOperationId(turnId: string, message: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
  return `${turnId}:${hex}`;
}

interface RpcResult {
  ok: boolean;
  status: number;
  message: string;
}

async function rpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  const payload = parsed as { message?: unknown } | null;
  return {
    ok: res.ok,
    status: res.status,
    message: typeof payload?.message === "string" ? payload.message : "",
  };
}

type Charge =
  | { ok: true }
  | { ok: false; status: number; error: string };

async function chargeAiTurn(
  workspaceId: string,
  userId: string,
  operationId: string,
  message: string,
): Promise<Charge> {
  const res = await rpc(
    "spend_workspace_ai_credits",
    {
      p_workspace_id: workspaceId,
      p_user_id: userId,
      p_operation_id: operationId,
      p_operation: AI_CREDITS_OPERATION,
      p_description: message.slice(0, 120),
    },
  );
  if (res.ok) return { ok: true };
  if (res.message.includes("INSUFFICIENT_AI_CREDITS")) {
    return {
      ok: false,
      status: 402,
      error: "Not enough AI credits for this reply. Top up in Billing, then try again.",
    };
  }
  // Fail closed: never run a paid model turn we could not bill.
  console.error(`[host] credit charge failed: ${res.status} ${res.message}`);
  return { ok: false, status: 503, error: "Credit accounting is unavailable. Please retry in a moment." };
}

async function refundAiTurn(
  workspaceId: string,
  userId: string,
  operationId: string,
  reason: string,
): Promise<void> {
  const res = await rpc("refund_workspace_ai_credits", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_operation_id: operationId,
    p_reason: reason.slice(0, 120),
  });
  if (!res.ok) {
    console.error(`[host] credit refund failed for ${operationId}: ${res.status} ${res.message}`);
  }
}

interface ConversationRow {
  id: string;
  user_id: string;
  title: string;
  summary: string | null;
  summary_through: string | null;
  context: string | null;
}

async function handleChat(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!NVIDIA_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 503, {
      error: "AI fallback not configured on this host.",
    });
  }

  let payload: {
    conversation_id?: string;
    message?: string;
    project_id?: string;
    model?: string;
    turn_id?: string;
  };
  try {
    const raw = await new Promise<string>((resolve) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => resolve(data));
    });
    payload = JSON.parse(raw || "{}");
  } catch {
    return json(res, 400, { error: "Invalid JSON body." });
  }
  const conversationId = String(payload.conversation_id ?? "");
  const message = String(payload.message ?? "").trim();
  if (!conversationId || !message) {
    return json(res, 400, { error: "conversation_id and message are required." });
  }
  // Optional CAD-workspace context: ignore malformed values silently.
  const rawProjectId =
    typeof payload.project_id === "string" ? payload.project_id.trim() : "";
  const projectId = /^[0-9a-f-]{36}$/i.test(rawProjectId)
    ? rawProjectId
    : undefined;
  // Validate model against allowlist; unknown values silently fall back.
  // Then apply task-complexity routing: complex multi-step tasks escalate to a
  // stronger (still free) model so the weakest model doesn't carry them.
  const rawModel = typeof payload.model === "string" ? payload.model.trim() : "";
  const complexity = scoreComplexity(message, 0);
  const model = resolveModel(rawModel || undefined, complexity);

  // Auth and conversation lookup are independent — race them together.
  const [userId, convRes] = await Promise.all([
    authenticate(req),
    rest<ConversationRow[]>(
      "GET",
      `ai_conversations?id=eq.${conversationId}&select=id,user_id,title,summary,summary_through,context`,
    ),
  ]);
  if (!userId) return json(res, 401, { error: "Sign in to use the AI chat." });
  const conversation = convRes.json?.[0];
   if (!convRes.ok || !conversation) {
     console.error(`[host] conversation not found: id=${conversationId}, ok=${convRes.ok}, json=${JSON.stringify(convRes.json)}`);
     return json(res, 404, { error: "Conversation not found." });
   }
  if (conversation.user_id !== userId) {
    return json(res, 403, { error: "This chat belongs to another account." });
  }

  // Workspace resolution is independent of the turn bookkeeping below.
  const workspacePromise = (async () => {
    const profileRes = await rest<{ default_workspace_id: string | null }[]>(
      "GET",
      `profiles?id=eq.${userId}&select=default_workspace_id`,
    );
    let wsId = profileRes.json?.[0]?.default_workspace_id ?? null;
    if (!wsId) {
      const memberRes = await rest<{ workspace_id: string }[]>(
        "GET",
        `workspace_members?user_id=eq.${userId}&status=eq.active&select=workspace_id&order=created_at.asc&limit=1`,
      );
      wsId = memberRes.json?.[0]?.workspace_id ?? null;
    }
    return wsId;
  })();

  // Bill the turn before anything is persisted, so a rejected request leaves
  // no orphan user message behind.
  const workspaceId = await workspacePromise;
  const rawTurnId =
    typeof payload.turn_id === "string" ? payload.turn_id.trim() : "";
  const turnId = /^[A-Za-z0-9_-]{8,160}$/.test(rawTurnId)
    ? rawTurnId
    : globalThis.crypto.randomUUID();
  const operationId = await turnOperationId(turnId, message);
  // A turn with no workspace has no ledger to debit, so it stays unbilled.
  const billableWorkspaceId = workspaceId;
  if (billableWorkspaceId) {
    const charge = await chargeAiTurn(billableWorkspaceId, userId, operationId, message);
    if (!charge.ok) return json(res, charge.status, { error: charge.error });
  }

  // Persist the user turn first (same contract as the Edge Function).
  await rest("POST", "ai_messages", {
    conversation_id: conversation.id,
    user_id: userId,
    role: "user",
    content: message,
  });

  // Title/timestamp patch and history load are independent of each other
  // (history only depends on the insert above). Fetch a few more than
  // MAX_HISTORY_TURNS so the live turn can be sliced off.
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (conversation.title === "New chat") patch.title = message.slice(0, 60);
  const [, historyRes] = await Promise.all([
    rest("PATCH", `ai_conversations?id=eq.${conversation.id}`, patch),
    rest<{ role: "user" | "assistant"; content: string }[]>(
      "GET",
      `ai_messages?conversation_id=eq.${conversation.id}&select=role,content&order=created_at.asc&limit=18`,
    ),
  ]);
  const priorRows = historyRes.json ?? [];
  const history = priorRows
    .slice(0, -1)
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({ role: row.role, content: row.content }));

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
  });
  const send = (event: Record<string, unknown>) =>
    res.write(JSON.stringify(event) + "\n");

  let finalText = "";
  try {
    if (useOpenclawGateway) {
      // Opt-in: delegate the turn to the openclaw Gateway (sitesurveyor
      // agent, MCP tools registered in the ambient openclaw config). Buffered:
      // the Gateway emits the full result, so a single `final` event is sent
      // when the run completes.
      const env = buildOpenclawEnv({
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        WORKSPACE_ID: workspaceId ?? "",
        NVIDIA_API_KEY,
      });
      const memoryNote = conversation.summary?.trim();
      const messageForAgent = memoryNote
        ? `Prior conversation notes (treat as background, re-verify current state):\n${memoryNote}\n\nUser: ${message}`
        : message;
      const result = await execOpenclawAgent({
        message: messageForAgent,
        model,
        timeoutMs: 300_000,
        env,
      });
      for await (const event of openclawAgentEvents(result)) {
        if (event.type === "final") finalText = String(event.text ?? "");
        send(event);
      }
    } else if (streamRunAgent) {
      // Default: shared streaming agent core — deltas stream live.
      for await (const event of streamRunAgent.runAgent({
        history,
        userMessage: message,
        nvidiaApiKey: NVIDIA_API_KEY,
        supabaseUrl: SUPABASE_URL,
        serviceKey: SUPABASE_SERVICE_ROLE_KEY,
        workspaceId: workspaceId ?? undefined,
        projectId,
        memoryNote: conversation.summary?.trim() || undefined,
        model,
        userId,
        conversationId: conversation.id,
        context: conversation.context ?? "dashboard",
      })) {
        if (event.type === "final") finalText = event.text;
        send(event);
      }
    } else {
      send({ type: "error", message: "No agent engine available on this host." });
    }
    if (finalText.trim()) {
      await rest("POST", "ai_messages", {
        conversation_id: conversation.id,
        user_id: userId,
        role: "assistant",
        content: finalText,
      });
      await rest("PATCH", `ai_conversations?id=eq.${conversation.id}`, {
        updated_at: new Date().toISOString(),
      });
    } else if (billableWorkspaceId) {
      await refundAiTurn(
        billableWorkspaceId,
        userId,
        operationId,
        "The agent returned no reply.",
      );
    }
  } catch (err) {
    if (billableWorkspaceId) {
      await refundAiTurn(billableWorkspaceId, userId, operationId, (err as Error).message);
    }
    send({ type: "error", message: (err as Error).message });
  } finally {
    res.end();
  }
}

// ── Public market concierge (anonymous, read-only) ─────────────────────────
// Fallback for the `market-chat` Edge Function: same NDJSON contract, same
// shared agent core in `market` mode. No auth and no persistence — only a
// per-IP rate limit and hard size caps, since the endpoint is public.

const marketChatBuckets = new Map<string, { count: number; resetAt: number }>();
const MARKET_CHAT_LIMIT = { limit: 8, windowMs: 60_000 };
const MARKET_MAX_MESSAGE_CHARS = 2_000;
const MARKET_MAX_HISTORY_TURNS = 8;
const MARKET_MAX_HISTORY_TURN_CHARS = 1_200;

function requestIp(req: http.IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return first?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
}

function marketChatAllowed(ip: string): boolean {
  const now = Date.now();
  if (marketChatBuckets.size > 10_000) {
    for (const [key, bucket] of marketChatBuckets) {
      if (bucket.resetAt <= now) marketChatBuckets.delete(key);
      if (marketChatBuckets.size <= 10_000) break;
    }
  }
  const bucket = marketChatBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    marketChatBuckets.set(ip, { count: 1, resetAt: now + MARKET_CHAT_LIMIT.windowMs });
    return true;
  }
  if (bucket.count >= MARKET_CHAT_LIMIT.limit) return false;
  bucket.count += 1;
  return true;
}

function sanitizeMarketHistory(raw: unknown): { role: "user" | "assistant"; content: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-MARKET_MAX_HISTORY_TURNS)
    .map((turn) => {
      if (!turn || typeof turn !== "object") return null;
      const role = (turn as { role?: unknown }).role;
      const content = (turn as { content?: unknown }).content;
      if (role !== "user" && role !== "assistant") return null;
      if (typeof content !== "string" || !content.trim()) return null;
      return { role, content: content.slice(0, MARKET_MAX_HISTORY_TURN_CHARS) };
    })
    .filter((turn): turn is { role: "user" | "assistant"; content: string } => turn !== null);
}

async function handleMarketChat(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!NVIDIA_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 503, { error: "The market concierge is not configured on this host." });
  }
  if (!streamRunAgent) {
    return json(res, 503, { error: "No agent engine available on this host." });
  }
  if (!marketChatAllowed(requestIp(req))) {
    return json(res, 429, { error: "Too many messages — wait a minute and try again." });
  }

  let payload: { message?: unknown; history?: unknown; model?: unknown };
  try {
    const raw = await new Promise<string>((resolve) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => resolve(data));
    });
    payload = JSON.parse(raw || "{}");
  } catch {
    return json(res, 400, { error: "Invalid JSON body." });
  }

  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  if (!message) return json(res, 400, { error: "message is required." });
  if (message.length > MARKET_MAX_MESSAGE_CHARS) {
    return json(res, 400, {
      error: `Keep the message under ${MARKET_MAX_MESSAGE_CHARS} characters.`,
    });
  }

  const history = sanitizeMarketHistory(payload.history);
  const rawModel = typeof payload.model === "string" ? payload.model.trim() : "";
  const model = resolveModel(rawModel || undefined, scoreComplexity(message, 0));

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
  });
  const send = (event: Record<string, unknown>) =>
    res.write(JSON.stringify(event) + "\n");
  try {
    for await (const event of streamRunAgent.runAgent({
      mode: "market",
      context: "marketplace",
      history,
      userMessage: message,
      nvidiaApiKey: NVIDIA_API_KEY,
      supabaseUrl: SUPABASE_URL,
      serviceKey: SUPABASE_SERVICE_ROLE_KEY,
      model,
    })) {
      send(event);
    }
  } catch (err) {
    send({ type: "error", message: (err as Error).message });
  } finally {
    res.end();
  }
}

// ── Static file serving ────────────────────────────────────────────────────
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".txt": "text/plain",
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const resolved = path.normalize(path.join(DIST, pathname));
  if (!resolved.startsWith(DIST)) {
    res.writeHead(403);
    return res.end();
  }
  const target =
    fs.existsSync(resolved) && fs.statSync(resolved).isFile()
      ? resolved
      : path.join(DIST, "index.html"); // SPA fallback
  const type = MIME[path.extname(target).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  fs.createReadStream(target).pipe(res);
}

const server = http.createServer((req, res) => {
  const route = (req.url ?? "").split("?")[0];
  if (route === "/api/chat") {
    void handleChat(req, res);
    return;
  }
  if (route === "/api/market-chat") {
    if (req.method !== "POST" && req.method !== "OPTIONS") {
      res.writeHead(405, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      });
      return res.end();
    }
    void handleMarketChat(req, res);
    return;
  }
  serveStatic(req, res);
});

server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;

server.listen(PORT, HOST, () => {
  console.log(`[host] SiteSurveyor app   : http://${HOST}:${PORT}`);
  console.log(
    `[host] AI fallback ready : POST /api/chat ${NVIDIA_API_KEY ? "(configured)" : "(NOT configured — set server/.env)"}`,
  );
  console.log(
    `[host] Other devices: open http://<this-machine-ip>:${PORT} — nothing to install.`,
  );
});
