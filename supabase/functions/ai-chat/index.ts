// Supabase Edge Function: ai-chat
// POST { Authorization: Bearer <user JWT> }  body: { conversation_id, message }
// Streams NDJSON agent events: {"type":"delta"|"final"|"error", ...}
//
// Primary runtime for the SiteSurveyor AI chat. Works even when the office PC
// is off; the host-server /api/chat route is the offline fallback with the
// same request/response contract.

import { runAgent, summarizeConversationTurns, type ChatTurn } from "../_shared/ai-agent.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NVIDIA_API_KEY = Deno.env.get("NVIDIA_API_KEY")!;

// ALLOWED_MODELS lives in _shared/models.ts (single source of truth for both
// serve paths). It is the hard boundary: unknown values silently fall back to
// the default via resolveModel().
import { resolveModel, scoreComplexity } from "../_shared/models.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface AuthUser {
  id: string;
}

async function authenticate(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string };
  return user.id ? { id: user.id } : null;
}

interface ConversationRow {
  id: string;
  user_id: string;
  title: string;
  session_key: string;
  summary: string | null;
  summary_through: string | null;
  context: string | null;
}

async function rest<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; json: T | null }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
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
  return { ok: res.ok, status: res.status, json: json as T | null };
}

// ── AI credit accounting ───────────────────────────────────────────────────
// One reply = one `ai.chat` charge against the workspace ledger. The client
// sends a per-turn id so a retried request re-uses the same ledger row instead
// of spending twice; the RPC is idempotent on (workspace, operation_id).
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
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
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

type Charge = { ok: true } | { ok: false; status: number; error: string };

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
  console.error(`[ai-chat] credit charge failed: ${res.status} ${res.message}`);
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
    console.error(`[ai-chat] credit refund failed for ${operationId}: ${res.status} ${res.message}`);
  }
}

// ── Rolling conversation memory ───────────────────────────────────────────
const SUMMARY_MIN_PENDING = 8; // don't spend a call on fewer new turns
const SUMMARY_BATCH = 10; // oldest-first cap per refresh

async function refreshConversationSummary(
  conversationId: string,
  currentSummary: string,
  throughIso: string | null,
): Promise<void> {
  const path =
    `ai_messages?conversation_id=eq.${conversationId}` +
    (throughIso ? `&created_at=gt.${encodeURIComponent(throughIso)}` : "") +
    `&select=role,content,created_at&order=created_at.asc&limit=${SUMMARY_BATCH}`;
  const res = await rest<
    { role: "user" | "assistant"; content: string; created_at: string }[]
  >("GET", path);
  const rows = (res.json ?? []).filter(
    (r) => r.role === "user" || r.role === "assistant",
  );
  if (rows.length < SUMMARY_MIN_PENDING) return;
  const batch = rows.slice(0, SUMMARY_BATCH);
  const summary = await summarizeConversationTurns({
    nvidiaApiKey: NVIDIA_API_KEY,
    priorSummary: currentSummary,
    turns: batch.map(({ role, content }) => ({ role, content })),
  });
  if (!summary) return; // best-effort; retried on a later turn
  await rest("PATCH", `ai_conversations?id=eq.${conversationId}`, {
    summary,
    summary_through: batch[batch.length - 1].created_at,
  });
}

