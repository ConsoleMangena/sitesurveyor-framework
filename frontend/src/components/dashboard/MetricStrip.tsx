import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface MetricStripMetric {
  label: string;
  value: string;
  subtext?: string;
  accentColor: string;
  /** Optional custom icon node. If omitted, falls back to a simple dot. */
  icon?: React.ReactNode;
  /** Optional handler for clickable metrics. Adds button semantics and hover cursor. */
  onClick?: () => void;
}

interface MetricStripProps {
  metrics: MetricStripMetric[];
  loading?: boolean;
}

function defaultIcon(accentColor: string) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: accentColor }}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function MetricSkeleton() {
  return (
    <Card className="h-full border-border/60">
      <CardContent className="flex items-center gap-3 p-3">
        <Skeleton className="rounded-lg h-7 w-7" />
        <div className="flex flex-col gap-1.5 min-w-0">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-12" />
        </div>
      </CardContent>
    </Card>
  );
}

export function MetricStrip({ metrics, loading = false }: MetricStripProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <MetricSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div
      data-testid="metric-strip"
      className="grid gap-2"
      style={{
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
      }}
    >
      {metrics.map((metric, index) => {
        const clickable = !!metric.onClick;
        return (
          <Card
            key={metric.label + index}
            className={cn(
              "h-full border-border/60 bg-card shadow-sm transition-all duration-200 group relative overflow-hidden",
              clickable && "cursor-pointer hover:shadow-md hover:-translate-y-0.5",
            )}
            onClick={metric.onClick}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      metric.onClick?.();
                    }
                  }
                : undefined
            }
          >
            <CardContent className="flex items-center gap-3 p-3">
              <div
                className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-muted"
                style={{ color: metric.accentColor }}
              >
                {metric.icon ? (
                  <span className="flex items-center justify-center size-4">{metric.icon}</span>
                ) : (
                  defaultIcon(metric.accentColor)
                )}
              </div>
              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                <p className="text-[10px] text-muted-foreground truncate">{metric.label}</p>
                <p
                  className="text-sm font-semibold text-foreground tabular-nums leading-none tracking-tight truncate"
                  title={metric.value}
                >
                  {metric.value}
                </p>
                {metric.subtext && (
                  <p className="text-[10px] text-muted-foreground truncate">{metric.subtext}</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
