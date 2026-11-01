import { useMemo, useState } from "react";
import { Check, RefreshCw, Bell } from "lucide-react";
import {
  useNotifications,
  type NotificationRow,
} from "../../lib/repositories/notifications.ts";
import type { WorkspaceView } from "../../features/workspace/types.ts";
import { Button } from "../../components/ui/button.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.tsx";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";
import { Alert, AlertDescription } from "../../components/ui/alert.tsx";
import { ScrollArea } from "../../components/ui/scroll-area.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
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
    {
      label: "Total",
      value: notifications.length,
      icon: Bell,
      iconClassName: "h-5 w-5 text-muted-foreground",
    },
    {
      label: "Unread",
      value: unreadCount,
      icon: Bell,
      iconClassName: "h-5 w-5 text-primary",
    },
    {
      label: "Read",
      value: readCount,
      icon: Check,
      iconClassName: "h-5 w-5 text-muted-foreground",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            Notifications
            <Badge variant="secondary">Signal feed</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            Review workspace updates, assignments, invitations, and quote activity.
          </p>
          <p className="text-xs text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void handleRefresh()}
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing" : "Refresh"}
          </Button>
          <Button
            size="sm"
            disabled={unreadCount === 0 || markingAllRead}
            onClick={() => void handleMarkAllRead()}
          >
            <Check className="h-4 w-4" />
            {markingAllRead ? "Updating" : "Mark all as read"}
            {unreadCount > 0 && !markingAllRead && (
              <Badge variant="secondary" className="ml-2">
                {unreadCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {summary.map((item) => (
          <Card key={item.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
              <item.icon className={item.iconClassName} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{item.value}</div>
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
        <CardContent className="p-0">
          {loading && notifications.length === 0 ? (
            <div className="space-y-3 p-6" role="status" aria-label="Loading">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredNotifications.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon" aria-hidden="true">
                  <Bell className="h-5 w-5" />
                </EmptyMedia>
                <EmptyTitle>No notifications</EmptyTitle>
                <EmptyDescription>
                  {filter === "all"
                    ? "You're all caught up."
                    : `No ${filter} notifications found.`}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ScrollArea className="h-[min(600px,calc(100dvh-18rem))] pb-[env(safe-area-inset-bottom,0px)]">
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
                          "mt-2 h-2 w-2 shrink-0 rounded-none",
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
