import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bot,
  Check,
  Loader2,
  MessageSquarePlus,
  PanelLeft,
  Pencil,
  SendHorizontal,
  Trash2,
  User,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import PageLoader from "@/components/PageLoader.tsx";
import { AiMessageText } from "./AiMessageText.tsx";
import { messageMeta, showRowMeta } from "./messageMeta.ts";
import { parseAssistantBlocks } from "@/features/ai/assistantBlocks.ts";
import {
  createAiConversation,
  deleteAiConversation,
  listAiConversations,
  listAiMessages,
  renameAiConversation,
  type AiConversation,
  type AiConversationContext,
} from "../../lib/repositories/aiChats.ts";
import { streamAiReply } from "../../lib/repositories/aiChatApi.ts";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
  created_at?: string;
}

const SUGGESTIONS = [
  "Summarise overdue invoices across workspaces",
  "Which asset calibrations are due within the next 14 days?",
  "How many active projects do we have, by status?",
];

/** Drawing-aware starters shown when a project is open in the CAD workspace. */
const CAD_SUGGESTIONS = [
  "What layers are on this drawing?",
  "How many points does it have, by layer?",
  "Draw a square boundary 40 m per side from N 500000 E 3000000",
  "Add setout points every 10 m along a line from N 500000 E 3000000",
];

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}${Date.now()}-${idCounter}`;
}

/** Available AI models the user may choose from. */
const AI_MODELS: { id: string; label: string; free: boolean }[] = [
  { id: "laguna-s-2.1", label: "Laguna S 2.1", free: true },
  { id: "agnes-2.5-flash", label: "Agnes 2.5 Flash", free: true },
  { id: "agnes-3-flash", label: "Agnes 3 Flash", free: true },
  { id: "stepfun-3.7-flash", label: "StepFun 3.7 Flash", free: true },
  { id: "tencent-hy3-free", label: "Tencent Hy3 Free", free: true },
];
const MODEL_STORAGE_KEY = "sitesurveyor-ai-model";
const DEFAULT_MODEL_ID = AI_MODELS[0].id;

function loadStoredModel(): string {
  try {
    const stored = localStorage.getItem(MODEL_STORAGE_KEY);
    if (stored && AI_MODELS.some((m) => m.id === stored)) return stored;
  } catch { /* ignore */ }
  return DEFAULT_MODEL_ID;
}

/** Friendly labels for agent activity events (thinking / tool names). */
const TOOL_LABELS: Record<string, string> = {
  query_site_data: "Fetching workspace data…",
  count_site_data: "Counting records…",
  inspect_columns: "Inspecting data structure…",
  insert_site_record: "Creating the record…",
  update_site_record: "Applying the change…",
  delete_site_record: "Deleting…",
  get_cad_drawing: "Loading CAD drawing...",
  list_cad_layers: "Reading drawing layers...",
  count_cad_entities: "Counting drawing entities...",
  inspect_cad_entity: "Inspecting entity...",
};

function activityLabel(event: string | null): string {
  if (!event) return "Thinking…";
  return TOOL_LABELS[event] ?? `Working: ${event}…`;
}

interface AssistantPageProps {
  /** Project currently open in the CAD workspace, forwarded to the agent. */
  contextProjectId?: string;
  /** Hide the page header (panel embedding). */
  embedded?: boolean;
  /** Fires when the agent finishes a full reply. */
  onAssistantFinal?: (text: string) => void;
  /**
   * Renders interactive `[CAD]` command cards under an assistant message.
   * When omitted, blocks are simply stripped from the displayed prose.
   */
  renderCadCommands?: (messageText: string) => ReactNode;
  /** Which chat list this page reads/writes — CAD vs dashboard. */
  context?: AiConversationContext;
}

export default function AssistantPage({
  contextProjectId,
  embedded,
  onAssistantFinal,
  renderCadCommands,
  context = "dashboard",
}: AssistantPageProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [booted, setBooted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [selectedModel, setSelectedModel] = useState(loadStoredModel);

  const handleModelChange = useCallback((value: string) => {
    setSelectedModel(value);
    try { localStorage.setItem(MODEL_STORAGE_KEY, value); } catch { /* ignore */ }
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
  }, []);

  const loadConversations = useCallback(async (): Promise<AiConversation[]> => {
    try {
      const rows = await listAiConversations(context);
      setConversations(rows);
      return rows;
    } catch (err) {
      console.error("Failed to load AI conversations", err);
      return [];
    }
  }, [context]);

  const selectConversation = useCallback(
    async (conversation: AiConversation | null) => {
      setActiveId(conversation?.id ?? null);
      activeIdRef.current = conversation?.id ?? null;
      if (!conversation) {
        setMessages([]);
        return;
      }
      try {
        const rows = await listAiMessages(conversation.id);
        setMessages(
          rows.map((m) => ({
            id: nextId("h"),
            role: m.role,
            text: m.content,
            created_at: m.created_at,
          })),
        );
        scrollToBottom();
      } catch {
        setMessages([]);
      }
      setSidebarOpen(false);
    },
    [scrollToBottom],
  );

  const createConversation = useCallback(async () => {
    try {
      const conversation = await createAiConversation(
        `ssai-${
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID().slice(0, 8)
            : Math.random().toString(36).slice(2, 10)
        }`,
        "New chat",
        context,
      );
      await loadConversations();
      await selectConversation(conversation);
    } catch (err) {
      console.error("Failed to create conversation", err);
      setError("Failed to create the chat in your account.");
    }
  }, [loadConversations, selectConversation, context]);

  const deleteConversation = useCallback(
    async (conversation: AiConversation) => {
      if (!window.confirm("Delete this chat? This cannot be undone.")) return;
      try {
        await deleteAiConversation(conversation.id);
      } catch {
        setError("Failed to delete the chat from your account.");
      }
      const remaining = await loadConversations();
      if (activeIdRef.current === conversation.id) {
        await selectConversation(remaining[0] ?? null);
      }
    },
    [loadConversations, selectConversation],
  );

  const renameConversation = useCallback(
    async (conversation: AiConversation, title: string, silent = false) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      setConversations((prev) =>
        prev.map((c) => (c.id === conversation.id ? { ...c, title: trimmed } : c)),
      );
      try {
        await renameAiConversation(conversation.id, trimmed);
      } catch (err) {
        console.error("Failed to rename chat", err);
        if (!silent) setError("Failed to rename the chat.");
      }
      setRenamingId(null);
    },
    [],
  );

  useEffect(() => {
    // Deferred so the effect body never calls setState synchronously
    // (react-hooks/set-state-in-effect).
    let cancelled = false;
    const clear = window.setTimeout(() => {
      if (cancelled) return;
      const boot = async () => {
        const existing = await loadConversations();
        if (cancelled) return;
        setBooted(true);
        if (existing.length > 0) await selectConversation(existing[0]);
        else await createConversation();
      };
      void boot();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(clear);
    };
    // Boot runs once; callbacks are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback(async (override?: string) => {
    const text = (override ?? draft).trim();
    const conversationId = activeIdRef.current;
    if (!text || streaming || !conversationId) return;

    const conversation = conversations.find((c) => c.id === conversationId);
    setDraft("");
    setStreaming(true);
    setActivity(null);
    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: nextId("u"), role: "user", text, created_at: new Date().toISOString() },
    ]);
    scrollToBottom();

    const bumpToTop = () =>
      setConversations((prev) =>
        [...prev]
          .map((c) =>
            c.id === conversationId
              ? { ...c, updated_at: new Date().toISOString() }
              : c,
          )
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      );

    await streamAiReply(conversationId, text, {
      projectId: contextProjectId,
      model: selectedModel !== DEFAULT_MODEL_ID ? selectedModel : undefined,
      onDelta: (delta) => {
        setActivity(null);
        setMessages((prev) => {
          const existing = prev.find((m) => m.id === "live");
          if (!existing)
            return [
              ...prev,
              { id: "live", role: "assistant", text: delta, streaming: true, created_at: new Date().toISOString() },
            ];
          return prev.map((m) =>
            m.id === "live" ? { ...m, text: m.text + delta } : m,
          );
        });
        scrollToBottom();
      },
      onFinal: (finalText) => {
        setActivity(null);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === "live"
              ? { ...m, id: nextId("a"), text: finalText, streaming: false }
              : m,
          ),
        );
        setStreaming(false);
        bumpToTop();
        onAssistantFinal?.(finalText);
        // Server auto-titles an untouched chat after its first message.
        if (conversation?.title === "New chat") {
          void renameConversation(conversation, text.slice(0, 60), true);
        }
        scrollToBottom();
      },
      onError: (message) => {
        setMessages((prev) => prev.filter((m) => m.id !== "live"));
        setActivity(null);
        setError(message);
        setStreaming(false);
      },
    });
  }, [
    draft,
    streaming,
    conversations,
    renameConversation,
    scrollToBottom,
    contextProjectId,
    onAssistantFinal,
  ]);

  const startRename = useCallback((conversation: AiConversation) => {
    setRenamingId(conversation.id);
    setRenameDraft(conversation.title === "New chat" ? "" : conversation.title);
    setSidebarOpen(false);
  }, []);

  const submitRename = useCallback(() => {
    const conversation = conversations.find((c) => c.id === renamingId);
    if (conversation && renameDraft.trim())
      void renameConversation(conversation, renameDraft);
    else setRenamingId(null);
  }, [conversations, renamingId, renameDraft, renameConversation]);

  const conversationList = (
    <div className="flex h-full min-h-0 flex-col">
      <Button
        onClick={() => {
          setSidebarOpen(false);
          void createConversation();
        }}
        className="mx-3 mt-3 justify-start gap-2"
        variant="outline"
      >
        <MessageSquarePlus className="size-4" />
        New chat
      </Button>
      <nav
        aria-label="Chat history"
        className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3"
      >
        {conversations.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No chats yet.
          </p>
        )}
        {conversations.map((conversation) => {
          const isActive = conversation.id === activeId;
          const isRenaming = renamingId === conversation.id;

          return (
            <div
              key={conversation.id}
              className={cnSidebarItem(isActive)}
            >
              {isRenaming ? (
                <form
                  className="flex items-center gap-1 p-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitRename();
                  }}
                >
                  <Input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    aria-label="Chat name"
                    className="h-7 text-xs"
                  />
                  <button
                    type="submit"
                    aria-label="Save name"
                    className="shrink-0 rounded-md p-1 text-emerald-600 hover:bg-muted"
                  >
                    <Check className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel"
                    className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
                    onClick={() => setRenamingId(null)}
                  >
                    <X className="size-3.5" />
                  </button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void selectConversation(conversation)}
                    className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm"
                    title={conversation.title}
                  >
                    {conversation.title}
                  </button>
                  <span className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      type="button"
                      aria-label={`Rename "${conversation.title}"`}
                      className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                      onClick={() => startRename(conversation)}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete "${conversation.title}"`}
                      className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => void deleteConversation(conversation)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );

  const hasLiveText = messages.some((m) => m.id === "live" && m.text.trim());

  return (
    <div className="relative flex h-full min-h-0 gap-4">
      {/* Desktop sidebar — suppressed entirely when embedded in a panel */}
      {!embedded && (
        <aside className="hidden w-64 shrink-0 flex-col rounded-none border border-border/60 bg-card lg:flex">
          <p className="px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Chats
          </p>
          {conversationList}
        </aside>
      )}

      {/* Mobile sidebar drawer */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 max-w-[85vw] p-0 flex flex-col [&>button]:hidden">
          <SheetHeader className="flex flex-row items-center justify-between px-4 pb-1 pt-4 space-y-0 text-left border-b-0">
            <SheetTitle className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Chats
            </SheetTitle>
            <button
              type="button"
              aria-label="Close chat history"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="size-4" />
            </button>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            {conversationList}
          </div>
        </SheetContent>
      </Sheet>

      {/* Chat column */}
      <section className={`flex min-h-0 min-w-0 flex-1 flex-col ${embedded ? "gap-2.5" : "gap-4"}`}>
        {!embedded && (
          <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2">
            <Button
              variant="outline"
              size="icon"
              className="size-8 shrink-0 rounded-none lg:hidden"
              aria-label="Open chat history"
              onClick={() => setSidebarOpen(true)}
            >
              <PanelLeft className="size-4" />
            </Button>
            <div
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center bg-primary/10 text-primary"
            >
              <Bot className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-foreground">
                SiteSurveyor AI agent
              </h1>
              <p className="text-[11px] text-muted-foreground">
                Your surveying reference point — reads and acts on workspace
                data
              </p>
            </div>
          </div>
        )}

        {/* Embedded panels have no page header: expose chat history and
            new-chat as a compact toolbar row instead. */}
        {embedded && (
          <div className="flex shrink-0 items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Chat history"
              title="Chat history"
              onClick={() => setSidebarOpen(true)}
            >
              <PanelLeft className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="New chat"
              title="New chat"
              onClick={() => void createConversation()}
            >
              <MessageSquarePlus className="size-3.5" />
            </Button>
          </div>
        )}

        {error && (
          <div className="rounded-none border border-destructive/50 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        <div
          ref={scrollRef}
          className={`min-h-0 flex-1 overflow-y-auto rounded-lg ${
            embedded
              ? "border border-[var(--cad-border)] bg-[var(--cad-bg-2)]"
              : "border border-border/60 bg-card"
          } ${embedded ? "p-2.5" : "min-h-[280px] p-4"}`}
        >
          {!booted ? (
            <PageLoader compact />
          ) : messages.length === 0 ? (
            <div className={`flex h-full flex-col items-center justify-center gap-3 py-8 text-center ${embedded ? "px-1" : ""}`}>
              <div
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: "var(--cad-accent-bg)",
                  color: "var(--cad-accent)",
                }}
              >
                <Bot className={`shrink-0 ${embedded ? "size-5" : "size-6"}`} />
              </div>
              <div className={`${embedded ? "max-w-none" : "max-w-sm"} space-y-1.5`}>
                <p className={`font-semibold text-[var(--cad-text-hi)] ${embedded ? "text-sm" : "text-card-foreground"}`}>
                  {embedded && contextProjectId
                    ? "Ask about this drawing"
                    : "Meet SiteSurveyor — every measurement needs a reference"}
                </p>
                <p className={`text-muted-foreground ${embedded ? "text-xs" : "text-sm"}`}>
                  {embedded
                    ? contextProjectId
                      ? "The agent reads this project's drawing and workspace data, then draws on your approval."
                      : "Reads workspace data and acts on what you approve."
                    : "The agent can query projects, invoices, quotes, assets and the market — then act on what you approve."}
                </p>
              </div>
              <div className={`flex flex-wrap justify-center gap-2 pt-1 ${embedded ? "w-full flex-col items-stretch" : ""}`}>
                {(contextProjectId ? CAD_SUGGESTIONS : SUGGESTIONS).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setDraft(suggestion)}
                    className={`rounded-md border text-left transition-colors hover:bg-[var(--cad-accent-bg)] hover:text-[var(--cad-text-hi)] ${
                      embedded
                        ? "border-[var(--cad-border)] bg-[var(--cad-bg)] px-2.5 py-2 text-[11px] text-[var(--cad-text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cad-accent)]/40"
                        : "border-border/60 bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message, index) => {
                const parsed =
                  message.role === "assistant"
                    ? parseAssistantBlocks(message.text)
                    : null;
                const hasCadRenderer =
                  parsed != null &&
                  parsed.cadBlocks.length > 0 &&
                  renderCadCommands != null;
                // A reply made only of [CAD]/[ASK] blocks has no prose; hide
                // the bubble when its blocks render interactively, otherwise
                // leave a note so the turn never looks like it vanished.
                if (parsed && !parsed.clean && !parsed.ask && !hasCadRenderer) {
                  return (
                    <div key={message.id} className="flex justify-start">
                      <p className={`italic text-muted-foreground ${embedded ? "text-[11px]" : "text-xs"}`}>
                        {parsed.cadBlocks.length > 0
                          ? "(drawing commands — open this chat in the CAD workspace to run them)"
                          : "…"}
                      </p>
                    </div>
                  );
                }
                if (parsed && !parsed.clean && !parsed.ask) {
                  return (
                    <div key={message.id} className="space-y-1.5">
                      {renderCadCommands?.(message.text)}
                    </div>
                  );
                }
                return (
                  <div key={message.id} className="space-y-1.5">
                    {showRowMeta(message.role, messages[index - 1]?.role) && (
                      <div
                        className={`flex items-baseline gap-2 ${
                          message.role === "user" ? "flex-row-reverse" : ""
                        }`}
                      >
                        <span
                          className={`font-semibold text-foreground/80 ${
                            embedded ? "text-[11px]" : "text-xs"
                          }`}
                        >
                          {messageMeta(message.role, message.created_at).label}
                        </span>
                        {messageMeta(message.role, message.created_at)
                          .timeLabel && (
                          <span
                            className={`text-muted-foreground/70 ${
                              embedded ? "text-[9px]" : "text-[10px]"
                            }`}
                          >
                            {
                              messageMeta(
                                message.role,
                                message.created_at,
                              ).timeLabel
                            }
                          </span>
                        )}
                      </div>
                    )}

                    <div
                      className={`flex gap-2.5 ${
                        message.role === "user"
                          ? "flex-row-reverse"
                          : "justify-start"
                      }`}
                    >
                      {message.role === "assistant" ? (
                        <div
                          aria-hidden
                          className={`mt-1 flex shrink-0 items-center justify-center rounded-full border border-border/60 shadow-sm ${
                            embedded ? "size-6" : "size-8"
                          }`}
                          style={{
                            background: "var(--cad-accent-bg)",
                            color: "var(--cad-accent)",
                            flex: "0 0 auto",
                          }}
                        >
                          <Bot
                            className={embedded ? "size-3.5" : "size-4"}
                          />
                        </div>
                      ) : (
                        <div
                          aria-hidden
                          className={`mt-1 flex shrink-0 items-center justify-center rounded-full border border-border/60 bg-primary/10 text-primary shadow-sm ${
                            embedded ? "size-6" : "size-8"
                          }`}
                        >
                          <User
                            className={embedded ? "size-3.5" : "size-4"}
                          />
                        </div>
                      )}
                      <div
                        className={`${
                          embedded
                            ? "max-w-[calc(100%-2rem)] px-3 py-2 text-[13px]"
                            : "max-w-[85%] px-3.5 py-2 text-sm"
                        } leading-relaxed shadow-sm ${
                          message.role === "user"
                            ? "whitespace-pre-wrap rounded-[16px_16px_0_16px] bg-primary text-primary-foreground"
                            : "rounded-[16px_16px_16px_0] border text-card-foreground"
                        } ${
                          embedded && message.role === "assistant"
                            ? "border-[var(--cad-border)] bg-[var(--cad-bg)]"
                            : "border-border/60 bg-muted"
                        }`}
                      >
                        {message.role === "assistant" ? (
                          <AiMessageText text={parsed?.clean ?? message.text} />
                        ) : (
                          message.text
                        )}
                        {message.streaming && (
                          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-none bg-current align-middle" />
                        )}
                      </div>
                    </div>

                    {/* Executable drawing commands, rendered in the flow of
                        the message that proposed them. */}
                    {parsed && parsed.cadBlocks.length > 0 && renderCadCommands?.(message.text)}

                    {/* Clarifying question with quick-reply options. */}
                    {parsed?.ask && !message.streaming && (
                      <div className={`flex ${embedded ? "justify-start" : "justify-start"}`}>
                        <div className="max-w-[92%] rounded-none border border-primary/25 bg-primary/5 px-3 py-2">
                          <p className="text-xs font-medium text-card-foreground">
                            {parsed.ask.question}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {parsed.ask.options.map((option) => (
                              <button
                                key={option}
                                type="button"
                                disabled={streaming}
                                onClick={() => void send(option)}
                                className="rounded-none border border-border/70 bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground disabled:opacity-50"
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Thinking skeleton: shown while the agent works before any
                  reply text streams, with live tool activity underneath once
                  partial output exists. */}
              {streaming && !hasLiveText && (
                <div className="flex justify-start gap-2">
                  {
                    <div
                      aria-hidden
                      className={`mt-1 flex shrink-0 items-center justify-center rounded-full border border-border/60 shadow-sm ${
                        embedded ? "size-6" : "size-8"
                      }`}
                      style={{
                        background: "var(--cad-accent-bg)",
                        color: "var(--cad-accent)",
                        flex: "0 0 auto",
                      }}
                    >
                      <Bot className={embedded ? "size-3.5" : "size-4"} />
                    </div>
                  }
                  <div className={embedded ? "max-w-[calc(100%-2rem)] space-y-2.5 rounded-[16px_16px_16px_0] border border-[var(--cad-border)] bg-[var(--cad-bg)] px-3.5 py-3" : "max-w-[85%] space-y-2.5 rounded-[16px_16px_16px_0] border border-border/60 bg-muted px-3.5 py-3 shadow-sm"}>
                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      {activityLabel(activity)}
                    </div>
                    <div className="space-y-1.5 pt-0.5" aria-hidden>
                      <div className="h-3 w-[82%] animate-pulse rounded-sm bg-muted-foreground/15" />
                      <div className="h-3 w-[64%] animate-pulse rounded-sm bg-muted-foreground/15 [animation-delay:150ms]" />
                      <div className="h-3 w-[42%] animate-pulse rounded-sm bg-muted-foreground/15 [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}
              {streaming && hasLiveText && activity && (
                <div className="flex justify-start">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--cad-border)] bg-[var(--cad-bg)] px-2.5 py-1 text-[11px] text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    {activityLabel(activity)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          {/* Model selector row */}
          <div className="flex items-center gap-1.5">
            <Bot className={`size-3.5 shrink-0 text-muted-foreground ${embedded ? "text-[var(--cad-text-dim)]" : ""}`} />
            <Select value={selectedModel} onValueChange={handleModelChange}>
              <SelectTrigger
                className={`w-auto min-w-[140px] gap-1.5 rounded-none ${
                  embedded
                    ? "h-7 border-[var(--cad-border)] bg-[var(--cad-panel)] text-[11px] text-[var(--cad-text)]"
                    : "border-border/50 bg-muted/40 h-8 text-xs"
                }`}
                aria-label="Select AI model"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {m.label}
                    {m.free && (
                      <span className="ml-1.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                        free
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <form
            className={`flex items-center gap-2 rounded-none border border-input bg-card p-2 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15 ${
              embedded
                ? "border-[var(--cad-border)] bg-[var(--cad-bg)] focus-within:border-[var(--cad-accent)] focus-within:ring-[var(--cad-accent)]/30"
                : ""
            }`}
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                streaming
                  ? "SiteSurveyor is thinking…"
                  : embedded && contextProjectId
                    ? "Ask about this drawing…"
                    : "Tell SiteSurveyor what to do…"
              }
              disabled={streaming}
              className={`flex-1 bg-transparent text-sm focus-visible:outline-hidden ${
                embedded
                  ? "h-7 text-[13px] text-[var(--cad-text)] placeholder:text-[var(--cad-text-dim)]"
                  : "h-8"
              }`}
              aria-label="Message SiteSurveyor"
            />
            <Button
              type="submit"
              size="icon"
              className={`shrink-0 rounded-none ${
                embedded ? "size-8" : "size-9"
              }`}
              disabled={!draft.trim() || streaming}
              aria-label="Send message"
            >
              <SendHorizontal className="size-4" />
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}

/** Sidebar item styling: highlight the active chat, reveal actions on hover. */
function cnSidebarItem(active: boolean): string {
  return [
    "group flex items-center rounded-none text-sm",
    active
      ? "bg-primary/10 text-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  ].join(" ");
}
