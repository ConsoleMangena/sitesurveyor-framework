import * as React from "react";
import { format, parseISO, subDays } from "date-fns";
import { TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { WorkspaceRowAdmin } from "@/lib/repositories/adminPlatform";

interface WorkspaceGrowthChartProps {
  workspaces: WorkspaceRowAdmin[];
}

const chartConfig = {
  count: {
    label: "New workspaces",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function WorkspaceGrowthChart({ workspaces }: WorkspaceGrowthChartProps) {
  const data = React.useMemo(() => {
    const today = new Date();
    const days = 30;
    const buckets = new Map<string, number>();

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(today, i);
      buckets.set(format(date, "yyyy-MM-dd"), 0);
    }

    for (const ws of workspaces) {
      const date = format(parseISO(ws.created_at), "yyyy-MM-dd");
      if (buckets.has(date)) {
        buckets.set(date, (buckets.get(date) ?? 0) + 1);
      }
    }

    return Array.from(buckets.entries()).map(([date, count]) => ({
      date,
      label: format(parseISO(date), "MMM d"),
      count,
    }));
  }, [workspaces]);

  const total = data.reduce((sum, day) => sum + day.count, 0);
  const peak = data.reduce((max, day) => Math.max(max, day.count), 0);
  const average = total / (data.length || 1);
  // Every fifth day: the card spans the whole row now, and two end labels leave
  // the rest of a 1100px axis unexplained.
  const ticks = Array.from(
    new Set(
      data
        .filter((_, index) => index % 5 === 0)
        .map((day) => day.date)
        .concat(data[data.length - 1]?.date ? [data[data.length - 1].date] : []),
    ),
  );

  return (
    <DashboardCard
      className="h-full"
      title="Workspace growth"
      icon={<TrendingUp className="size-4" />}
      titleAction={<Badge variant="outline">Last 30 days</Badge>}
      contentClassName="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="text-2xl font-semibold leading-none tracking-tight tabular-nums">
            {total}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">new workspaces</p>
        </div>
        <div className="flex gap-6 text-xs text-muted-foreground">
          <span>
            <span className="block font-medium text-foreground tabular-nums">
              {peak}
            </span>
            busiest day
          </span>
          <span>
            <span className="block font-medium text-foreground tabular-nums">
              {average.toFixed(1)}
            </span>
            per day
          </span>
        </div>
      </div>

      {total === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center text-sm text-muted-foreground">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          <p>No workspaces created in the last 30 days.</p>
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-[190px] w-full sm:h-60">
          <AreaChart data={data} margin={{ bottom: 0, left: 0, right: 0, top: 8 }}>
            <defs>
              <linearGradient id="fillWorkspaces" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.28} />
                <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              axisLine={false}
              tick={{ fontSize: 11 }}
              tickFormatter={(value) => format(parseISO(value), "MMM d")}
              tickLine={false}
              tickMargin={8}
              ticks={ticks}
            />
            <YAxis axisLine={false} tickLine={false} tickMargin={6} width={32} allowDecimals={false} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => format(parseISO(String(value)), "MMMM d, yyyy")}
                />
              }
              cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
            />
            <Area
              dataKey="count"
              dot={false}
              fill="url(#fillWorkspaces)"
              name="New workspaces"
              stroke="var(--color-count)"
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ChartContainer>
      )}
    </DashboardCard>
  );
}
