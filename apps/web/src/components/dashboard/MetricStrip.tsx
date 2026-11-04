import * as React from "react";

import { KpiCard, KpiCardSkeleton, KpiGrid, type KpiTone } from "./KpiCard.tsx";

export interface MetricStripMetric {
  label: string;
  value: string;
  /** Only facts the label and value cannot carry. Never a restatement. */
  subtext?: string;
  tone?: KpiTone;
  icon?: React.ReactNode;
  onClick?: () => void;
}

interface MetricStripProps {
  metrics: MetricStripMetric[];
  loading?: boolean;
  className?: string;
}

export function MetricStrip({ metrics, loading = false, className }: MetricStripProps) {
  return (
    <KpiGrid data-testid="metric-strip" loading={loading} className={className}>
      {loading
        ? Array.from({ length: 4 }).map((_, index) => (
            <KpiCardSkeleton key={index} />
          ))
        : metrics.map((metric, index) => (
            <KpiCard
              key={metric.label + index}
              title={metric.label}
              value={metric.value}
              subtext={metric.subtext}
              tone={metric.tone ?? "neutral"}
              icon={metric.icon}
              onClick={metric.onClick}
            />
          ))}
    </KpiGrid>
  );
}
