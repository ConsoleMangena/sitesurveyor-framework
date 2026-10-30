import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import "@/styles/error-surfaces.css";

export type ErrorTone = "danger" | "warning" | "info" | "success";
export type ErrorNoticeLayout = "banner" | "panel";

const defaultIcons = {
  danger: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
} as const;

export interface ErrorNoticeProps {
  tone?: ErrorTone;
  layout?: ErrorNoticeLayout;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode | false;
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
  role?: "alert" | "status";
}

export default function ErrorNotice({
  tone = "danger",
  layout = "panel",
  title,
  children,
  action,
  icon,
  onDismiss,
  dismissLabel = "Dismiss",
  className,
  role,
}: ErrorNoticeProps) {
  const DefaultIcon = defaultIcons[tone];
  const resolvedRole = role ?? (tone === "danger" || tone === "warning" ? "alert" : "status");

  return (
    <div
      className={cn("error-notice", className)}
      data-tone={tone}
      data-layout={layout}
      role={resolvedRole}
      aria-live={resolvedRole === "alert" ? "assertive" : "polite"}
    >
      {icon !== false ? (
        <span className="error-notice-icon" aria-hidden="true">
          {icon ?? <DefaultIcon size={18} />}
        </span>
      ) : null}
      <div className="error-notice-body">
        {title ? <p className="error-notice-title">{title}</p> : null}
        {children ? <div className="error-notice-message">{children}</div> : null}
      </div>
      {action ? <div className="error-notice-action">{action}</div> : null}
      {onDismiss ? (
        <button
          type="button"
          className="error-notice-dismiss"
          onClick={onDismiss}
          aria-label={dismissLabel}
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
