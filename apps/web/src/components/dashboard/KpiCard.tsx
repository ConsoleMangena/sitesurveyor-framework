import * as React from "react";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type KpiTone =
  | "neutral"
  | "primary"
  | "success"
  | "info"
  | "warning"
  | "purple"
  | "danger";

/** Tone colours the glyph only. A tinted square behind it turned every tile
 *  into the same icon-plus-heading block and cost the row its density. */
const TONE_ICON: Record<KpiTone, string> = {
  neutral: "text-muted-foreground",
  primary: "text-primary",
  success: "text-success",
  info: "text-info",
  warning: "text-warning",
  purple: "text-accent-purple",
  danger: "text-destructive",
};

interface KpiCardProps {
  title: string;
  value: React.ReactNode;
  /** Only facts the title and value cannot carry. Never a restatement. */
  subtext?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: KpiTone;
  badge?: React.ReactNode;
  /** Drill-in target. Omitted, the tile is plain static content. */
  onClick?: () => void;
  className?: string;
}

export function KpiCard({
  title,
  value,
  subtext,
  icon,
  tone = "neutral",
  badge,
  onClick,
  className,
}: KpiCardProps) {
  const clickable = !!onClick;

  return (
    <Card
      className={cn(
        "min-w-0 items-start gap-0 p-3.5",
        clickable &&
          "cursor-pointer outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <div className="flex w-full min-w-0 items-center gap-2">
        {icon ? (
          <span
            aria-hidden
            className={cn(
              "flex size-3.5 shrink-0 items-center [&>svg]:size-3.5",
              TONE_ICON[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground" title={title}>
          {title}
        </p>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      <p
        className="mt-1.5 w-full truncate text-xl font-bold leading-none tracking-tight tabular-nums"
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </p>
      {subtext ? (
        <p
          className="mt-1 w-full truncate text-[11px] leading-tight text-muted-foreground"
          title={typeof subtext === "string" ? subtext : undefined}
        >
          {subtext}
        </p>
      ) : null}
    </Card>
  );
}

/** Reserves the exact box of the tile above, so a loading row never reflows. */
export function KpiCardSkeleton({ subtext = true }: { subtext?: boolean }) {
  return (
    <Card className="min-w-0 items-start gap-0 p-3.5">
      <div className="flex w-full min-w-0 items-center gap-2">
        <Skeleton className="size-3.5 rounded-sm" />
        <Skeleton className="h-3 min-w-0 flex-1" />
      </div>
      <Skeleton className="mt-1.5 h-5 w-20" />
      {subtext ? <Skeleton className="mt-1 h-2.5 w-24" /> : null}
    </Card>
  );
}

/** Columns divide the tile count wherever a tidy row exists, so a band of
 *  stats never ends in a ragged gap and every tile keeps the same width. */
const COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  5: "grid-cols-2 lg:grid-cols-5",
  6: "grid-cols-2 lg:grid-cols-3",
};

function gridColumns(count: number) {
  return COLUMNS[count] ?? "grid-cols-2 lg:grid-cols-4";
}

export function KpiGrid({
  children,
  className,
  loading = false,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  children: React.ReactNode;
  loading?: boolean;
}) {
  const count = loading ? 4 : React.Children.count(children);

  return (
    <div
      aria-busy={loading || undefined}
      className={cn("grid gap-1.5 sm:gap-2", gridColumns(count), className)}
      {...props}
    >
      {children}
    </div>
  );
}
