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
        "mx-auto flex w-full max-w-[1680px] flex-col gap-5 motion-safe:animate-[ui-fade-in-up_0.45s_cubic-bezier(0.16,1,0.3,1)] sm:gap-6",
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
  /** Context line shown when the header has no description to carry one. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function DashboardHeader({
  badge,
  title,
  subtitle,
  description,
  meta,
  actions,
  className,
}: DashboardHeaderProps) {
  const hasDescription = Boolean(description);
  const metaText = hasDescription ? subtitle : meta;
  const lede = hasDescription ? description : subtitle;

  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-2xl font-bold tracking-tight text-balance">
          {title}
        </h1>
        {lede ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{lede}</p>
        ) : null}
        {badge || metaText ? (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {badge}
            {badge && metaText ? (
              <span className="h-3 w-px bg-border" aria-hidden="true" />
            ) : null}
            {metaText ? <span>{metaText}</span> : null}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

interface DashboardGridProps {
  children: React.ReactNode;
  className?: string;
}

/** Bento grid: one column on phones, 12 columns from md up so tiles can span. */
export function DashboardGrid({ children, className }: DashboardGridProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 items-start gap-4 sm:gap-5 md:grid-cols-12",
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
    <div className={cn("flex min-w-0 flex-col gap-4 sm:gap-5", className)}>
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
    <section className={cn("flex min-w-0 flex-col gap-3", className)}>
      {(title || action) && (
        <div className="flex items-center gap-3">
          {title ? (
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          ) : null}
          <Separator className="flex-1" />
          {action ? <div className="shrink-0">{action}</div> : null}
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
          "flex w-full items-center justify-between gap-4 rounded-md px-1 py-3 text-left transition-colors",
          onClick && "cursor-pointer hover:bg-muted/60",
          className,
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </button>
      <Separator />
    </>
  );
}