function scheduleSummaryRefresh(
  conversationId: string,
  currentSummary: string,
  throughIso: string | null,
): void {
  const task = refreshConversationSummary(conversationId, currentSummary, throughIso);
  const runtime = (
    globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }
  ).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task);
  else void task.catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Use POST." });
  }

  let body: {
    conversation_id?: string;
    message?: string;
    project_id?: string;
    survey_run_id?: string;
    model?: string;
    turn_id?: string;
  };
  try {
    body = (await req.json()) as {
      conversation_id?: string;
      message?: string;
      project_id?: string;
      survey_run_id?: string;
      model?: string;
      turn_id?: string;
    };
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const conversationId = String(body.conversation_id ?? "");
  const message = String(body.message ?? "").trim();
  if (!conversationId || !message) {
    return json(400, { error: "conversation_id and message are required." });
  }
  // Optional CAD-workspace context: ignore malformed values silently.
  const rawProjectId = typeof body.project_id === "string"
    ? body.project_id.trim()
    : "";
  const projectId = /^[0-9a-f-]{36}$/i.test(rawProjectId)
    ? rawProjectId
    : undefined;
  // Optional workbench context: the survey run the user has open.
  const rawSurveyRunId = typeof body.survey_run_id === "string"
    ? body.survey_run_id.trim()
    : "";
  const surveyRunId = /^[0-9a-f-]{36}$/i.test(rawSurveyRunId)
    ? rawSurveyRunId
    : undefined;
  // Validate model against allowlist; unknown values silently fall back.
  // Then apply task-complexity routing: complex multi-step tasks escalate to a
  // stronger (still free) model so the weakest model doesn't carry them.
  const rawModel = typeof body.model === "string" ? body.model.trim() : "";
  const complexity = scoreComplexity(message, 0);
  const model = resolveModel(rawModel || undefined, complexity);

  // Auth and conversation lookup are independent — race them together.
  const [user, convRes] = await Promise.all([
    authenticate(req),
    rest<ConversationRow[]>(
      "GET",
      `ai_conversations?id=eq.${conversationId}&select=id,user_id,title,session_key,summary,summary_through,context`,
    ),
  ]);
  if (!user) return json(401, { error: "Sign in to use the AI chat." });
  const conversation = convRes.json?.[0];
  if (!convRes.ok || !conversation) {
    return json(convRes.status === 401 ? 401 : 404, {
      error: "Conversation not found.",
    });
  }
  if (conversation.user_id !== user.id) {
    return json(403, { error: "This chat belongs to another account." });
  }

  // Workspace resolution is independent of the turn bookkeeping below.
  const workspacePromise = (async () => {
    const profileRes = await rest<{ default_workspace_id: string | null }[]>(
      "GET",
      `profiles?id=eq.${user.id}&select=default_workspace_id`,
    );
    let wsId = profileRes.json?.[0]?.default_workspace_id ?? null;
    if (!wsId) {
      const memberRes = await rest<{ workspace_id: string }[]>(
        "GET",
        `workspace_members?user_id=eq.${user.id}&status=eq.active&select=workspace_id&order=created_at.asc&limit=1`,
      );
      wsId = memberRes.json?.[0]?.workspace_id ?? null;
    }
    return wsId;
  })();

  // Bill the turn before anything is persisted, so a rejected request leaves
  // no orphan user message behind.
  const workspaceId = await workspacePromise;
  const rawTurnId = typeof body.turn_id === "string" ? body.turn_id.trim() : "";
  const turnId = /^[A-Za-z0-9_-]{8,160}$/.test(rawTurnId)
    ? rawTurnId
    : crypto.randomUUID();
  const operationId = await turnOperationId(turnId, message);
  // A turn with no workspace has no ledger to debit, so it stays unbilled.
  const billableWorkspaceId = workspaceId;
  if (billableWorkspaceId) {
    const charge = await chargeAiTurn(billableWorkspaceId, user.id, operationId, message);
    if (!charge.ok) return json(charge.status, { error: charge.error });
  }

  // Persist the user turn first so history survives any failure below.
  await rest("POST", "ai_messages", {
    conversation_id: conversation.id,
    user_id: user.id,
    role: "user",
    content: message,
  });

  // Title/timestamp patch and history load are independent of each other
  // (history only depends on the insert above). Fetch a few more than
  // MAX_HISTORY_TURNS so the live turn can be sliced off.
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (conversation.title === "New chat") {
    patch.title = message.slice(0, 60);
  }
  const [, historyRes] = await Promise.all([
    rest("PATCH", `ai_conversations?id=eq.${conversation.id}`, patch),
    rest<{ role: "user" | "assistant"; content: string }[]>(
      "GET",
      `ai_messages?conversation_id=eq.${conversation.id}&select=role,content&order=created_at.asc&limit=18`,
    ),
  ]);
  const priorRows = historyRes.json ?? [];
  // Drop the row we just inserted from history (it is the live turn).
  const history: ChatTurn[] = priorRows
    .slice(0, -1)
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row) => ({ role: row.role, content: row.content }));

  // Stream agent events as NDJSON lines.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      let finalText = "";
      try {
        for await (const event of runAgent({
          history,
          userMessage: message,
          nvidiaApiKey: NVIDIA_API_KEY,
          supabaseUrl: SUPABASE_URL,
          serviceKey: SERVICE_ROLE_KEY,
          workspaceId: workspaceId ?? undefined,
          projectId,
          surveyRunId,
          memoryNote: conversation.summary?.trim() || undefined,
          model,
          userId: user.id,
          conversationId: conversation.id,
          context: conversation.context ?? "dashboard",
        })) {
          if (event.type === "final") finalText = event.text;
          send(event);
        }
        if (finalText.trim()) {
          await rest("POST", "ai_messages", {
            conversation_id: conversation.id,
            user_id: user.id,
            role: "assistant",
            content: finalText,
          });
          await rest(
            "PATCH",
            `ai_conversations?id=eq.${conversation.id}`,
            { updated_at: new Date().toISOString() },
          );
          // Fold old turns into rolling memory without blocking the reply.
          scheduleSummaryRefresh(
            conversation.id,
            conversation.summary ?? "",
            conversation.summary_through ?? null,
          );
        } else if (billableWorkspaceId) {
          await refundAiTurn(
            billableWorkspaceId,
            user.id,
            operationId,
            "The agent returned no reply.",
          );
        }
      } catch (err) {
        if (billableWorkspaceId) {
          await refundAiTurn(billableWorkspaceId, user.id, operationId, (err as Error).message);
        }
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
