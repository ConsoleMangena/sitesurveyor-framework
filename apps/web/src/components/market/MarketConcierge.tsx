import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AlertCircle, Bot, Loader2, SendHorizontal, Sparkles } from "lucide-react";

import { Textarea } from "../ui/textarea.tsx";
import { AiMessageText } from "../../pages/shared/AiMessageText.tsx";
import { cn } from "../../lib/utils.ts";
import {
  MARKET_MAX_MESSAGE_CHARS,
  streamMarketReply,
  type MarketChatTurn,
} from "../../lib/repositories/marketChatApi.ts";

interface MarketMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
}

/** Starter questions that always land on real market rows. */
const SUGGESTIONS = [
  "Total stations for sale",
  "Surveyors available in Harare",
  "Open survey jobs",
  "Training courses with CPD points",
];

/** Friendly labels for agent activity events (thinking / tool names). */
const ACTIVITY_LABELS: Record<string, string> = {
  query_site_data: "Searching the market…",
  count_site_data: "Counting matches…",
  inspect_columns: "Checking the columns…",
  thinking: "Thinking…",
  "wrapping up": "Wrapping up…",
};

function activityLabel(event: string | null): string {
  if (!event) return "Thinking…";
  if (ACTIVITY_LABELS[event]) return ACTIVITY_LABELS[event];
  // Phases arrive as "working (step 2/4)" — one label covers every step.
  return "Searching the market…";
}

/** Three-dot "thinking" indicator, staggered so it reads as motion. */
function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="size-1.5 animate-pulse rounded-full bg-muted-foreground/70"
          style={{ animationDelay: `${index * 160}ms` }}
        />
      ))}
    </span>
  );
}

interface MarketConciergeProps {
  /** Extra classes for layout placement (the page owns the grid). */
  className?: string;
}

/**
 * The public market's read-only AI concierge: an anonymous Nemotron agent
 * that searches live listings, professionals, jobs, firms and training.
 * Sits beside the market map in the hero; the page owns its height so the
 * two panels share one baseline.
 */
export function MarketConcierge({ className }: MarketConciergeProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const stickToBottomRef = useRef(true);
  const idRef = useRef(0);

  const [messages, setMessages] = useState<MarketMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
  }, []);

  // Follow the reply while it streams — unless the visitor scrolled up to
  // read an earlier answer, in which case leave their position alone.
  useEffect(() => {
    if (stickToBottomRef.current) scrollToBottom();
  }, [messages, activity, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    stickToBottomRef.current =
      node.scrollHeight - node.scrollTop - node.clientHeight < 96;
  }, []);

  // Grow the composer with its content instead of a fixed-height box.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight + border, 128)}px`;
  }, [draft]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || streaming) return;
      setError(null);
      setDraft("");
      setStreaming(true);
      setActivity("Thinking…");
      stickToBottomRef.current = true;

      idRef.current += 1;
      const assistantId = `a${idRef.current}`;
      const history: MarketChatTurn[] = messages.map((message) => ({
        role: message.role,
        content: message.text,
      }));
      setMessages((prev) => [
        ...prev,
        { id: `u${idRef.current}`, role: "user", text },
        { id: assistantId, role: "assistant", text: "", streaming: true },
      ]);

      const patchAssistant = (fn: (message: MarketMessage) => MarketMessage) =>
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId ? fn(message) : message,
          ),
        );

      await streamMarketReply(text, history, {
        onDelta: (delta) => patchAssistant((m) => ({ ...m, text: m.text + delta })),
        onActivity: (label) => setActivity(activityLabel(label)),
        onFinal: (final) => {
          patchAssistant((m) => ({ ...m, text: final, streaming: false }));
          setActivity(null);
          setStreaming(false);
        },
        onError: (message) => {
          // An empty bubble helps nobody — drop it and surface the error.
          setMessages((prev) => {
            const kept = prev.filter(
              (m) => !(m.id === assistantId && !m.text.trim()),
            );
            return kept.map((m) =>
              m.id === assistantId ? { ...m, streaming: false } : m,
            );
          });
          setActivity(null);
          setStreaming(false);
          setError(message);
        },
      });
    },
    [messages, streaming],
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(draft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  };

  return (
    <section
      aria-label="Market concierge chat"
      className={cn(
        "flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-card sm:min-h-[460px] lg:min-h-[400px]",
        className,
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-bg text-[var(--web3-brand)]"
            aria-hidden="true"
          >
            <Bot className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="market-map-title truncate text-foreground">
              Market concierge
            </h2>
            <p className="truncate text-micro text-muted-foreground">
              Ask about listings, people, jobs, training
            </p>
          </div>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-background px-2.5 py-1 font-mono text-[11px] font-semibold text-muted-foreground"
          title="The assistant answering you runs on NVIDIA Nemotron"
        >
          <span className="web3-live-dot" aria-hidden="true" />
          Nemotron
        </span>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-label="Conversation with the market concierge"
        aria-busy={streaming}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-1 text-center">
            <span
              className="flex size-10 items-center justify-center rounded-xl border border-border/80 bg-background text-[var(--web3-brand)]"
              aria-hidden="true"
            >
              <Sparkles className="size-5" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                What are you looking for?
              </p>
              <p className="mx-auto max-w-[34ch] text-micro leading-5 text-muted-foreground">
                I search the live market — instruments, people, jobs, firms and
                training.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={streaming}
                  onClick={() => void send(suggestion)}
                  className="min-h-9 rounded-full border border-border/80 bg-background px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent-bg hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            {messages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm leading-6 whitespace-pre-wrap text-primary-foreground">
                    {message.text}
                  </p>
                </div>
              ) : (
                <div key={message.id} className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-border/80 bg-background text-[var(--web3-brand)]"
                    aria-hidden="true"
                  >
                    <Bot className="size-3.5" />
                  </span>
                  <div className="min-w-0 max-w-[92%] rounded-2xl rounded-bl-md border border-border/70 bg-muted/40 px-3.5 py-2 text-foreground">
                    {message.text ? (
                      <AiMessageText text={message.text} />
                    ) : (
                      <p className="flex items-center gap-2 py-0.5 text-sm text-muted-foreground">
                        <ThinkingDots />
                        {activity ?? "Thinking…"}
                      </p>
                    )}
                    {message.streaming && message.text ? (
                      <p className="mt-1.5 flex items-center gap-2 text-micro text-muted-foreground">
                        <ThinkingDots />
                        {activity ?? "Searching the market…"}
                      </p>
                    ) : null}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="shrink-0 border-t border-border/80 px-3 py-3">
        {error ? (
          <p
            role="alert"
            className="mb-2 flex items-start gap-1.5 px-1 text-xs leading-5 text-warning"
          >
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            maxLength={MARKET_MAX_MESSAGE_CHARS}
            placeholder="Ask the concierge…"
            aria-label="Ask the market concierge"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border-border/80 bg-background px-3.5 py-2.5 text-sm leading-6 shadow-none focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/25"
          />
          <button
            type="submit"
            disabled={streaming || !draft.trim()}
            aria-label="Send message"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          >
            {streaming ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <SendHorizontal className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <p className="mt-1.5 px-1 text-micro text-muted-foreground">
          Read-only: it can find anything in the market, but it can’t save or
          book on your behalf.
        </p>
      </form>
    </section>
  );
}
