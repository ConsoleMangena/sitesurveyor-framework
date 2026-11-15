import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderPlus,
  Globe,
  Loader2,
  MessageSquarePlus,
  PanelLeft,
  Pencil,
  Receipt,
  SendHorizontal,
  Trash2,
  User,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import PageLoader from "@/components/PageLoader.tsx";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";
import { BrandMark } from "@/components/brand/BrandMark.tsx";
import { AiMessageText } from "./AiMessageText.tsx";
import { messageMeta, showRowMeta } from "./messageMeta.ts";
import { parseAssistantBlocks } from "@/features/ai/assistantBlocks.ts";
import { cn } from "@/lib/utils.ts";
import {
  createAiConversation,
  deleteAiConversation,
  listAiConversations,
  listAiMessages,
  renameAiConversation,
  type AiConversation,
} from "../../lib/repositories/aiChats.ts";
import { streamAiReply } from "../../lib/repositories/aiChatApi.ts";
import { SLASH_COMMANDS } from "@/features/ai/slashCommands.ts";
import {
  clearAiSurveyContext,
  readAiSurveyContext,
  type AiSurveyContext,
} from "@/features/ai/surveyHandover.ts";

export interface AssistantPageProps {
  /** Full workspace navigation; the context record carries deep-link params
   *  such as the workbench handoff (jobId/projectId/runId). */
  onNavigate?: (view: string, context?: Record<string, string>) => void;
  /** The workspace the user is viewing, so surveys and writes land here. */
  workspaceId?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
  created_at?: string;
  /** Workspace actions the agent ran while producing this reply. */
  steps?: AgentStep[];
}

/** One agent activity event; repeats of the same action fold into a count. */
interface AgentStep {
  label: string;
  count: number;
}

/** Empty-state action starters. Each prefills a plain-language request the
 *  agent carries out with a real tool — a writable table or a named workflow —
 *  so the first screen launches work instead of touring features. Clicking
 *  fills the composer without sending, so a credit-spending survey or a record
 *  write is always reviewed before it runs. */
