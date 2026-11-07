import type { ComponentType } from "react";
import {
  Bell,
  FileCheck,
  HardHat,
  MessageSquare,
  ShoppingBag,
  Truck,
  UserPlus,
} from "lucide-react";
import type { WorkspaceView } from "../../features/workspace/types.ts";
import { isWorkspaceView } from "../../features/workspace/types.ts";
import type { NotificationRow } from "../../lib/repositories/notifications.ts";

export type NotificationCategory =
  | "chat_message"
  | "job_assigned"
  | "quote_accepted"
  | "workspace_invitation"
  | "marketplace_request"
  | "transport_hire"
  | "general";

export interface CategoryTheme {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  label: string;
  bg: string;
  text: string;
  badge: string;
}

export const NOTIFICATION_CATEGORIES: Record<NotificationCategory, CategoryTheme> = {
  chat_message: {
    icon: MessageSquare,
    label: "Team Chat",
    bg: "bg-info/10",
    text: "text-info",
    badge: "Chat",
  },
  job_assigned: {
    icon: HardHat,
    label: "Job Assignment",
    bg: "bg-warning/10",
    text: "text-warning",
    badge: "Assignment",
  },
  quote_accepted: {
    icon: FileCheck,
    label: "Quote Accepted",
    bg: "bg-success/10",
    text: "text-success",
    badge: "Quote",
  },
  workspace_invitation: {
    icon: UserPlus,
    label: "Workspace Invitation",
    bg: "bg-accent-purple/10",
    text: "text-accent-purple",
    badge: "Invite",
  },
  marketplace_request: {
    icon: ShoppingBag,
    label: "Marketplace Request",
    bg: "bg-rose-500/10",
    text: "text-rose-500",
    badge: "Market",
  },
  transport_hire: {
    icon: Truck,
    label: "Vehicle Hire",
    bg: "bg-amber-500/10",
    text: "text-amber-500",
    badge: "Transport",
  },
  general: {
    icon: Bell,
    label: "Notification",
    bg: "bg-muted",
    text: "text-muted-foreground",
    badge: "General",
  },
};

export function getNotificationCategory(notification: NotificationRow): NotificationCategory {
  const metadata = notification.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "general";
  }
  const type = (metadata as Record<string, unknown>).type;
  if (typeof type === "string" && type in NOTIFICATION_CATEGORIES) {
    return type as NotificationCategory;
  }
  return "general";
}

export function getNotificationTargetView(
  notification: NotificationRow,
): WorkspaceView | null {
  const metadata = notification.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const view = (metadata as Record<string, unknown>).view;
  if (isWorkspaceView(view)) return view;

  // Fallback inferences if view was omitted:
  const type = (metadata as Record<string, unknown>).type;
  if (type === "chat_message") return "teamChat";
  if (type === "job_assigned") return "dispatch";
  if (type === "quote_accepted") return "quotes";
  if (type === "workspace_invitation") return "team";
  if (type === "marketplace_request") return "marketplace";

  return null;
}

export function formatNotificationRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 45) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

