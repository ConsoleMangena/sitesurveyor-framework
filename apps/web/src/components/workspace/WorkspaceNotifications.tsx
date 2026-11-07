import { useState } from "react";
import { Bell, CheckCheck, Trash2, X } from "lucide-react";
import ErrorNotice from "@/components/errors/ErrorNotice";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { WorkspaceView } from "@/features/workspace/types";
import {
  useNotifications,
  type NotificationRow,
} from "@/lib/repositories/notifications";
import {
  formatNotificationRelativeTime,
  getNotificationCategory,
  getNotificationTargetView,
  NOTIFICATION_CATEGORIES,
} from "./notificationTypes";
import { cn } from "@/lib/utils";

type WorkspaceNotificationsProps = {
  workspaceId: string;
  onChangeView: (view: WorkspaceView) => void;
};

export function WorkspaceNotifications({
  workspaceId,
  onChangeView,
}: WorkspaceNotificationsProps) {
  const [open, setOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    loading,
    error,
    markRead,
    markAllRead,
    deleteNotification,
    clearAll,
  } = useNotifications(workspaceId, 25);

  const onItemClick = (notification: NotificationRow) => {
    if (notification.status === "unread") {
      void markRead(notification.id);
    }
    const targetView = getNotificationTargetView(notification);
    setOpen(false);
    if (targetView) {
      onChangeView(targetView);
    }
  };

  const handleViewAll = () => {
    setOpen(false);
    onChangeView("notifications");
  };

  const handleDismiss = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    void deleteNotification(id);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative size-8 shrink-0 rounded-full"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="size-4" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="absolute end-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground shadow-xs animate-in zoom-in-75">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-[320px] flex-col gap-0 p-0 sm:w-[420px]"
      >
        <SheetHeader className="flex-row items-center justify-between space-y-0 border-b p-4">
          <SheetTitle
            className="cursor-pointer text-base font-semibold hover:underline"
            onClick={handleViewAll}
          >
            Notifications
            {unreadCount > 0 && (
              <span className="ms-2 inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {unreadCount} new
              </span>
            )}
          </SheetTitle>
          <div className="flex items-center gap-2">
            {unreadCount > 0 ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                onClick={() => void markAllRead()}
              >
                <CheckCheck className="size-3.5" aria-hidden="true" />
                Mark all read
              </button>
            ) : null}
            {notifications.length > 0 ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => void clearAll()}
                title="Clear all notifications"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Loading notifications…
            </div>
          ) : error ? (
            <div className="p-4">
              <ErrorNotice tone="danger" layout="panel">
                {error}
              </ErrorNotice>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-10 text-center text-sm text-muted-foreground">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted">
                <Bell className="size-6 text-muted-foreground/60" aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium text-foreground">You&apos;re all caught up</p>
                <p className="text-xs text-muted-foreground">No new notifications for this workspace.</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {notifications.map((notification) => {
                const category = getNotificationCategory(notification);
                const theme = NOTIFICATION_CATEGORIES[category];
                const Icon = theme.icon;
                const targetView = getNotificationTargetView(notification);

                return (
                  <div
                    key={notification.id}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onItemClick(notification);
                      }
                    }}
                    className={cn(
                      "group relative flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                      notification.status === "unread" ? "bg-muted/40 font-medium" : "opacity-90",
                    )}
                    onClick={() => onItemClick(notification)}
                  >
                    {/* Category Icon Badge */}
                    <span
                      className={cn(
                        "relative flex size-9 shrink-0 items-center justify-center rounded-xl",
                        theme.bg,
                        theme.text,
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      {notification.status === "unread" && (
                        <span
                          className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background"
                          aria-label="Unread"
                        />
                      )}
                    </span>

                    {/* Notification Content */}
                    <div className="flex min-w-0 flex-1 flex-col gap-1 pr-6">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold text-foreground">
                          {notification.title}
                        </span>
                        <span className="shrink-0 text-micro text-muted-foreground font-mono">
                          {formatNotificationRelativeTime(notification.created_at)}
                        </span>
                      </div>
                      {notification.body ? (
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {notification.body}
                        </p>
                      ) : null}
                      {targetView ? (
                        <span className="mt-0.5 text-micro text-primary">
                          Opens {theme.label} →
                        </span>
                      ) : null}
                    </div>

                    {/* Dismiss Button */}
                    <button
                      type="button"
                      aria-label="Dismiss notification"
                      className="absolute right-2.5 top-3 flex size-6 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={(e) => handleDismiss(e, notification.id)}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t bg-muted/10 p-3.5">
          <Button
            variant="outline"
            className="w-full text-xs font-semibold"
            onClick={handleViewAll}
          >
            View all notifications
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
