import * as React from "react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator.tsx";

interface DashboardShellProps {
  children: React.ReactNode;
  className?: string;
}

export function DashboardShell({ children, className }: DashboardShellProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:gap-6 p-3 sm:p-6 animate-in fade-in slide-in-from-bottom-2 duration-500",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface DashboardHeaderProps {
  badge?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function DashboardHeader({
  badge,
  title,
  subtitle,
  description,
  actions,
  className,
}: DashboardHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-col gap-1.5 min-w-0">
        {badge && <div className="mb-0.5">{badge}</div>}
        <h1 className="text-[clamp(22px,2.4vw,30px)] font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm font-medium text-muted-foreground">{subtitle}</p>
        )}
        {description && (
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
}

interface DashboardGridProps {
  children: React.ReactNode;
  className?: string;
}

export function DashboardGrid({ children, className }: DashboardGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-start",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface DashboardColumnProps {
  children: React.ReactNode;
  className?: string;
}

export function DashboardColumn({ children, className }: DashboardColumnProps) {
  return (
    <div className={cn("flex flex-col gap-6 min-w-0", className)}>
      {children}
    </div>
  );
}

interface DashboardSectionProps {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function DashboardSection({
  title,
  action,
  children,
  className,
}: DashboardSectionProps) {
  return (
    <section className={cn("space-y-3", className)}>
      {(title || action) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          {title && (
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {title}
            </h2>
          )}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

interface DashboardListItemProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function DashboardListItem({
  title,
  subtitle,
  badge,
  onClick,
  className,
}: DashboardListItemProps) {
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex items-center justify-between gap-4 w-full text-left py-3 px-1 rounded-lg transition-colors",
          onClick && "hover:bg-muted/60 cursor-pointer",
          className,
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{title}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </button>
      <Separator />
    </>
  );
}
