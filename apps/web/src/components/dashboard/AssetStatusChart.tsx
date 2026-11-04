import * as React from "react";
import { PieChart as ChartPieIcon } from "lucide-react";
import { Pie, PieChart } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart.tsx";
import { DashboardCard } from "./DashboardCard.tsx";
import { PanelMeta } from "./DashboardShell.tsx";

/** Keyed by the raw asset status values, so the lookup actually matches. */
const STATUS_COLORS: Record<string, string> = {
  available: "var(--chart-1)",
  deployed: "var(--chart-2)",
  maintenance: "var(--chart-3)",
  retired: "var(--chart-4)",
};

const STATUS_FALLBACK = "var(--chart-5)";

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

interface AssetStatusChartProps {
  assets: { status: string }[];
}

export function AssetStatusChart({ assets }: AssetStatusChartProps) {
  const data = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const asset of assets) {
      const status = asset.status ?? "unknown";
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([status, value]) => ({
        status,
        name: statusLabel(status),
        value,
        fill: STATUS_COLORS[status] ?? STATUS_FALLBACK,
      }))
      .sort((a, b) => b.value - a.value);
  }, [assets]);

  const config = React.useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        data.map((item) => [
          item.status,
          { label: item.name, color: item.fill },
        ]),
      ),
    [data],
  );

  const total = assets.length;

  if (total === 0) {
    return (
      <DashboardCard title="Status breakdown" icon={<ChartPieIcon />}>
        <div className="py-6 text-center text-sm text-muted-foreground">
          No assets to display.
        </div>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard
      title="Status breakdown"
      icon={<ChartPieIcon />}
      titleAction={<PanelMeta>{total}</PanelMeta>}
      className="h-full"
      contentClassName="flex flex-col justify-center"
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
        <div className="w-full max-w-[190px] shrink-0">
          <ChartContainer config={config} className="h-[170px] w-full">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="status"
                innerRadius={52}
                outerRadius={74}
                paddingAngle={2}
                stroke="var(--card)"
                strokeWidth={2}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="status"
                    labelFormatter={() => "Assets"}
                  />
                }
              />
            </PieChart>
          </ChartContainer>
        </div>

        <ul className="flex w-full min-w-0 flex-col gap-2">
          {data.map((entry) => (
            <li
              key={entry.status}
              className="flex items-center justify-between gap-3 text-xs"
            >
              <span className="flex min-w-0 items-center gap-2 text-foreground">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.fill }}
                />
                <span className="truncate">{entry.name}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {entry.value} · {Math.round((entry.value / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </DashboardCard>
  );
}
