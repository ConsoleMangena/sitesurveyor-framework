// SiteSurveyor AI host server.
//
// Serves the built frontend (frontend/dist) and exposes /api/chat — the
// offline-fallback runtime for the SiteSurveyor AI agent (primary is the
// `ai-chat` Supabase Edge Function). Both speak identical NDJSON events:
// {"type":"delta"|"final"|"error"|"status", ...}.
//
// Agent engine: the inline streaming NVIDIA NIM core (shared with the cloud
// `ai-chat` Edge Function) so replies stream token-by-token. An opt-in
// OpenClaw Gateway path (openclaw agent --agent sitesurveyor) is available via
// USE_OPENCLAW=1; it is buffered. Configuration via ai-gateway/.env:
//   NVIDIA_API_KEY=nvapi-...      provider key (from build.nvidia.com/settings)
//   SUPABASE_URL=https://<project>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=<service role key>
//
// The useOpenClaw path requires the ambient OpenClaw config (~/.openclaw/
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
const DIST = path.resolve(here, "../frontend/dist");
const MCP_DIST = path.resolve(here, "sitesurveyor-mcp/dist/index.js");

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error(
    `[host] missing ${DIST}/index.html — run "npm run build" inside frontend/ first.`,
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

// OpenClaw is now the agent engine. The NVIDIA/OpenClaw model key is
// resolved from models.ts (single source of truth) so both serve paths agree,
// then delegated to `openclaw agent exec --auth-env-only`.
const { resolveModel, scoreComplexity } = await import(
  pathToFileURL(path.resolve(here, "../backend/supabase/functions/_shared/models.ts")).href
) as typeof import("../backend/supabase/functions/_shared/models.ts");

const { execOpenClawAgent, openClawEvents, buildOpenClawEnv } = await import(
  pathToFileURL(path.resolve(here, "openclaw-runner.ts")).href
) as typeof import("./openclaw-runner.ts");

// Agent engine. Default is the inline streaming NVIDIA NIM core (shared with
// the cloud `ai-chat` Edge Function) so replies stream token-by-token exactly
// like the cloud path. The buffered OpenClaw Gateway path (openclaw agent
// --agent sitesurveyor) remains available via USE_OPENCLAW=1.
const AGENT_CORE = path.resolve(
  here,
  "../backend/supabase/functions/_shared/ai-agent.ts",
);
const useOpenClaw = process.env.USE_OPENCLAW === "1";
const streamRunAgent = fs.existsSync(AGENT_CORE)
  ? (
      await import(pathToFileURL(AGENT_CORE).href)
    ) as typeof import("../backend/supabase/functions/_shared/ai-agent.ts")
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

  // By now the workspace lookup (started above) has long since resolved.
  const workspaceId = await workspacePromise;

  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
  });
  const send = (event: Record<string, unknown>) =>
    res.write(JSON.stringify(event) + "\n");

  let finalText = "";
  try {
    if (useOpenClaw) {
      // Opt-in: delegate the turn to the OpenClaw Gateway (sitesurveyor
      // agent, MCP tools registered in the ambient OpenClaw config). Buffered:
      // the Gateway emits the full result, so a single `final` event is sent
      // when the run completes.
      const env = buildOpenClawEnv({
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        WORKSPACE_ID: workspaceId ?? "",
        NVIDIA_API_KEY,
      });
      const memoryNote = conversation.summary?.trim();
      const messageForAgent = memoryNote
        ? `Prior conversation notes (treat as background, re-verify current state):\n${memoryNote}\n\nUser: ${message}`
        : message;
      const result = await execOpenClawAgent({
        message: messageForAgent,
        model,
        timeoutMs: 300_000,
        env,
      });
      for await (const event of openClawEvents(result)) {
        if (event.type === "final") finalText = String(event.text ?? "");
        send(event);
      }
    } else if (streamRunAgent) {
      // Default: shared streaming NVIDIA NIM core — deltas stream live.
      for await (const event of streamRunAgent.runAgent({
        history,
        userMessage: message,
        nvidiaKey: NVIDIA_API_KEY,
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
  if ((req.url ?? "").split("?")[0] === "/api/chat") {
    void handleChat(req, res);
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
