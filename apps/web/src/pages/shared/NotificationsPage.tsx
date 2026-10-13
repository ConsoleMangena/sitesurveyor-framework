import { useMemo, useState } from "react";
import { Check, RefreshCw, Bell } from "lucide-react";
import {
  useNotifications,
  type NotificationRow,
} from "../../lib/repositories/notifications.ts";
import type { WorkspaceView } from "../../features/workspace/types.ts";
import PageLoader from "../../components/PageLoader.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";
import { Alert, AlertDescription } from "../../components/ui/alert.tsx";
import { ScrollArea } from "../../components/ui/scroll-area.tsx";
import { cn } from "../../lib/utils.ts";

interface NotificationsPageProps {
  workspaceId: string;
  onNavigate?: (view: WorkspaceView) => void;
}

type NotificationFilter = "all" | "unread" | "read";

function formatNotificationDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getNotificationView(notification: NotificationRow): WorkspaceView | null {
  const metadata = notification.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const view = (metadata as Record<string, unknown>).view;
  return typeof view === "string" ? (view as WorkspaceView) : null;
}

export default function NotificationsPage({
  workspaceId,
  onNavigate,
}: NotificationsPageProps) {
  const { notifications, unreadCount, loading, error, refresh, markRead, markAllRead } =
    useNotifications(workspaceId);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const filteredNotifications = useMemo(() => {
    if (filter === "all") return notifications;
    return notifications.filter((notification) => notification.status === filter);
  }, [filter, notifications]);

  const readCount = notifications.filter((notification) => notification.status === "read").length;

  const openNotification = (notification: NotificationRow) => {
    if (notification.status === "unread") void markRead(notification.id);
    const view = getNotificationView(notification);
    if (view && onNavigate) onNavigate(view);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    setMarkingAllRead(true);
    try {
      await markAllRead();
    } finally {
      setMarkingAllRead(false);
    }
  };

  const summary = [
    { label: "Total", value: notifications.length },
    { label: "Unread", value: unreadCount, active: filter === "unread" },
    { label: "Read", value: readCount },
  ];

  return (
    <div className="hub-body mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1>Notifications</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Review workspace updates, assignments, invitations, and quote activity.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing" : "Refresh"}
          </Button>
          <Button
            size="sm"
            disabled={unreadCount === 0 || markingAllRead}
            onClick={() => void handleMarkAllRead()}
          >
            <Check className="mr-2 h-4 w-4" />
            {markingAllRead ? "Updating" : "Mark all as read"}
            {unreadCount > 0 && !markingAllRead && (
              <Badge variant="secondary" className="ml-2">
                {unreadCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {summary.map((item) => (
          <Card key={item.label} className={cn(item.active && "border-primary")}>
            <CardContent className="flex items-center justify-between py-4">
              <span className="text-sm text-muted-foreground">{item.label}</span>
              <span className="text-2xl font-semibold text-foreground">{item.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={filter} onValueChange={(value) => setFilter(value as NotificationFilter)}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unread">
            Unread {unreadCount > 0 && <Badge className="ml-2">{unreadCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="read">Read</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notification Feed</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading && notifications.length === 0 ? (
            <div className="p-8">
              <PageLoader compact />
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/50" />
              <div className="space-y-1">
                <p className="font-medium text-foreground">No notifications</p>
                <p className="text-sm text-muted-foreground">
                  {filter === "all"
                    ? "You're all caught up."
                    : `No ${filter} notifications found.`}
                </p>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-[min(600px,60vh)]">
              <div className="divide-y">
                {filteredNotifications.map((notification) => {
                  const targetView = getNotificationView(notification);
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50",
                        notification.status === "unread" && "bg-primary/5",
                      )}
                      onClick={() => openNotification(notification)}
                    >
                      <span
                        className={cn(
                          "mt-2 h-2 w-2 shrink-0 rounded-full",
                          notification.status === "unread"
                            ? "bg-primary"
                            : "bg-muted-foreground/30",
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <span className="font-medium text-foreground">
                            {notification.title}
                          </span>
                          <time className="shrink-0 text-xs text-muted-foreground">
                            {formatNotificationDate(notification.created_at)}
                          </time>
                        </div>
                        {notification.body && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {notification.body}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant={notification.status === "unread" ? "default" : "secondary"}>
                            {notification.status === "unread" ? "Unread" : "Read"}
                          </Badge>
                          {targetView && <span>Opens {targetView}</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
