import { supabase } from "../supabase/client.ts";
import { generateLocalId } from "../localDb/utils.ts";

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";

/** One parsed NDJSON event from either AI runtime. */
export interface AiStreamEvent {
  type?: string;
  text?: string;
  message?: string;
  name?: string;
  phase?: string;
}

/** Parse a single NDJSON line; unparseable lines are ignored (null). */
export function parseAiStreamLine(line: string): AiStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as AiStreamEvent;
  } catch {
    return null;
  }
}

/** A stalled runtime must not hold the composer open forever. */
export const AI_STREAM_IDLE_TIMEOUT_MS = 60_000;
/** Hard ceiling for one turn, however chatty the agent is. */
export const AI_STREAM_MAX_DURATION_MS = 10 * 60_000;
/** How long a runtime may take to answer the request at all. */
export const AI_STREAM_CONNECT_TIMEOUT_MS = 60_000;

const AI_STREAM_TIMEOUT_MESSAGE =
  "The assistant stopped responding. Try again.";

/** Raised when a stream stalls or runs past its ceiling. */
export class AiStreamTimeoutError extends Error {}

/**
 * Read an NDJSON response body line by line, handing each complete line to
 * `onLine`. Shared by the authenticated chat and the public market chat so
 * both runtimes' framing is decoded the same way.
 *
 * `idleTimeoutMs` aborts the stream when the runtime stops sending, so a
 * half-open connection cannot leave the caller waiting forever.
 */
export async function readNdjsonLines(
  body: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
  options: {
    controller?: AbortController;
    idleTimeoutMs?: number;
  } = {},
): Promise<void> {
  const { controller, idleTimeoutMs = 0 } = options;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const read = reader.read();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const { done, value } =
        idleTimeoutMs > 0
          ? await Promise.race([
              read,
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  controller?.abort();
                  reject(new AiStreamTimeoutError(AI_STREAM_TIMEOUT_MESSAGE));
                }, idleTimeoutMs);
              }),
            ])
          : await read;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        onLine(line);
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (controller?.signal.aborted) {
      const reason = controller.signal.reason;
      throw reason instanceof Error
        ? reason
        : new AiStreamTimeoutError(AI_STREAM_TIMEOUT_MESSAGE);
    }
  }
  if (buffer.trim()) onLine(buffer);
}

export interface AiStreamHandlers {
  /** Incremental reply text as it streams. */
  onDelta: (text: string) => void;
  /** Called once with the complete reply. */
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  /** Agent activity for the thinking indicator ("thinking" | tool name). */
  onActivity?: (label: string | null) => void;
  /** Project context forwarded to the agent. */
  projectId?: string;
  /** Earth Observation survey run the user has open in the workbench. */
  surveyRunId?: string;
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
  const { projectId, model, surveyRunId } = handlers;
  const body = JSON.stringify({
    conversation_id: conversationId,
    message,
    // Lets the server bill this turn idempotently across both runtimes.
    turn_id: generateLocalId(),
    ...(projectId ? { project_id: projectId } : {}),
    ...(surveyRunId ? { survey_run_id: surveyRunId } : {}),
    ...(model ? { model } : {}),
  });

  let res: Response | null = null;
  let controller: AbortController | null = null;
  let lastError = "The AI service is unavailable.";
  for (const url of endpoints) {
    const attemptController = new AbortController();
    const connectTimer = setTimeout(
      () => attemptController.abort(),
      AI_STREAM_CONNECT_TIMEOUT_MS,
    );
    try {
      const attempt = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: attemptController.signal,
      });
      if (attempt.ok && attempt.body) {
        res = attempt;
        controller = attemptController;
        break;
      }
      const payload = (await attempt.json().catch(() => null)) as
        | { error?: string }
        | null;
      // Auth, validation and credit rejections are terminal regardless of
      // runtime — retrying the fallback would only re-attempt a refused charge.
      if ([400, 401, 402, 403].includes(attempt.status)) {
        handlers.onError(payload?.error ?? `Request rejected (${attempt.status}).`);
        return;
      }
      lastError = payload?.error ?? `AI runtime returned ${attempt.status}.`;
    } catch (err) {
      lastError = (err as Error).message;
    } finally {
      clearTimeout(connectTimer);
    }
  }

  if (!res?.body || !controller) {
    handlers.onError(lastError);
    return;
  }

  const reader = res.body;
  let finalText = "";
  let streamError: string | null = null;

  const consumeLine = (line: string) => {
    const event = parseAiStreamLine(line);
    if (!event) return;
    if (event.type === "delta") handlers.onDelta(event.text ?? "");
    else if (event.type === "final") finalText = event.text ?? "";
    else if (event.type === "error") streamError = event.message ?? "Agent error.";
    else if (event.type === "tool") handlers.onActivity?.(event.name ?? null);
    else if (event.type === "status") handlers.onActivity?.(event.phase ?? null);
  };

  const maxTimer = setTimeout(
    () =>
      controller?.abort(
        new AiStreamTimeoutError("The assistant took too long to answer."),
      ),
    AI_STREAM_MAX_DURATION_MS,
  );

  try {
    await readNdjsonLines(reader, consumeLine, {
      controller,
      idleTimeoutMs: AI_STREAM_IDLE_TIMEOUT_MS,
    });
  } catch (err) {
    if (!streamError) {
      streamError =
        err instanceof AiStreamTimeoutError
          ? err.message
          : `Stream failed: ${(err as Error)?.message ?? "unknown error"}`;
    }
  } finally {
    clearTimeout(maxTimer);
  }

  if (streamError) handlers.onError(streamError);
  else if (finalText) handlers.onFinal(finalText);
  else handlers.onError("The agent returned an empty response.");
}
