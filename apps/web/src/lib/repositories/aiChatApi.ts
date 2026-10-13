import { supabase } from "../supabase/client.ts";

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";

export interface AiStreamHandlers {
  /** Incremental reply text as it streams. */
  onDelta: (text: string) => void;
  /** Called once with the complete reply. */
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  /** Agent activity for the thinking indicator ("thinking" | tool name). */
  onActivity?: (label: string | null) => void;
  /** Project open in the CAD workspace, forwarded to the agent. */
  projectId?: string;
  /** Override the default LLM model (must be in the server allowlist). */
  model?: string;
}

/**
 * Streams one agent reply for a conversation.
 *
 * Primary transport is the Supabase Edge Function (`ai-chat`); if that is
 * unreachable the same-origin host-server `/api/chat` route is tried. Both
 * speak identical NDJSON events: {"type":"delta"|"final"|"error", ...}.
 *
 * Persistence (user turn, assistant turn, auto-title, timestamps) happens
 * server-side in both runtimes.
 */
export async function streamAiReply(
  conversationId: string,
  message: string,
  handlers: AiStreamHandlers,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    handlers.onError("Sign in to use the AI chat.");
    return;
  }

  const endpoints = [
    `${SUPABASE_URL}/functions/v1/ai-chat`,
    "/api/chat",
  ];
  const SUPABASE_KEY =
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
    "";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(SUPABASE_KEY ? { apikey: SUPABASE_KEY } : {}),
  };
  const { projectId, model } = handlers;
  const body = JSON.stringify({
    conversation_id: conversationId,
    message,
    ...(projectId ? { project_id: projectId } : {}),
    ...(model ? { model } : {}),
  });

  let res: Response | null = null;
  let lastError = "The AI service is unavailable.";
  for (const url of endpoints) {
    try {
      const attempt = await fetch(url, { method: "POST", headers, body });
      if (attempt.ok && attempt.body) {
        res = attempt;
        break;
      }
      const payload = (await attempt.json().catch(() => null)) as
        | { error?: string }
        | null;
      // Auth/validation failures are terminal regardless of runtime.
      if ([400, 401, 403].includes(attempt.status)) {
        handlers.onError(payload?.error ?? `Request rejected (${attempt.status}).`);
        return;
      }
      lastError = payload?.error ?? `AI runtime returned ${attempt.status}.`;
    } catch (err) {
      lastError = (err as Error).message;
    }
  }

  if (!res?.body) {
    handlers.onError(lastError);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalText = "";
  let streamError: string | null = null;

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: { type?: string; text?: string; message?: string; name?: string; phase?: string };
    try {
      event = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (event.type === "delta") handlers.onDelta(event.text ?? "");
    else if (event.type === "final") finalText = event.text ?? "";
    else if (event.type === "error") streamError = event.message ?? "Agent error.";
    else if (event.type === "tool") handlers.onActivity?.(event.name ?? null);
    else if (event.type === "status") handlers.onActivity?.(event.phase ?? null);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        consumeLine(line);
      }
    }
    if (buffer.trim()) consumeLine(buffer);
  } catch (err) {
    streamError = streamError ?? `Stream failed: ${(err as Error).message}`;
  }

  if (streamError) handlers.onError(streamError);
  else if (finalText) handlers.onFinal(finalText);
  else handlers.onError("The agent returned an empty response.");
}
