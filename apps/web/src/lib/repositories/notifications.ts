import { useCallback, useEffect, useRef, useState } from "react";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { getCurrentUser } from "../auth/session.ts";
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

const NOTIFICATIONS_LIMIT = 20;

/**
 * List the most recent notifications for the current user within a workspace.
 * Archived notifications are excluded; unread are surfaced first.
 */
export async function listNotifications(
  workspaceId: string,
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
    .limit(NOTIFICATIONS_LIMIT);

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

const NOTIFICATIONS_POLL_MS = 60000;

export interface UseNotificationsResult {
  notifications: NotificationRow[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

/**
 * Loads notifications for a workspace, polls periodically and on tab focus,
 * and exposes optimistic read actions for the topbar bell.
 */
export function useNotifications(
  workspaceId: string | null | undefined,
): UseNotificationsResult {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const channelIdRef = useRef(crypto.randomUUID());

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await listNotifications(workspaceId);
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
  }, [workspaceId]);

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

    // Polling acts as a fallback in case the realtime channel drops.
    const intervalId = window.setInterval(() => void refresh(), NOTIFICATIONS_POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Realtime: new notifications for this workspace push an instant refresh.
    // Each hook instance needs a unique topic because Supabase does not allow
    // adding postgres_changes callbacks to an already-subscribed channel.
    let currentUserId: string | null = null;
    const channel = supabase
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
          const row = payload.new as Partial<NotificationRow>;
          // Only react to notifications addressed to the current user.
          if (currentUserId && row.user_id && row.user_id !== currentUserId) {
            return;
          }
          void refresh();
        },
      )
      .subscribe();

    void getCurrentUser().then((user) => {
      currentUserId = user?.id ?? null;
    });

    return () => {
      mountedRef.current = false;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, refresh]);

  const markRead = useCallback(async (id: string) => {
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
  }, [refresh]);

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

  const unreadCount = notifications.filter((n) => n.status === "unread").length;

  return { notifications, unreadCount, loading, error, refresh, markRead, markAllRead };
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
