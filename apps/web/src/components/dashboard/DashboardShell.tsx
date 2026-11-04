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
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight text-balance sm:text-2xl">
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

/** Scope or count for a panel header, sits in DashboardCard's titleAction slot.
 *  One chip everywhere so a row of panels reads as one system. */
export function PanelMeta({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
      {children}
    </span>
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
