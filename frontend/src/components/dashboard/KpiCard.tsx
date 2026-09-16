import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KpiTone =
  | "neutral"
  | "primary"
  | "success"
  | "info"
  | "warning"
  | "purple";

const TONE_STYLES: Record<KpiTone, { chip: string; bar: string }> = {
  neutral: {
    chip: "bg-muted text-muted-foreground",
    bar: "bg-border/60",
  },
  primary: {
    chip: "bg-primary/10 text-primary",
    bar: "bg-primary",
  },
  success: {
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
  },
  info: {
    chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    bar: "bg-sky-500",
  },
  warning: {
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
  },
  purple: {
    chip: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    bar: "bg-violet-500",
  },
};

interface KpiCardProps {
  title: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  tone?: KpiTone;
  className?: string;
}

export function KpiCard({
  title,
  value,
  subtext,
  icon,
  badge,
  tone = "neutral",
  className,
}: KpiCardProps) {
  const styles = TONE_STYLES[tone];
  return (
    <Card
      className={cn(
        "group relative h-full overflow-hidden border-border/60 bg-card shadow-sm",
        "transition-[border-color,box-shadow,transform] duration-300 ease-in-out",
        "hover:-translate-y-0.5 hover:border-border hover:shadow-md",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-0.5 opacity-70 transition-opacity group-hover:opacity-100",
          styles.bar,
        )}
      />
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/50 transition-transform group-hover:scale-105",
              styles.chip,
            )}
          >
            {icon}
          </span>
          {badge}
        </div>
        <div className="min-w-0 space-y-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {title}
          </p>
          <p className="truncate text-2xl font-bold leading-tight tabular-nums tracking-tight text-foreground">
            {value}
          </p>
          {subtext ? (
            <p className="truncate text-xs text-muted-foreground">{subtext}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}