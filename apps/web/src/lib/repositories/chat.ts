/**
 * Workspace team chat — list / post / realtime subscribe.
 *
 * One natural channel per workspace (the team room). Security lives in RLS on
 * `chat_messages` (members read/post); realtime is Supabase postgres_changes
 * subscription on the same table — a message inserted by ANY member of the
 * workspace is pushed to every open client within ~50 ms.
 */
import { getCurrentUser } from "../auth/session.ts";
import { supabase } from "../supabase/client.ts";
import type { Tables, TablesInsert } from "../supabase/types.ts";

export type ChatMessageRow = Tables<"chat_messages">;

/** Message with the sender's display identity resolved client-side. */
export interface ChatMessage extends ChatMessageRow {
  senderName: string;
}

const PAGE_SIZE = 60;

export interface ChatPage {
  /** Chronological (oldest → newest) for direct rendering. */
  messages: ChatMessage[];
  /** True when older messages exist before this page. */
  hasMore: boolean;
}

/**
 * Load a page of messages. Pass `before` (the `created_at` of the oldest
 * message currently loaded) to fetch the previous page.
 */
export async function listChatMessages(
  workspaceId: string,
  before?: string,
): Promise<ChatPage> {
  let query = supabase
    .from("chat_messages")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (before) {
    query = query.lt("created_at", before);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const messages = await attachNames(page.reverse());
  return { messages, hasMore };
}

/** Post a message as the signed-in user. */
export async function sendChatMessage(workspaceId: string, content: string): Promise<ChatMessageRow> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to chat.");
  const text = content.trim();
  if (!text) throw new Error("Message cannot be empty.");
  if (text.length > 2000) throw new Error("Message is too long (max 2000 characters).");

  const insert: TablesInsert<"chat_messages"> = {
    workspace_id: workspaceId,
    user_id: user.id,
    content: text,
  };
  const { data, error } = await supabase
    .from("chat_messages")
    .insert(insert)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** Members may retract their own messages; managers may moderate. */
export async function deleteChatMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_messages")
    .delete()
    .eq("id", messageId);
  if (error) throw error;
}

/**
 * Edit a message you authored. RLS permits the author to update their own row;
 * we also stamp `edited_at` so the UI can show "(edited)". Returns the updated
 * row so optimistic UI can reconcile without a refetch.
 */
export async function editChatMessage(
  messageId: string,
  content: string,
): Promise<ChatMessageRow> {
  const text = content.trim();
  if (!text) throw new Error("Message cannot be empty.");
  if (text.length > 2000) throw new Error("Message is too long (max 2000 characters).");
  const { data, error } = await supabase
    .from("chat_messages")
    .update({ content: text, edited_at: new Date().toISOString() })
    .eq("id", messageId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export interface ChatSubscriptionHandlers {
  /** New message in the room (sender identity resolved). */
  onInsert: (message: ChatMessage) => void;
  /** A message was deleted (own retraction or moderator action). */
  onDelete?: (messageId: string) => void;
  /** A message was edited (content and/or edited_at changed). */
  onUpdate?: (message: ChatMessage) => void;
  /** Realtime connection status — lets the UI surface reconnects. */
  onStatus?: (connected: boolean) => void;
}

/**
 * Subscribe to postgres_changes on this workspace's room. Returns an
 * unsubscribe function. INSERTs arrive with the sender identity attached;
 * UPDATEs arrive with the same identity resolution; DELETEs arrive as ids
 * (the caller drops ones it doesn't hold).
 */
export function subscribeWorkspaceChat(
  workspaceId: string,
  handlers: ChatSubscriptionHandlers,
): () => void {
  const channel = supabase
    .channel(`chat:${workspaceId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `workspace_id=eq.${workspaceId}`,
      },
      (payload) => {
        void attachNames([payload.new as ChatMessageRow]).then(([msg]) => {
          if (msg) handlers.onInsert(msg);
        });
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "chat_messages",
        filter: `workspace_id=eq.${workspaceId}`,
      },
      (payload) => {
        void attachNames([payload.new as ChatMessageRow]).then(([msg]) => {
          if (msg && handlers.onUpdate) handlers.onUpdate(msg);
        });
      },
    )
    .on(
      "postgres_changes",
      // DELETE payloads only carry the primary key (default replica
      // identity), so we cannot filter by workspace here. The caller simply
      // ignores ids it doesn't have — RLS keeps the data itself scoped.
      { event: "DELETE", schema: "public", table: "chat_messages" },
      (payload) => {
        const id = (payload.old as Partial<ChatMessageRow>)?.id;
        if (id && handlers.onDelete) handlers.onDelete(id);
      },
    )
    .subscribe((status) => {
      if (!handlers.onStatus) return;
      handlers.onStatus(status === "SUBSCRIBED");
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

// ── Typing indicators (broadcast channel, ephemeral) ─────────────────────────

export interface TypingEvent {
  kind: "typing" | "stop";
  userId: string;
  name: string;
}

export interface TypingSubscription {
  /** Send a typing/stop event. Fire-and-forget; no await needed. */
  send: (event: TypingEvent) => void;
  /** Called when another workspace member types or stops. */
  onEvent: (handler: (event: TypingEvent) => void) => () => void;
  /** Tear down the channel. */
  unsubscribe: () => void;
}

/**
 * Ephemeral typing indicator over a Supabase broadcast channel. Each workspace
 * has at most one typing channel shared by all open clients. The channel name
 * intentionally differs from `chat:<workspaceId>` so its lifetime is
 * independent of the messages subscription.
 */
export function subscribeChatTyping(workspaceId: string): TypingSubscription {
  const channel = supabase.channel(`chat-typing:${workspaceId}`, {
    config: { broadcast: { self: false, ack: false } },
  });

  let handler: ((event: TypingEvent) => void) | null = null;
  channel.on("broadcast", { event: "typing" }, (payload) => {
    const ev = payload.payload as TypingEvent | null;
    if (ev && handler) handler(ev);
  });

  channel.subscribe();

  return {
    send: (event) => {
      void channel.send({ type: "broadcast", event: "typing", payload: event });
    },
    onEvent: (h) => {
      handler = h;
      return () => {
        if (handler === h) handler = null;
      };
    },
    unsubscribe: () => {
      handler = null;
      void supabase.removeChannel(channel);
    },
  };
}

// ── Identity resolution ──────────────────────────────────────────────────────

/** Session-scoped cache so realtime messages don't refetch known profiles. */
const nameCache = new Map<string, string>();

async function attachNames(rows: ChatMessageRow[]): Promise<ChatMessage[]> {
  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((id): id is string => Boolean(id))),
  );
  const missing = userIds.filter((id) => !nameCache.has(id));

  if (missing.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", missing);
    for (const p of profiles ?? []) {
      nameCache.set(p.id, p.full_name ?? p.email ?? "");
    }
  }

  return rows.map((r) => {
    const name = r.user_id ? nameCache.get(r.user_id) ?? "" : "";
    const fallback = r.user_id ? `user:${r.user_id.slice(0, 6)}` : "Former user";
    return {
      ...r,
      senderName: name || fallback,
    };
  });
}
