import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ImagePlus,
  Loader2,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Reply,
  Send,
  Trash2,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Avatar, AvatarFallback } from "@/components/ui/avatar.tsx";
import { ChatRoster } from "./ChatRoster.tsx";
import {
  listChatMessages,
  sendChatMessage,
  deleteChatMessage,
  editChatMessage,
  subscribeWorkspaceChat,
  subscribeChatTyping,
  type ChatMessage,
} from "../../lib/repositories/chat.ts";
import {
  listWorkspaceMembers,
  type WorkspaceMemberWithProfile,
} from "../../lib/repositories/workspaceMembers.ts";
import { notifyChatMessage } from "../../lib/repositories/notificationEvents.ts";
import { markChatNotificationsRead } from "../../lib/repositories/notifications.ts";
import { getCurrentUser } from "../../lib/auth/session.ts";
import { AiMessageText } from "./AiMessageText.tsx";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TeamChatPageProps {
  workspaceId: string;
  workspaceName?: string;
  canModerate?: boolean;
}

const NEAR_BOTTOM_PX = 80;
const MAX_MESSAGE_LENGTH = 2000;
/** Messages from the same sender within this window render as one group. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** Typing broadcast is throttled to this cadence while the user is typing. */
const TYPING_BROADCAST_MS = 1500;
/** Typing state expires this long after the last broadcast. */
const TYPING_TTL_MS = 6000;

/** Deterministic avatar tint per sender so people are easy to tell apart. */
const AVATAR_COLORS = [
  "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
];

