import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export type ErrorTone = "danger" | "warning" | "info" | "success";
export type ErrorNoticeLayout = "banner" | "panel";

const defaultIcons = {
  danger: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
} as const;

const toneVariants = {
  danger: "destructive",
  warning: "warning",
  info: "info",
  success: "success",
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
    <Alert
      variant={toneVariants[tone]}
      role={resolvedRole}
      aria-live={resolvedRole === "alert" ? "assertive" : "polite"}
      data-tone={tone}
      data-layout={layout}
      className={cn(
        "items-start gap-3 py-3 pl-10",
        onDismiss && "pr-10",
        layout === "banner" && "rounded-none border-x-0 border-t-0",
        className,
      )}
    >
      {icon !== false ? (
        <span className="absolute left-4 top-4" aria-hidden="true">
          {icon ?? <DefaultIcon size={16} className="size-4" />}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        {title ? <AlertTitle>{title}</AlertTitle> : null}
        {children ? <AlertDescription>{children}</AlertDescription> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
      {onDismiss ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="absolute right-2 top-2 size-7 text-current hover:bg-current/10 hover:text-current"
        >
          <X size={14} aria-hidden="true" />
        </Button>
      ) : null}
    </Alert>
  );
}
