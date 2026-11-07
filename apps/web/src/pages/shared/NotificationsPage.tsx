import { useMemo, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  ExternalLink,
  RefreshCw,
  Trash2,
} from "lucide-react";
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
} from "../../components/ui/card.tsx";
import { MetricStrip } from "../../components/dashboard/MetricStrip.tsx";
import { DashboardHeader } from "../../components/dashboard/DashboardShell.tsx";
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
import {
  getNotificationCategory,
  getNotificationTargetView,
  NOTIFICATION_CATEGORIES,
} from "../../components/workspace/notificationTypes.tsx";

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

export default function NotificationsPage({
  workspaceId,
  onNavigate,
}: NotificationsPageProps) {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    refresh,
    markRead,
    markUnread,
    markAllRead,
    deleteNotification,
    clearAll,
  } = useNotifications(workspaceId, 60);

  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const filteredNotifications = useMemo(() => {
    if (filter === "all") return notifications;
    return notifications.filter((notification) => notification.status === filter);
  }, [filter, notifications]);

  const readCount = notifications.filter((notification) => notification.status === "read").length;

  const openNotification = (notification: NotificationRow) => {
    if (notification.status === "unread") void markRead(notification.id);
    const view = getNotificationTargetView(notification);
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

  const handleClearAll = async () => {
    if (notifications.length === 0) return;
    setClearingAll(true);
    try {
      await clearAll();
    } finally {
      setClearingAll(false);
    }
  };

  const summary = [
    {
      label: "Total Notifications",
      value: String(notifications.length),
      icon: <Bell className="size-4" />,
    },
    {
      label: "Unread",
      value: String(unreadCount),
      tone: "primary" as const,
      icon: <Bell className="size-4" />,
    },
    {
      label: "Read",
      value: String(readCount),
      icon: <Check className="size-4" />,
    },
  ];

  return (
    <div className="space-y-4">
      <DashboardHeader
        title="Notifications"
        badge={<Badge variant="secondary">Signal feed</Badge>}
        subtitle="Review workspace updates, assignments, invitations, quotes, and dispatch activity."
        meta={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() => void handleRefresh()}
              className="gap-1.5"
            >
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              {refreshing ? "Refreshing" : "Refresh"}
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={unreadCount === 0 || markingAllRead}
              onClick={() => void handleMarkAllRead()}
              className="gap-1.5"
            >
              <CheckCheck className="size-3.5" />
              {markingAllRead ? "Updating" : "Mark all as read"}
              {unreadCount > 0 && !markingAllRead && (
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-micro">
                  {unreadCount}
                </Badge>
              )}
            </Button>
            {notifications.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={clearingAll}
                onClick={() => void handleClearAll()}
                className="gap-1.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                {clearingAll ? "Clearing…" : "Clear all"}
              </Button>
            )}
          </div>
        }
      />

      <MetricStrip metrics={summary} />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={filter} onValueChange={(value) => setFilter(value as NotificationFilter)}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="all">
            All <span className="ml-1.5 font-mono text-micro text-muted-foreground">({notifications.length})</span>
          </TabsTrigger>
          <TabsTrigger value="unread">
            Unread
            {unreadCount > 0 && (
              <Badge className="ml-1.5 px-1.5 py-0 text-micro">{unreadCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="read">
            Read <span className="ml-1.5 font-mono text-micro text-muted-foreground">({readCount})</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-0">
          {loading && notifications.length === 0 ? (
            <div className="space-y-3 p-6" role="status" aria-label="Loading">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ) : filteredNotifications.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon" aria-hidden="true">
                  <Bell className="size-5" />
                </EmptyMedia>
                <EmptyTitle>No notifications</EmptyTitle>
                <EmptyDescription>
                  {filter === "all"
                    ? "You're all caught up. New alerts will show up here in real time."
                    : `No ${filter} notifications found in this workspace.`}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ScrollArea className="h-[min(650px,calc(100dvh-18rem))] pb-[env(safe-area-inset-bottom,0px)]">
              <div className="divide-y divide-border/70">
                {filteredNotifications.map((notification) => {
                  const category = getNotificationCategory(notification);
                  const theme = NOTIFICATION_CATEGORIES[category];
                  const Icon = theme.icon;
                  const targetView = getNotificationTargetView(notification);
                  const isUnread = notification.status === "unread";

                  return (
                    <div
                      key={notification.id}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openNotification(notification);
                        }
                      }}
                      className={cn(
                        "group relative flex w-full flex-col gap-3 p-4 text-left transition-colors sm:flex-row sm:items-start sm:p-5 hover:bg-muted/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                        isUnread ? "bg-primary/[0.03]" : "opacity-90",
                      )}
                      onClick={() => openNotification(notification)}
                    >
                      {/* Left: Category Icon with Unread Indicator */}
                      <div className="flex items-center gap-3 sm:block">
                        <span
                          className={cn(
                            "relative flex size-10 shrink-0 items-center justify-center rounded-xl",
                            theme.bg,
                            theme.text,
                          )}
                        >
                          <Icon className="size-5" aria-hidden="true" />
                          {isUnread && (
                            <span
                              className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background"
                              aria-label="Unread indicator"
                            />
                          )}
                        </span>
                        <div className="sm:hidden">
                          <Badge variant={isUnread ? "default" : "secondary"} className="text-micro">
                            {theme.badge}
                          </Badge>
                        </div>
                      </div>

                      {/* Middle: Content */}
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-sm text-foreground", isUnread ? "font-semibold" : "font-medium")}>
                              {notification.title}
                            </span>
                            <Badge
                              variant={isUnread ? "default" : "outline"}
                              className="hidden sm:inline-flex text-micro"
                            >
                              {theme.badge}
                            </Badge>
                          </div>
                          <time className="shrink-0 font-mono text-xs text-muted-foreground">
                            {formatNotificationDate(notification.created_at)}
                          </time>
                        </div>

                        {notification.body && (
                          <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">
                            {notification.body}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                          {targetView ? (
                            <span className="inline-flex items-center gap-1 font-medium text-primary">
                              Opens {theme.label}
                              <ExternalLink className="size-3" aria-hidden="true" />
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                        {isUnread ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              void markRead(notification.id);
                            }}
                            title="Mark as read"
                          >
                            <Check className="size-3.5" />
                            <span className="hidden sm:inline">Mark read</span>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              void markUnread(notification.id);
                            }}
                            title="Mark as unread"
                          >
                            <Bell className="size-3.5" />
                            <span className="hidden sm:inline">Mark unread</span>
                          </Button>
                        )}

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            void deleteNotification(notification.id);
                          }}
                          title="Delete notification"
                          aria-label="Delete notification"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
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
