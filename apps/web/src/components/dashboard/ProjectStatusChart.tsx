import * as React from "react";
import { Pie, PieChart } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface ProjectStatusChartProps {
  projects: { status: string }[];
}

const statusColors: Record<string, string> = {
  active: "var(--chart-1)",
  completed: "var(--chart-2)",
  on_hold: "var(--chart-3)",
  draft: "var(--chart-4)",
  cancelled: "var(--chart-5)",
};

const chartConfig = {
  active: { label: "Active", color: statusColors.active },
  completed: { label: "Completed", color: statusColors.completed },
  on_hold: { label: "On hold", color: statusColors.on_hold },
  draft: { label: "Draft", color: statusColors.draft },
  cancelled: { label: "Cancelled", color: statusColors.cancelled },
} satisfies ChartConfig;

export function ProjectStatusChart({ projects }: ProjectStatusChartProps) {
  const data = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of projects) {
      const status = project.status ?? "unknown";
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([status, count]) => ({
      status,
      count,
      fill: statusColors[status] ?? "var(--muted-foreground)",
    }));
  }, [projects]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">Projects by status</CardTitle>
        <CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">
          {projects.length} total
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="status"
              innerRadius={60}
              outerRadius={80}
              stroke="var(--card)"
              strokeWidth={2}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  nameKey="status"
                  labelFormatter={() => "Projects"}
                />
              }
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
