import * as React from "react";
import { format, parseISO, subDays } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface ProjectTimelineChartProps {
  projects: { created_at: string }[];
  days?: number;
}

const chartConfig = {
  count: {
    label: "New projects",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function ProjectTimelineChart({ projects, days = 30 }: ProjectTimelineChartProps) {
  const data = React.useMemo(() => {
    const today = new Date();
    const buckets = new Map<string, number>();

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(today, i);
      buckets.set(format(date, "yyyy-MM-dd"), 0);
    }

    for (const project of projects) {
      const date = format(parseISO(project.created_at), "yyyy-MM-dd");
      if (buckets.has(date)) {
        buckets.set(date, (buckets.get(date) ?? 0) + 1);
      }
    }

    return Array.from(buckets.entries()).map(([date, count]) => ({
      date,
      count,
    }));
  }, [projects, days]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">Project pipeline</CardTitle>
        <CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">
          Last {days} days
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <AreaChart data={data} margin={{ bottom: 0, left: 0, right: 0, top: 8 }}>
            <defs>
              <linearGradient id="fillProjects" x1="0" x2="0" y1="0" y2="1">
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
              ticks={[data[0]?.date, data[data.length - 1]?.date].filter(Boolean) as string[]}
            />
            <YAxis axisLine={false} tickLine={false} tickMargin={6} width={36} allowDecimals={false} />
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
              fill="url(#fillProjects)"
              name="New projects"
              stroke="var(--color-count)"
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
