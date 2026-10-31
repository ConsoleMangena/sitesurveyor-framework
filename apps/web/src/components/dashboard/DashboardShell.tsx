import * as React from "react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator.tsx";
import "./dashboard.css";

interface DashboardShellProps {
  children: React.ReactNode;
  className?: string;
}

export function DashboardShell({ children, className }: DashboardShellProps) {
  return (
    <div
      className={cn(
        "dash-shell mx-auto flex w-full max-w-[1680px] flex-col gap-5 sm:gap-6 animate-in fade-in slide-in-from-bottom-1 duration-400",
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
  /** Eyebrow line shown when the header has no description to carry one. */
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
    <header className={cn("dash-header", className)}>
      <div className="dash-header-inner">
        <div className="dash-header-main">
          {(badge || metaText) && (
            <div className="dash-meta">
              {badge}
              {badge && metaText ? (
                <span className="dash-meta-divider" aria-hidden="true" />
              ) : null}
              {metaText ? <span>{metaText}</span> : null}
            </div>
          )}
          <h1 className="dash-title">{title}</h1>
          {lede ? <p className="dash-lede">{lede}</p> : null}
        </div>
        {actions ? <div className="dash-actions">{actions}</div> : null}
      </div>
      <div className="dash-datum" aria-hidden="true" />
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
    <section className={cn("dash-section", className)}>
      {(title || action) && (
        <div className="dash-section-head">
          {title ? <h2 className="dash-section-title">{title}</h2> : null}
          <span className="dash-section-line" aria-hidden="true" />
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
          "flex items-center justify-between gap-4 w-full text-left py-3 px-1 rounded-none transition-colors",
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
