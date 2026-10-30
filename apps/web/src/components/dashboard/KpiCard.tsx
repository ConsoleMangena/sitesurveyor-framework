import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import "./dashboard.css";

type KpiTone =
  | "neutral"
  | "primary"
  | "success"
  | "info"
  | "warning"
  | "purple";

const TONE_ACCENTS: Record<KpiTone, string> = {
  neutral: "var(--text-muted)",
  primary: "var(--accent)",
  success: "var(--color-success)",
  info: "var(--color-info)",
  warning: "var(--color-warning)",
  purple: "var(--accent-purple)",
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
  const accent = { "--kpi-accent": TONE_ACCENTS[tone] } as React.CSSProperties;

  if (size === "compact") {
    return (
      <Card
        style={accent}
        className={cn("kpi-tile kpi-tile--compact", className)}
      >
        <span aria-hidden className="kpi-tile-rule" />
        <CardContent className="kpi-tile-content">
          <span aria-hidden className="kpi-tile-chip">
            {icon}
          </span>
          <div className="kpi-tile-text">
            <p className="kpi-tile-label">{title}</p>
            <p className="kpi-tile-value">{value}</p>
          </div>
          {badge ? <div className="ml-auto shrink-0">{badge}</div> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card style={accent} className={cn("kpi-tile", className)}>
      <span aria-hidden className="kpi-tile-rule" />
      <CardContent className="kpi-tile-content">
        <div className="kpi-tile-top">
          <span aria-hidden className="kpi-tile-chip">
            {icon}
          </span>
          {badge}
        </div>
        <div className="kpi-tile-text">
          <p className="kpi-tile-label" title={title}>
            {title}
          </p>
          <p className="kpi-tile-value" title={typeof value === "string" ? value : undefined}>
            {value}
          </p>
          {subtext ? (
            <p className="kpi-tile-sub" title={typeof subtext === "string" ? subtext : undefined}>
              {subtext}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
