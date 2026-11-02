import { parseAiStreamLine, readNdjsonLines } from "./aiChatApi.ts";

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const SUPABASE_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  "";

/** Message cap, mirrored by the `market-chat` endpoint (400 above it). */
export const MARKET_MAX_MESSAGE_CHARS = 2_000;

/** One prior turn of the anonymous concierge conversation. */
export interface MarketChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface MarketStreamHandlers {
  /** Incremental reply text as it streams. */
  onDelta: (text: string) => void;
  /** Called once with the complete reply. */
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  /** Agent activity for the thinking indicator ("thinking" | tool name). */
  onActivity?: (label: string | null) => void;
}

/**
 * Streams one reply from the public market concierge — the anonymous,
 * read-only Nemotron agent behind the /market chat panel. No session is
 * required: the caller keeps `history` in memory and the endpoint applies
 * its own per-IP rate limit.
 *
 * Primary transport is the `market-chat` Supabase Edge Function; when that
 * is unreachable the same-origin host-server `/api/market-chat` route is
 * tried. Both speak identical NDJSON events:
 * {"type":"delta"|"final"|"error"|"tool"|"status", ...}.
 */
export async function streamMarketReply(
  message: string,
  history: MarketChatTurn[],
  handlers: MarketStreamHandlers,
): Promise<void> {
  const endpoints = [
    `${SUPABASE_URL}/functions/v1/market-chat`,
    "/api/market-chat",
  ];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(SUPABASE_KEY ? { apikey: SUPABASE_KEY } : {}),
  };
  const body = JSON.stringify({ message, history });

  let res: Response | null = null;
  let lastError = "The market concierge is unavailable.";
  for (const url of endpoints) {
    try {
      const attempt = await fetch(url, { method: "POST", headers, body });
      if (attempt.ok && attempt.body) {
        res = attempt;
        break;
      }
      const payload = (await attempt.json().catch(() => null)) as
        | { error?: string; retry_after?: number }
        | null;
      // Rate limiting is terminal: both runtimes answer the same way.
      if (attempt.status === 429) {
        const wait = payload?.retry_after;
        handlers.onError(
          typeof wait === "number"
            ? `You're asking quickly — try again in ${wait}s.`
            : (payload?.error ?? "Too many messages — try again in a minute."),
        );
        return;
      }
      // Validation failures are terminal regardless of runtime.
      if ([400, 401, 403].includes(attempt.status)) {
        handlers.onError(payload?.error ?? `Request rejected (${attempt.status}).`);
        return;
      }
      lastError = payload?.error ?? `Concierge runtime returned ${attempt.status}.`;
    } catch (err) {
      lastError = (err as Error).message;
    }
  }

  if (!res?.body) {
    handlers.onError(lastError);
    return;
  }

  let finalText = "";
  let streamError: string | null = null;
  try {
    await readNdjsonLines(res.body, (line) => {
      const event = parseAiStreamLine(line);
      if (!event) return;
      if (event.type === "delta") handlers.onDelta(event.text ?? "");
      else if (event.type === "final") finalText = event.text ?? "";
      else if (event.type === "error") streamError = event.message ?? "Agent error.";
      else if (event.type === "tool") handlers.onActivity?.(event.name ?? null);
      else if (event.type === "status") handlers.onActivity?.(event.phase ?? null);
    });
  } catch (err) {
    streamError = streamError ?? `Stream failed: ${(err as Error).message}`;
  }

  if (streamError) handlers.onError(streamError);
  else if (finalText) handlers.onFinal(finalText);
  else handlers.onError("The concierge returned an empty response.");
}
