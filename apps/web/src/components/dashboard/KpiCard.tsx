import * as React from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KpiTone =
  | "neutral"
  | "primary"
  | "success"
  | "info"
  | "warning"
  | "purple";

const TONE_CHIP: Record<KpiTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  info: "bg-info/10 text-info",
  warning: "bg-warning/10 text-warning",
  purple: "bg-accent-purple/10 text-accent-purple",
};

interface KpiCardProps {
  title: string;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  tone?: KpiTone;
  /** `compact` is the secondary rail: same language, less weight. */
  size?: "default" | "compact";
  className?: string;
}

export function KpiCard({
  title,
  value,
  subtext,
  icon,
  badge,
  tone = "neutral",
  size = "default",
  className,
}: KpiCardProps) {
  if (size === "compact") {
    return (
      <Card className={cn("gap-0 py-0", className)}>
        <CardContent className="flex items-center gap-3 p-3">
          <span
            aria-hidden
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-md",
              TONE_CHIP[tone],
            )}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted-foreground">
              {title}
            </p>
            <p className="truncate text-lg font-bold tabular-nums">{value}</p>
          </div>
          {badge ? <div className="ml-auto shrink-0">{badge}</div> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("gap-3 py-4", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 px-4 pb-0">
        <CardTitle className="text-sm font-medium" title={title}>
          {title}
        </CardTitle>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </CardHeader>
      <CardContent className="px-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-lg",
              TONE_CHIP[tone],
            )}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <p
              className="truncate text-2xl font-bold tabular-nums"
              title={typeof value === "string" ? value : undefined}
            >
              {value}
            </p>
            {subtext ? (
              <p
                className="truncate text-xs text-muted-foreground"
                title={typeof subtext === "string" ? subtext : undefined}
              >
                {subtext}
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
