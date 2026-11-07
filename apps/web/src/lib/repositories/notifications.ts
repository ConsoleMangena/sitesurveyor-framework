import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { getCurrentUser } from "../auth/session.ts";
import { generateLocalId } from "../localDb/utils.ts";
import { supabase } from "../supabase/client.ts";
import type { Json, Tables, TablesInsert } from "../supabase/types.ts";

export type NotificationRow = Tables<"notifications">;
export type NotificationInsert = TablesInsert<"notifications">;

export interface CreateNotificationInput {
  workspaceId: string;
  userId: string;
  title: string;
  body?: string | null;
  metadata?: Json;
}

/**
 * Insert a single notification for a user. Notification failures must never
 * break the originating action, so callers should use the event helpers below
 * (which swallow errors) rather than letting this reject silently.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<NotificationRow> {
  const row: NotificationInsert = {
    workspace_id: input.workspaceId,
    user_id: input.userId,
    title: input.title,
    body: input.body ?? null,
    metadata: input.metadata ?? {},
    status: "unread",
  };

  const { data, error } = await supabase
    .from("notifications")
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

/** Insert notifications for several users at once (deduped, self-excluded by callers). */
export async function createNotifications(
  inputs: CreateNotificationInput[],
): Promise<void> {
  if (inputs.length === 0) return;

  const rows: NotificationInsert[] = inputs.map((input) => ({
    workspace_id: input.workspaceId,
    user_id: input.userId,
    title: input.title,
    body: input.body ?? null,
    metadata: input.metadata ?? {},
    status: "unread",
  }));

  const { error } = await supabase.from("notifications").insert(rows);
  if (error) throw error;
}

const NOTIFICATIONS_DEFAULT_LIMIT = 30;

/**
 * List the most recent notifications for the current user within a workspace.
 * Archived notifications are excluded; unread are surfaced first.
 */
export async function listNotifications(
  workspaceId: string,
  limit: number = NOTIFICATIONS_DEFAULT_LIMIT,
): Promise<NotificationRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "unread");

  if (error) throw error;
}

export async function markNotificationUnread(id: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ status: "unread", read_at: null })
    .eq("id", id)
    .eq("status", "read");

  if (error) throw error;
}

export async function deleteNotification(id: string): Promise<void> {
  // Soft delete by marking as archived so listNotifications excludes it
  const { error } = await supabase
    .from("notifications")
    .update({ status: "archived" })
    .eq("id", id);

  if (error) {
    // Fallback to hard delete if status column update encounters an issue
    const { error: delError } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id);
    if (delError) throw delError;
  }
}

export async function clearAllNotifications(
  workspaceId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const { error } = await supabase
    .from("notifications")
    .update({ status: "archived" })
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .neq("status", "archived");

  if (error) throw error;
}

export async function markAllNotificationsRead(
  workspaceId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const { error } = await supabase
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("status", "unread");

  if (error) throw error;
}

/**
 * Mark the current user's unread chat notifications as read — called when the
 * chat panel is opened, so the bell doesn't keep flagging messages the user
 * has already seen in the chat itself.
 */
export async function markChatNotificationsRead(
  workspaceId: string,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const { error } = await supabase
    .from("notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("status", "unread")
    .eq("metadata->>type", "chat_message");

  if (error) throw error;
}

const NOTIFICATIONS_POLL_MS = 60000;

export interface UseNotificationsResult {
  notifications: NotificationRow[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markUnread: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

/**
 * Loads notifications for a workspace, polls periodically and on tab focus,
 * listens to realtime events, shows toast notifications for incoming alerts,
 * and exposes optimistic read, unread, and delete actions.
 */
export function useNotifications(
  workspaceId: string | null | undefined,
  limit: number = NOTIFICATIONS_DEFAULT_LIMIT,
): UseNotificationsResult {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const channelIdRef = useRef(generateLocalId());

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await listNotifications(workspaceId, limit);
      if (mountedRef.current) {
        setNotifications(rows);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load notifications.");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [workspaceId, limit]);

  useAsyncAction(
    async () => {
      if (!workspaceId) return;
      await refresh();
    },
    [workspaceId, refresh],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (!workspaceId) return;

    let isSubscribed = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Polling acts as a fallback in case the realtime channel drops.
    const intervalId = window.setInterval(() => void refresh(), NOTIFICATIONS_POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Setup realtime subscription
    async function setupRealtime() {
      const user = await getCurrentUser();
      if (!mountedRef.current || !isSubscribed) return;
      const currentUserId = user?.id ?? null;

      channel = supabase
        .channel(`notifications:${workspaceId}:${channelIdRef.current}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `workspace_id=eq.${workspaceId}`,
          },
          (payload) => {
            const row = payload.new as NotificationRow;
            // Only react to notifications addressed to the current user
            if (!currentUserId || row.user_id === currentUserId) {
              if (row.title) {
                toast(row.title, {
                  description: row.body || undefined,
                });
              }
              void refresh();
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `workspace_id=eq.${workspaceId}`,
          },
          (payload) => {
            const row = payload.new as NotificationRow;
            if (!currentUserId || row.user_id === currentUserId) {
              void refresh();
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "notifications",
            filter: `workspace_id=eq.${workspaceId}`,
          },
          () => {
            void refresh();
          },
        )
        .subscribe();
    }

    void setupRealtime();

    return () => {
      isSubscribed = false;
      mountedRef.current = false;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [workspaceId, refresh]);

  const markRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id && n.status === "unread"
            ? { ...n, status: "read", read_at: new Date().toISOString() }
            : n,
        ),
      );
      try {
        await markNotificationRead(id);
      } catch {
        void refresh();
      }
    },
    [refresh],
  );

  const markUnread = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id && n.status === "read"
            ? { ...n, status: "unread", read_at: null }
            : n,
        ),
      );
      try {
        await markNotificationUnread(id);
      } catch {
        void refresh();
      }
    },
    [refresh],
  );

  const markAllRead = useCallback(async () => {
    if (!workspaceId) return;
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) =>
        n.status === "unread" ? { ...n, status: "read", read_at: now } : n,
      ),
    );
    try {
      await markAllNotificationsRead(workspaceId);
    } catch {
      void refresh();
    }
  }, [workspaceId, refresh]);

  const deleteNotificationAction = useCallback(
    async (id: string) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      try {
        await deleteNotification(id);
      } catch {
        void refresh();
      }
    },
    [refresh],
  );

  const clearAllAction = useCallback(async () => {
    if (!workspaceId) return;
    setNotifications([]);
    try {
      await clearAllNotifications(workspaceId);
    } catch {
      void refresh();
    }
  }, [workspaceId, refresh]);

  const unreadCount = notifications.filter((n) => n.status === "unread").length;

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refresh,
    markRead,
    markUnread,
    markAllRead,
    deleteNotification: deleteNotificationAction,
    clearAll: clearAllAction,
  };
}
