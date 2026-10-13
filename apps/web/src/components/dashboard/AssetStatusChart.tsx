import * as React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart.tsx";
import type { ChartConfig } from "@/components/ui/chart.tsx";
import { DashboardCard } from "./DashboardCard.tsx";

const STATUS_COLORS: Record<string, string> = {
  Available: "hsl(var(--chart-1))",
  Deployed: "hsl(var(--chart-2))",
  Maintenance: "hsl(var(--chart-3))",
  Retired: "hsl(var(--chart-4))",
};

const STATUS_FALLBACK = "hsl(var(--chart-5))";

interface AssetStatusChartProps {
  assets: { status: string }[];
}

export function AssetStatusChart({ assets }: AssetStatusChartProps) {
  const data = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const asset of assets) {
      counts[asset.status] = (counts[asset.status] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [assets]);

  const total = React.useMemo(
    () => data.reduce((sum, item) => sum + item.value, 0),
    [data],
  );

  const config = React.useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {};
    data.forEach((item) => {
      cfg[item.name] = { label: item.name, color: STATUS_COLORS[item.name] ?? STATUS_FALLBACK };
    });
    return cfg;
  }, [data]);

  if (data.length === 0) {
    return (
      <DashboardCard title="Status Breakdown" icon={<span className="text-base">◎</span>}>
        <div className="py-6 text-center text-sm text-muted-foreground">No assets to display.</div>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard title="Status Breakdown" icon={<span className="text-base">◎</span>}>
      <div className="flex flex-col">
        <ChartContainer config={config} className="aspect-square max-h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                strokeWidth={2}
                stroke="var(--background)"
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={STATUS_COLORS[entry.name] ?? STATUS_FALLBACK}
                  />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Legend
                verticalAlign="bottom"
                height={36}
                iconType="circle"
                formatter={(value: string, _entry: unknown, index: number) => (
                  <span className="text-xs text-muted-foreground">
                    {value} ({data[index].value})
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
        <div className="mt-2 text-center text-xs text-muted-foreground">
          {total} asset{total === 1 ? "" : "s"} registered
        </div>
      </div>
    </DashboardCard>
  );
}
