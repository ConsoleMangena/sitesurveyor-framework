import { Bell } from "lucide-react";

import ErrorNotice from "@/components/errors/ErrorNotice";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { isWorkspaceView, type WorkspaceView } from "@/features/workspace/types";
import {
  useNotifications,
  type NotificationRow,
} from "@/lib/repositories/notifications";

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

function getNotificationTargetView(
  notification: NotificationRow,
): WorkspaceView | null {
  const metadata = notification.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const view = (metadata as Record<string, unknown>).view;
  return isWorkspaceView(view) ? view : null;
}

type WorkspaceNotificationsProps = {
  workspaceId: string;
  onChangeView: (view: WorkspaceView) => void;
};

export function WorkspaceNotifications({
  workspaceId,
  onChangeView,
}: WorkspaceNotificationsProps) {
  const { notifications, unreadCount, loading, error, markRead, markAllRead } =
    useNotifications(workspaceId);

  const onItemClick = (notification: NotificationRow) => {
    if (notification.status === "unread") void markRead(notification.id);
    const targetView = getNotificationTargetView(notification);
    if (targetView) onChangeView(targetView);
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative size-8 rounded-full shrink-0"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="size-4" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="absolute end-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-[300px] flex-col gap-0 p-0 sm:w-[400px]"
      >
        <SheetHeader className="flex-row items-center justify-between space-y-0 border-b p-4">
          <SheetTitle
            className="cursor-pointer text-base hover:underline"
            onClick={() => onChangeView("notifications")}
          >
            Notifications
          </SheetTitle>
          {unreadCount > 0 ? (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => void markAllRead()}
            >
              Mark all read
            </button>
          ) : null}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : error ? (
            <div className="p-4">
              <ErrorNotice tone="danger" layout="panel">
                {error}
              </ErrorNotice>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <Bell aria-hidden="true" />
              <span>You&apos;re all caught up</span>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={`flex flex-col border-b p-4 text-left transition-colors hover:bg-accent ${
                    notification.status === "unread" ? "bg-muted/30" : ""
                  }`}
                  onClick={() => onItemClick(notification)}
                >
                  <div className="flex w-full items-start gap-3">
                    {notification.status === "unread" ? (
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                    ) : null}
                    <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                      <span className="text-sm font-medium leading-tight text-foreground">
                        {notification.title}
                      </span>
                      {notification.body ? (
                        <span className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                          {notification.body}
                        </span>
                      ) : null}
                      <span className="mt-1 text-xs text-muted-foreground">
                        {formatRelativeTime(notification.created_at)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="border-t bg-muted/10 p-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onChangeView("notifications")}
          >
            View all notifications
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