const STARTER_ACTIONS = [
  { label: "Create a quote", prompt: "Create a quote", icon: FileText },
  { label: "Start a project", prompt: "Start a new project", icon: FolderPlus },
  { label: "Schedule a job", prompt: "Schedule a job", icon: CalendarClock },
  { label: "Run a satellite survey", prompt: "Run a satellite survey", icon: Globe },
  { label: "Summarise overdue invoices", prompt: "Summarise overdue invoices", icon: Receipt },
];

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}${Date.now()}-${idCounter}`;
}

/** SiteSurveyor AI runs on one model; the engine name is shown, not chosen. */
const ENGINE_LABEL = "Nemotron 3 Ultra";

/** One line per tool the agent can call, keyed by the name the runtime puts
 *  on its `tool` events. */
const TOOL_LABELS: Record<string, string> = {
  quote_satellite_survey: "Calculating survey quote & coverage",
  launch_satellite_survey: "Deducting credits & launching survey",
  get_satellite_survey_status: "Checking survey progress",
  get_satellite_survey_result: "Reading survey results",

  query_site_data: "Querying workspace data",
  count_site_data: "Counting records",
  inspect_columns: "Checking the table structure",
  insert_site_record: "Creating a record",
  update_site_record: "Updating a record",
  delete_site_record: "Deleting a record",
  close_overdue_invoices: "Closing overdue invoices",
  create_quote_from_line_items: "Building a quote",
  get_cad_drawing: "Reading the drawing",
  list_cad_layers: "Listing drawing layers",
  count_cad_entities: "Counting CAD entities",
  inspect_cad_entity: "Inspecting a CAD entity",
  remember: "Saving a durable fact",
  forget: "Clearing a stored fact",
};

/** Render a raw `tool` or `status` event value as a reader-facing line. */
function activityLabel(raw: string): string {
  const tool = TOOL_LABELS[raw];
  if (tool) return tool;
  const step = /^working \(step (\d+)\/(\d+)\)$/.exec(raw);
  if (step) return `Working — step ${step[1]} of ${step[2]}`;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function stepText(step: AgentStep): string {
  return step.count > 1 ? `${step.label} ×${step.count}` : step.label;
}

const BUBBLE_BASE = "max-w-full px-3.5 py-2 text-sm leading-relaxed shadow-sm";
const BUBBLE_USER = `${BUBBLE_BASE} whitespace-pre-wrap rounded-[16px_16px_0_16px] bg-primary text-primary-foreground`;
const BUBBLE_AGENT = `${BUBBLE_BASE} rounded-[16px_16px_16px_0] border border-border/60 bg-muted text-card-foreground`;

export default function AssistantPage({ onNavigate, workspaceId }: AssistantPageProps = {}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [booted, setBooted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const stepsRef = useRef<AgentStep[]>([]);
  /** Guards the composer while a turn is in flight. */
  const sendingRef = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  /** The survey the workbench handed over, attached until the reader detaches
   *  it. Read once on mount; the key is consumed so a later visit without a
   *  fresh handover does not re-attach an old run. */
  const [surveyContext, setSurveyContext] = useState<AiSurveyContext | null>(
    () => readAiSurveyContext(sessionStorage),
  );

  useEffect(() => {
    clearAiSurveyContext(sessionStorage);
  }, []);

  const query = draft.trim().toLowerCase();
  const isSlash = draft.startsWith("/") && !draft.includes(" ");
  const matchingSlashCommands = isSlash
    ? SLASH_COMMANDS.filter(
        (c) =>
          c.name.toLowerCase().startsWith(query) ||
          (c.alias && c.alias.toLowerCase().startsWith(query)) ||
          c.category.toLowerCase().startsWith(query.slice(1))
      )
    : [];
  const showSlashMenu = isSlash && matchingSlashCommands.length > 0;


  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    });
  }, []);

  const recordStep = useCallback((raw: string) => {
    const label = activityLabel(raw);
    const last = stepsRef.current[stepsRef.current.length - 1];
    stepsRef.current =
      last && last.label === label
        ? [...stepsRef.current.slice(0, -1), { label, count: last.count + 1 }]
        : [...stepsRef.current, { label, count: 1 }];
    setSteps(stepsRef.current);
    scrollToBottom();
  }, [scrollToBottom]);

  const loadConversations = useCallback(async (): Promise<AiConversation[]> => {
    try {
      const rows = await listAiConversations();
      setConversations(rows);
      return rows;
    } catch (err) {
      console.error("Failed to load AI conversations", err);
      return [];
    }
  }, []);

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

  const createConversation = useCallback(async (): Promise<AiConversation | null> => {
    try {
      const conversation = await createAiConversation(
        `ssai-${
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID().slice(0, 8)
            : Math.random().toString(36).slice(2, 10)
        }`,
        "New chat",
      );
      await loadConversations();
      await selectConversation(conversation);
      return conversation;
    } catch (err) {
      console.error("Failed to create conversation", err);
      setError("Failed to create the chat in your account.");
      return null;
    }
  }, [loadConversations, selectConversation]);

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
    if (!text || sendingRef.current) return;
    sendingRef.current = true;

    try {
      // A chat that lost its conversation — a failed boot, a deleted thread —
      // still has to answer.
      let conversationId = activeIdRef.current;
      if (!conversationId) {
        const created = await createConversation();
        conversationId = created?.id ?? null;
        if (!conversationId) {
          setError("Could not start a chat in your account. Try again.");
          return;
        }
      }

      const conversation = conversations.find((c) => c.id === conversationId);
      setDraft("");
      setStreaming(true);
      stepsRef.current = [];
      setSteps([]);
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
        onDelta: (delta) => {
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
          const ran = stepsRef.current;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === "live"
                ? { ...m, id: nextId("a"), text: finalText, streaming: false, steps: ran }
                : m,
            ),
          );
          setStreaming(false);
          setSteps([]);
          bumpToTop();
          // Server auto-titles an untouched chat after its first message.
          if (conversation?.title === "New chat") {
            void renameConversation(conversation, text.slice(0, 60), true);
          }
          scrollToBottom();
        },
        onError: (message) => {
          setMessages((prev) => prev.filter((m) => m.id !== "live"));
          stepsRef.current = [];
          setSteps([]);
          setError(message);
          setStreaming(false);
        },
        onActivity: (raw) => {
          if (raw) recordStep(raw);
        },
        workspaceId,
        surveyRunId: surveyContext?.runId,
      });
    } finally {
      // The composer never stays locked on a turn that ended.
      sendingRef.current = false;
      setStreaming(false);
    }
  }, [
    draft,
    conversations,
    createConversation,
    renameConversation,
    scrollToBottom,
    recordStep,
    surveyContext,
    workspaceId,
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
                    className="shrink-0 rounded-md p-1 text-success hover:bg-muted"
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
                    className="min-w-0 flex-1 truncate rounded-md px-2 py-2 text-left text-sm"
                    title={conversation.title}
                  >
                    {conversation.title}
                  </button>
                  {/* Always visible on touch, where there is no hover to reveal on. */}
                  <span className="flex shrink-0 items-center gap-0.5 pr-1 opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
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
      <aside className="hidden w-64 shrink-0 flex-col rounded-xl border border-border/60 bg-card lg:flex">
        <h2 className="px-4 pb-1 pt-4 text-sm font-semibold tracking-tight text-foreground">
          Chats
        </h2>
        {conversationList}
      </aside>

      {/* Chat history drawer — the sidebar's place on narrow screens */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="left"
          className="flex w-72 max-w-[85vw] flex-col p-0 [&>button]:hidden"
        >
          <SheetHeader className="flex flex-row items-center justify-between space-y-0 border-b-0 px-4 pb-1 pt-4 text-left">
            <SheetTitle className="text-sm font-semibold tracking-tight text-foreground">
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
          <div className="min-h-0 flex-1 overflow-hidden">{conversationList}</div>
        </SheetContent>
      </Sheet>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        <header className="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 lg:hidden"
            aria-label="Open chat history"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeft className="size-4" />
          </Button>
          <BrandMark className="size-9" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
              SiteSurveyor AI
            </h1>
            <p className="truncate text-[11px] text-muted-foreground">
              Run quotes, projects, jobs and satellite surveys by chat
            </p>
          </div>
          <span
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border/50 bg-muted/40 px-2.5 font-mono text-[11px] font-medium text-muted-foreground"
            title="SiteSurveyor AI runs on NVIDIA Nemotron 3 Ultra"
          >
            <span className="web3-live-dot" aria-hidden="true" />
            <span className="hidden sm:inline">{ENGINE_LABEL}</span>
          </span>
        </header>

        {error ? <ErrorNotice tone="danger">{error}</ErrorNotice> : null}

        <div
          ref={scrollRef}
          role="log"
          aria-label="Conversation with SiteSurveyor"
          aria-busy={streaming}
          className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border/60 bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
        >
          {!booted ? (
            <PageLoader compact />
          ) : messages.length === 0 ? (
            <div className="flex flex-col gap-4">
              <div className="flex gap-2.5">
                <BrandMark className="mt-1 size-8" />
                <div className={cn(BUBBLE_AGENT, "max-w-[62ch]")}>
                  <p className="text-[13px] leading-relaxed text-card-foreground">
                    Describe a task and I&apos;ll run it in this workspace — quotes,
                    projects, jobs, invoices, or a satellite survey from a
                    plain-language brief. I verify every record I write, and ask
                    before spending credits or deleting anything.
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5">
                <span aria-hidden className="size-8 shrink-0" />
                <div className="flex min-w-0 flex-wrap gap-2">
                  {STARTER_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => {
                          setDraft(action.prompt);
                          inputRef.current?.focus();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground"
                      >
                        <Icon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                        {action.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message, index) => {
                const isUser = message.role === "user";
                const parsed = isUser
                  ? null
                  : parseAssistantBlocks(message.text);
                const meta = messageMeta(message.role, message.created_at);

                // A reply whose only content so far is a structured block has
                // no prose to show yet — say so instead of printing an ellipsis.
                if (parsed && !parsed.clean && !parsed.ask) {
                  return (
                    <div
                      key={message.id}
                      className="flex items-center gap-2 text-[11px] text-muted-foreground"
                    >
                      <Loader2 className="size-3 animate-spin" />
                      SiteSurveyor is replying…
                    </div>
                  );
                }

                return (
                  <div key={message.id} className="space-y-1.5">
                    {showRowMeta(message.role, messages[index - 1]?.role) && (
                      <div
                        className={`flex items-baseline gap-2 ${
                          isUser ? "flex-row-reverse" : ""
                        }`}
                      >
                        <span className="text-xs font-semibold text-foreground/80">
                          {meta.label}
                        </span>
                        {meta.timeLabel && (
                          <span className="text-[10px] text-muted-foreground/70">
                            {meta.timeLabel}
                          </span>
                        )}
                      </div>
                    )}

                    <div
                      className={`flex gap-2.5 ${
                        isUser ? "flex-row-reverse" : ""
                      }`}
                    >
                      {isUser ? (
                        <div
                          aria-hidden
                          className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
                        >
                          <User className="size-4" />
                        </div>
                      ) : (
                        <BrandMark className="mt-1 size-8" />
                      )}

                      <div
                        className={`flex min-w-0 flex-col gap-1.5 ${
                          isUser ? "items-end" : "items-start"
                        }`}
                      >
                        <div
                          className={cn(
                            "max-w-[85%]",
                            isUser ? BUBBLE_USER : BUBBLE_AGENT,
                          )}
                        >
                          {isUser ? (
                            message.text
                          ) : (
                            <>
                              <AiMessageText text={parsed?.clean ?? message.text} />
                              {message.streaming && (
                                <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
                              )}
                            </>
                          )}
                        </div>

                        {/* Clarifying question with quick-reply options. */}
                        {parsed?.ask && !message.streaming && (
                          <div className="max-w-[85%] rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
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
                                  className="rounded-md border border-border/70 bg-background px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-foreground disabled:opacity-50"
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {message.role === "assistant" &&
                          !message.streaming &&
                          (message.text.includes("survey successfully launched") ||
                            message.text.includes("Survey complete for") ||
                            message.text.includes("Open in Satellite Workbench")) &&
                          onNavigate && (
                            <div className="mt-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1.5 text-xs text-primary hover:text-primary hover:bg-primary/10"
                                onClick={() => {
                                  // The agent echoes a [WORKBENCH ...] line from
                                  // the survey tool result; with it the reader
                                  // lands on that exact run, without it on the
                                  // project picker (pre-handoff replies).
                                  const workbench = parsed?.workbench;
                                  onNavigate("satellite", workbench ? {
                                    ...(workbench.jobId ? { jobId: workbench.jobId } : {}),
                                    ...(workbench.projectId ? { projectId: workbench.projectId } : {}),
                                    ...(workbench.runId ? { runId: workbench.runId } : {}),
                                  } : parsed?.legacyRunId
                                    ? { runId: parsed.legacyRunId }
                                    : undefined);
                                }}
                              >
                                <Globe className="size-3.5 shrink-0" />
                                <span className="hidden sm:inline">Open in Satellite Workbench</span>
                                <span className="sm:hidden">Open Workbench</span>
                              </Button>
                            </div>
                          )}

                        {message.steps && message.steps.length > 0 ? (
                          <StepsDisclosure steps={message.steps} />
                        ) : (
                          message.streaming &&
                          steps.length > 0 && <AgentStepList steps={steps} live />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Before any prose arrives, the turn's real tool activity is
                  the honest placeholder — no invented skeleton text. */}
              {streaming && !hasLiveText && (
                <div className="flex gap-2.5">
                  <BrandMark className="mt-1 size-8" />
                  <div className={cn(BUBBLE_AGENT, "max-w-[85%]")}>
                    {steps.length === 0 ? (
                      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        Thinking…
                      </p>
                    ) : (
                      <AgentStepList steps={steps} live />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="relative">
          {surveyContext && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
              <Globe className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                Survey attached:{" "}
                <span className="font-medium text-foreground">{surveyContext.label}</span>
              </span>
              <button
                type="button"
                aria-label="Detach survey context"
                title="Stop sending this survey as context"
                onClick={() => setSurveyContext(null)}
                className="shrink-0 rounded-md p-1 hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
          {showSlashMenu && (
            <div
              className="absolute bottom-full left-0 z-30 mb-2 w-full max-w-lg rounded-xl border border-border/80 bg-popover/95 p-1.5 shadow-xl backdrop-blur-md"
              role="listbox"
              aria-label="Earth Observation Commands"
            >
              <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase border-b border-border/40 pb-1 mb-1">
                <span className="truncate">EO Questionnaire</span>
                <span className="shrink-0 text-[9px] sm:text-[10px]">Click or Enter</span>
              </div>
              <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto">
                {matchingSlashCommands.map((cmd, idx) => {
                  const isSelected = idx === selectedSlashIndex;
                  return (
                    <button
                      key={cmd.name}
                      type="button"
                      className={cn(
                        "flex flex-col items-start rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                        isSelected
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      onMouseEnter={() => setSelectedSlashIndex(idx)}
                      onClick={() => {
                        setDraft("");
                        void send(cmd.template);
                      }}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="font-mono font-semibold text-foreground">
                          {cmd.name}
                          {cmd.alias ? (
                            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                              (or {cmd.alias})
                            </span>
                          ) : null}
                          <span className="ml-2 font-sans font-medium text-xs text-foreground/80">
                            — {cmd.title}
                          </span>
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground hidden sm:inline">
                          {cmd.example}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                        {cmd.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <form
            className="flex shrink-0 items-center gap-2 rounded-xl border border-input bg-card p-2 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Input
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setSelectedSlashIndex(0);
              }}
              onKeyDown={(e) => {
                if (showSlashMenu && matchingSlashCommands.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSelectedSlashIndex((prev) => (prev + 1) % matchingSlashCommands.length);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSelectedSlashIndex(
                      (prev) => (prev - 1 + matchingSlashCommands.length) % matchingSlashCommands.length
                    );
                  } else if (e.key === "Tab") {
                    e.preventDefault();
                    const chosen = matchingSlashCommands[selectedSlashIndex] || matchingSlashCommands[0];
                    setDraft(chosen.template + " ");
                    inputRef.current?.focus();
                  } else if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const chosen = matchingSlashCommands[selectedSlashIndex] || matchingSlashCommands[0];
                    setDraft("");
                    void send(chosen.template);
                  }
                }
              }}
              placeholder={
                streaming
                  ? "SiteSurveyor is working…"
                  : "Tell SiteSurveyor what to do — or type / for survey commands"
              }
              disabled={streaming}
              className="h-9 flex-1 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
              aria-label="Message SiteSurveyor"
            />
            <Button
              type="submit"
              size="icon"
              className="size-9 shrink-0"
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
    "group flex items-center rounded-md text-sm",
    active
      ? "bg-primary/10 text-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  ].join(" ");
}

/** The workspace actions of the current turn, newest last. */
function AgentStepList({
  steps,
  live,
}: {
  steps: AgentStep[];
  live?: boolean;
}) {
  return (
    <ul className="space-y-1">
      {steps.map((step, index) => (
        <li
          key={`${step.label}-${index}`}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
        >
          {live && index === steps.length - 1 ? (
            <Loader2 className="size-3 shrink-0 animate-spin" />
          ) : (
            <Check className="size-3 shrink-0 text-success" />
          )}
          <span>{stepText(step)}</span>
        </li>
      ))}
    </ul>
  );
}

/** The turn's work, kept out of the reading line until asked for. */
function StepsDisclosure({ steps }: { steps: AgentStep[] }) {
  const [open, setOpen] = useState(false);
  const total = steps.reduce((count, step) => count + step.count, 0);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        {total} {total === 1 ? "step" : "steps"} SiteSurveyor took
      </button>
      {open && (
        <div className="mt-1 border-l border-border/60 pl-3">
          <AgentStepList steps={steps} />
        </div>
      )}
    </div>
  );
}