function avatarColor(userId: string | null): string {
  if (!userId) return "bg-muted text-muted-foreground";
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

interface MessageBubbleProps {
  msg: ChatMessage;
  isMe: boolean;
  canDelete: boolean;
  canEdit: boolean;
  isHighlighted: boolean;
  onReply: (msg: ChatMessage) => void;
  onDelete: (msg: ChatMessage) => void;
  onStartEdit: (msg: ChatMessage) => void;
  onJumpTo: (msgId: string) => void;
  repliedTo?: ChatMessage | null;
}

function MessageBubble({
  msg,
  isMe,
  canDelete,
  canEdit,
  isHighlighted,
  onReply,
  onDelete,
  onStartEdit,
  onJumpTo,
  repliedTo,
}: MessageBubbleProps) {
  const edited = Boolean(msg.edited_at);
  return (
    <div
      className={cn(
        "rounded-md transition-colors",
        isHighlighted && "bg-primary/10 ring-1 ring-primary/30",
      )}
    >
      {repliedTo && (
        <button
          type="button"
          onClick={() => onJumpTo(repliedTo.id)}
          className={cn(
            "mb-1 flex max-w-[75%] items-center gap-2 rounded-md border-l-2 border-primary/60 bg-muted/40 px-2 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted",
            isMe && "ml-auto",
          )}
          title="Jump to original message"
        >
          <Reply className="h-3 w-3 shrink-0 text-primary/70" />
          <span className="truncate font-medium text-foreground/80">
            {repliedTo.senderName}
          </span>
          <span className="truncate italic">
            {truncate(repliedTo.content, 80)}
          </span>
        </button>
      )}
      <div
        className={cn(
          "min-w-0 whitespace-pre-wrap break-words px-3.5 py-2 text-sm shadow-sm transition-shadow group-hover:shadow-md",
          isMe
            ? "rounded-[16px_16px_0_16px] bg-primary text-primary-foreground"
            : "rounded-[16px_16px_16px_0] bg-muted text-card-foreground",
        )}
      >
        <div className={cn(isMe ? "text-primary-foreground [&_a]:text-primary-foreground" : "")}>
          <AiMessageText text={msg.content} />
        </div>
        {edited && (
          <div
            className={cn(
              "mt-1 text-[10px]",
              isMe ? "text-primary-foreground/70" : "text-muted-foreground/70",
            )}
            title={msg.edited_at ? `Edited ${format(new Date(msg.edited_at), "PPp")}` : undefined}
          >
            (edited)
          </div>
        )}
      </div>
      <div
        className={cn(
          "mt-1 flex items-center gap-0.5",
          isMe ? "justify-end" : "justify-start",
          "opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
          "transition-opacity",
        )}
      >
        <button
          type="button"
          onClick={() => onReply(msg)}
          aria-label="Reply to message"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-muted hover:text-foreground sm:h-6 sm:w-6"
        >
          <Reply className="h-3.5 w-3.5" />
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={() => onStartEdit(msg)}
            aria-label="Edit message"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-muted hover:text-foreground sm:h-6 sm:w-6"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(msg)}
            aria-label="Delete message"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive sm:h-6 sm:w-6"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

interface ReplyBannerProps {
  replyTo: ChatMessage;
  onCancel: () => void;
}

function ReplyBanner({ replyTo, onCancel }: ReplyBannerProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border-l-2 border-primary/60 bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
      <Reply className="h-3 w-3 shrink-0 text-primary/70" />
      <span className="truncate">
        Replying to{" "}
        <span className="font-medium text-foreground/80">{replyTo.senderName}</span>:{" "}
        <span className="italic">{truncate(replyTo.content, 80)}</span>
      </span>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel reply"
        className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-muted hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

interface TypingIndicatorProps {
  names: string[];
}

function TypingIndicator({ names }: TypingIndicatorProps) {
  if (names.length === 0) return null;
  const label =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing`
        : `${names[0]} and ${names.length - 1} others are typing`;
  return (
    <div
      aria-live="polite"
      className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground"
    >
      <span className="flex items-center gap-0.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
      </span>
      <span>{label}…</span>
    </div>
  );
}

export default function TeamChatPage({
  workspaceId,
  workspaceName,
  canModerate,
}: TeamChatPageProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [connected, setConnected] = useState(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [members, setMembers] = useState<WorkspaceMemberWithProfile[]>([]);
  const [rosterSearch, setRosterSearch] = useState("");
  const [showMobileRoster, setShowMobileRoster] = useState(true);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [typingUsers, setTypingUsers] = useState<
    Record<string, { name: string; at: number }>
  >({});
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const nearBottomRef = useRef(true);
  const lastTypingBroadcastRef = useRef(0);

  const lastSeenKey = `chat-last-seen:${workspaceId}`;

  const getViewport = useCallback(
    () =>
      rootRef.current?.querySelector<HTMLDivElement>(
        "[data-radix-scroll-area-viewport]",
      ) ?? null,
    [],
  );

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    setShowJumpToLatest(false);
  }, []);

  const scrollToMessage = useCallback(
    (id: string) => {
      const el = rootRef.current?.querySelector<HTMLElement>(
        `[data-msg-id="${CSS.escape(id)}"]`,
      );
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(id);
      window.setTimeout(() => setHighlightedId(null), 1500);
    },
    [],
  );

  const markSeen = useCallback(() => {
    localStorage.setItem(lastSeenKey, Date.now().toString());
  }, [lastSeenKey]);

  useEffect(() => {
    getCurrentUser().then(setUser);
  }, []);

  // The chat roster mirrors the Team page: workspace members are the people
  // who appear here and are allowed to chat (enforced server-side by RLS).
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    window.setTimeout(() => {
      if (cancelled) return;
      setMembers([]);
    }, 0);
    listWorkspaceMembers(workspaceId, { statuses: ["active", "invited"] })
      .then((rows) => {
        if (!cancelled) setMembers(rows);
      })
      .catch((err) => console.error("Failed to load team members", err));
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const activeMembers = useMemo(
    () => members.filter((m) => m.status === "active"),
    [members],
  );

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;

    const loadMessages = async () => {
      try {
        const page = await listChatMessages(workspaceId);
        if (cancelled) return;
        setMessages(page.messages);
        setHasMore(page.hasMore);
      } catch (err) {
        console.error("Failed to load messages", err);
        if (!cancelled) setError("Failed to load messages.");
      }
    };

    // Deferred so the effect body never calls setState synchronously
    // (react-hooks/set-state-in-effect).
    const clear = window.setTimeout(() => {
      if (cancelled) return;
      setMessages([]);
      setHasMore(false);
      void loadMessages();
    }, 0);

    const unsubscribe = subscribeWorkspaceChat(workspaceId, {
      onInsert: (newMsg) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg].sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime(),
          );
        });
        if (!nearBottomRef.current) {
          setShowJumpToLatest(true);
        }
      },
      onUpdate: (updated) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === updated.id
              ? { ...m, content: updated.content, edited_at: updated.edited_at }
              : m,
          ),
        );
      },
      onDelete: (id) => {
        setMessages((prev) => prev.filter((m) => m.id !== id));
        setReplyTo((cur) => (cur?.id === id ? null : cur));
        setEditingId((cur) => (cur === id ? null : cur));
      },
      onStatus: (ok) => setConnected(ok),
    });

    // Opening the chat page counts as reading it.
    markChatNotificationsRead(workspaceId).catch(() => {});

    return () => {
      cancelled = true;
      window.clearTimeout(clear);
      unsubscribe();
    };
  }, [workspaceId]);

  // Typing indicator channel: broadcast keystrokes, listen for others.
  const typingChannelRef = useRef<ReturnType<typeof subscribeChatTyping> | null>(null);
  useEffect(() => {
    if (!workspaceId || !user) return;
    const me = user.user_metadata?.full_name ?? user.email ?? "Someone";
    const sub = subscribeChatTyping(workspaceId);
    typingChannelRef.current = sub;
    const off = sub.onEvent((ev) => {
      if (ev.userId === user.id) return;
      if (ev.kind === "stop") {
        setTypingUsers((prev) => {
          const next = { ...prev };
          delete next[ev.userId];
          return next;
        });
      } else {
        setTypingUsers((prev) => ({
          ...prev,
          [ev.userId]: { name: ev.name || "Someone", at: Date.now() },
        }));
      }
    });
    return () => {
      off();
      sub.send({ kind: "stop", userId: user.id, name: me });
      sub.unsubscribe();
      if (typingChannelRef.current === sub) typingChannelRef.current = null;
    };
  }, [workspaceId, user]);

  // Prune stale typing entries every TYPING_TTL_MS / 2.
  useEffect(() => {
    const id = window.setInterval(() => {
      setTypingUsers((prev) => {
        const cutoff = Date.now() - TYPING_TTL_MS;
        let changed = false;
        const next: typeof prev = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.at >= cutoff) {
            next[k] = v;
          } else {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, Math.floor(TYPING_TTL_MS / 2));
    return () => window.clearInterval(id);
  }, []);

  // Track whether the user is reading the latest messages so realtime
  // arrivals don't yank the scroll position away from older history.
  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;

    const onScroll = () => {
      const near =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
        NEAR_BOTTOM_PX;
      nearBottomRef.current = near;
      if (near) setShowJumpToLatest(false);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [getViewport]);

  // Auto-scroll on new messages only when already reading the latest;
  // every visit marks the conversation as seen.
  useEffect(() => {
    if (nearBottomRef.current && messages.length > 0) {
      requestAnimationFrame(() => scrollToBottom());
    }
    markSeen();
  }, [messages, scrollToBottom, markSeen]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputValue.trim();
    if (!text || isSending || !user) return;

    setIsSending(true);
    setError(null);

    try {
      const row = await sendChatMessage(workspaceId, text);
      setInputValue("");
      // Append immediately instead of waiting for the realtime echo
      // (which dedupes by id when it arrives).
      const senderName =
        (user.user_metadata?.full_name as string | undefined) ??
        user.email ??
        "You";
      setMessages((prev) =>
        prev.some((m) => m.id === row.id) ? prev : [...prev, { ...row, senderName }],
      );
      nearBottomRef.current = true;
      requestAnimationFrame(() => scrollToBottom("smooth"));
      setReplyTo(null);
      // Fire-and-forget: surface the message in teammates' notification bells.
      void notifyChatMessage({
        workspaceId,
        senderName,
        preview: text,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setIsSending(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    } else if (e.key === "Escape" && replyTo) {
      setReplyTo(null);
    }
  };

  const handleInputChange = (value: string) => {
    setInputValue(value.slice(0, MAX_MESSAGE_LENGTH));
    if (!user) return;
    if (value.trim() === "") {
      const name =
        (user.user_metadata?.full_name as string | undefined) ??
        user.email ??
        "Someone";
      typingChannelRef.current?.send({ kind: "stop", userId: user.id, name });
      return;
    }
    const now = Date.now();
    if (now - lastTypingBroadcastRef.current >= TYPING_BROADCAST_MS) {
      lastTypingBroadcastRef.current = now;
      const name =
        (user.user_metadata?.full_name as string | undefined) ??
        user.email ??
        "Someone";
      typingChannelRef.current?.send({ kind: "typing", userId: user.id, name });
    }
  };

  const handleLoadOlder = async () => {
    if (!hasMore || isLoadingOlder || messages.length === 0) return;
    setIsLoadingOlder(true);
    const viewport = getViewport();
    const prevHeight = viewport?.scrollHeight ?? 0;

    try {
      const page = await listChatMessages(workspaceId, messages[0].created_at);
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...page.messages.filter((m) => !known.has(m.id)), ...prev];
      });
      setHasMore(page.hasMore);
      // Keep the reading position anchored after older messages prepend.
      requestAnimationFrame(() => {
        const vp = getViewport();
        if (vp) vp.scrollTop = vp.scrollHeight - prevHeight;
      });
    } catch {
      setError("Failed to load earlier messages.");
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const handleDelete = async (msg: ChatMessage) => {
    if (!confirm("Delete this message?")) return;
    try {
      await deleteChatMessage(msg.id);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    } catch {
      setError("Failed to delete message.");
    }
  };

  const handleStartEdit = (msg: ChatMessage) => {
    setEditingId(msg.id);
    setEditDraft(msg.content);
    setReplyTo(null);
    window.setTimeout(() => {
      editTextareaRef.current?.focus();
      editTextareaRef.current?.setSelectionRange(msg.content.length, msg.content.length);
    }, 0);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const text = editDraft.trim();
    if (!text) return;
    setIsSavingEdit(true);
    try {
      const updated = await editChatMessage(editingId, text);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === updated.id
            ? { ...m, content: updated.content, edited_at: updated.edited_at }
            : m,
        ),
      );
      setEditingId(null);
      setEditDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save edit.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSaveEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  const handleReply = (msg: ChatMessage) => {
    setReplyTo(msg);
    setEditingId(null);
    composerRef.current?.focus();
  };

  const handleJumpTo = (id: string) => {
    scrollToMessage(id);
  };

  const formatTime = (dateStr: string) => {
    return format(new Date(dateStr), "p");
  };

  const formatDayLabel = (date: Date) => {
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "PPP");
  };

  // When a reply is set, the bubble it references may not be in the loaded
  // window. We resolve the snapshot locally; if it's not found, the reply
  // banner still works and the click is a no-op until the user scrolls back.
  const replySnapshot = replyTo;
  const typingNames = Object.values(typingUsers)
    .map((t) => t.name)
    .filter((n, i, a) => a.indexOf(n) === i);

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border md:flex">
        <ChatRoster
          members={members}
          messages={messages}
          search={rosterSearch}
          onSearchChange={setRosterSearch}
          onJump={scrollToMessage}
          highlightedId={highlightedId}
        />
      </aside>

      {showMobileRoster && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowMobileRoster(false)}
          />
          <div className="absolute inset-y-0 left-0 z-10 flex w-72 flex-col border-r border-border bg-background">
            <ChatRoster
              members={members}
              messages={messages}
              search={rosterSearch}
              onSearchChange={setRosterSearch}
              onJump={(id) => {
                scrollToMessage(id);
                setShowMobileRoster(false);
              }}
              highlightedId={highlightedId}
            />
          </div>
        </div>
      )}

      <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2">
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowMobileRoster(true)}
              className="h-8 w-8 rounded-none"
              aria-label="Back to inbox"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
          <span className="flex size-9 shrink-0 items-center justify-center bg-primary/10 text-primary">
            <MessageSquare className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold text-foreground">
              {workspaceName || "Workspace"}
            </h1>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {connected ? (
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  Live
                </span>
              ) : (
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  Reconnecting…
                </span>
              )}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {activeMembers.length} online
          </span>
        </div>

        {!connected && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
          <WifiOff className="h-3.5 w-3.5" />
          Connection lost — messages will sync once we're back online.
        </div>
      )}

      <div className="relative min-h-[320px] flex-1 rounded-none border border-border/60 bg-card">
        <div ref={rootRef} className="h-full overflow-y-auto">
          <div className="flex flex-col p-4 pb-2">
            {hasMore && (
              <Button
                variant="outline"
                size="sm"
                className="mx-auto mb-4 h-7 rounded-none bg-background/80 px-3 text-[11px] text-muted-foreground backdrop-blur"
                onClick={handleLoadOlder}
                disabled={isLoadingOlder}
              >
                {isLoadingOlder ? (
                  <>
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Loading…
                  </>
                ) : (
                  "Load earlier messages"
                )}
              </Button>
            )}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[100%] border p-3">
                  <MessageSquare className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  No messages yet
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {members.length === 0
                    ? "Add teammates from the Team page to chat together."
                    : "Start the conversation with your team."}
                </p>
              </div>
            )}
            {messages.map((msg, index) => {
              const isMe = msg.user_id === user?.id;
              const msgDate = new Date(msg.created_at);
              const prev = index > 0 ? messages[index - 1] : null;
              const showDaySeparator =
                !prev || !isSameDay(msgDate, new Date(prev.created_at));
              const isGroupStart =
                showDaySeparator ||
                !prev ||
                prev.user_id !== msg.user_id ||
                msgDate.getTime() - new Date(prev.created_at).getTime() >
                  GROUP_WINDOW_MS;
              const canDelete = isMe || (canModerate ?? false);
              const canEdit = isMe;
              const isEditing = editingId === msg.id;
              return (
                <div
                  key={msg.id}
                  data-msg-id={msg.id}
                  className={cn(
                    index === 0
                      ? ""
                      : isGroupStart
                        ? "mt-4"
                        : "mt-0.5"
                  )}
                >
                  {showDaySeparator && (
                    <div className="mb-2 flex items-center gap-3 py-2">
                      <div className="h-px flex-1 bg-border" />
                      <span className="rounded-full border bg-background px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground shadow-sm">
                        {formatDayLabel(msgDate)}
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <div
                    className={cn(
                      "group flex gap-2.5",
                      isMe ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    {isGroupStart ? (
                      <Avatar className="mt-5 h-8 w-8 flex-shrink-0 border shadow-sm">
                        <AvatarFallback
                          className={cn(
                            "text-[10px] font-semibold",
                            isMe
                              ? "bg-primary text-primary-foreground"
                              : avatarColor(msg.user_id)
                          )}
                        >
                          {initials(msg.senderName)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-8 flex-shrink-0" />
                    )}

                    <div className={cn(
                      "flex min-w-0 flex-col max-w-[75%]",
                      isMe ? "items-end" : "items-start"
                    )}>
                      {isGroupStart && (
                        <div
                          className={cn(
                            "mb-1 flex items-baseline gap-2",
                            isMe && "flex-row-reverse"
                          )}
                        >
                          <span className="max-w-[180px] truncate text-xs font-semibold text-foreground/80">
                            {isMe ? "You" : msg.senderName}
                          </span>
                          <span className="text-[10px] text-muted-foreground/70">
                            {formatTime(msg.created_at)}
                          </span>
                        </div>
                      )}

                      <div
                        className={cn(
                          "flex w-full items-stretch gap-1",
                          isMe ? "flex-row-reverse" : "flex-row"
                        )}
                      >
                        {isEditing ? (
                          <div className="flex w-full max-w-full flex-col gap-1.5 rounded-lg border bg-background p-2 shadow-sm">
                            <Textarea
                              ref={editTextareaRef}
                              value={editDraft}
                              onChange={(e) =>
                                setEditDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))
                              }
                              onKeyDown={handleEditKeyDown}
                              rows={2}
                              disabled={isSavingEdit}
                              aria-label="Edit message"
                              className="min-h-[60px] resize-y border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={handleCancelEdit}
                                disabled={isSavingEdit}
                                className="h-7 px-2 text-xs"
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => void handleSaveEdit()}
                                disabled={isSavingEdit || !editDraft.trim()}
                                className="h-7 px-2 text-xs"
                              >
                                {isSavingEdit ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  "Save"
                                )}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <MessageBubble
                            msg={msg}
                            isMe={isMe}
                            canDelete={canDelete}
                            canEdit={canEdit}
                            isHighlighted={highlightedId === msg.id}
                            onReply={handleReply}
                            onDelete={handleDelete}
                            onStartEdit={handleStartEdit}
                            onJumpTo={handleJumpTo}
                            repliedTo={msg.id === replySnapshot?.id ? replySnapshot : null}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </div>

        {showJumpToLatest && (
          <Button
            size="sm"
            variant="secondary"
            className="absolute bottom-3 left-1/2 h-9 -translate-x-1/2 rounded-none px-4 text-xs shadow-lg"
            onClick={() => scrollToBottom("smooth")}
          >
            <ChevronDown className="mr-1 h-3.5 w-3.5" />
            New messages
          </Button>
        )}
      </div>

      <div className="-mt-1 flex h-4 items-center px-1">
        <TypingIndicator names={typingNames} />
      </div>

      <form
        className="space-y-2"
        onSubmit={handleSendMessage}
      >
        {error && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="shrink-0 rounded px-1 py-0.5 font-medium underline-offset-2 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}
        {replySnapshot && (
          <ReplyBanner replyTo={replySnapshot} onCancel={() => setReplyTo(null)} />
        )}
        <div className="flex items-center gap-2 rounded-none border border-input bg-card p-2 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 rounded-none text-muted-foreground lg:inline-flex"
            aria-label="Add files"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 rounded-none text-muted-foreground lg:inline-flex"
            aria-label="Attach image"
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 rounded-none text-muted-foreground lg:inline-flex"
            aria-label="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <input
            ref={composerRef}
            type="text"
            placeholder={
              replySnapshot ? `Reply to ${replySnapshot.senderName}…` : "Type your messages…"
            }
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={isSending}
            aria-label="Chat message"
            className="h-8 w-full flex-1 bg-transparent text-sm focus-visible:outline-hidden"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!inputValue.trim() || isSending}
            aria-label="Send message"
            className="h-9 w-9 shrink-0 rounded-none"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
      <div className="-mt-2 flex items-center justify-between px-1 text-[10px] text-muted-foreground/60">
        <span>
          Enter to send · Shift+Enter for a new line
          {replySnapshot ? " · Esc to cancel reply" : ""}
        </span>
        {inputValue.length > MAX_MESSAGE_LENGTH - 200 && (
          <span
            className={cn(
              inputValue.length >= MAX_MESSAGE_LENGTH &&
                "font-medium text-destructive"
            )}
          >
            {MAX_MESSAGE_LENGTH - inputValue.length} left
          </span>
        )}
      </div>
      </main>
    </div>
  );
}
