import * as React from "react";
import { PieChart as PieChartIcon } from "lucide-react";
import { Pie, PieChart } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { PanelMeta } from "@/components/dashboard/DashboardShell";

interface ProjectStatusChartProps {
  projects: { status: string }[];
}

/** Keys are the real project_status enum values (draft, active, completed,
 *  on_hold, archived) — anything else falls back to muted. */
const statusColors: Record<string, string> = {
  active: "var(--chart-1)",
  completed: "var(--chart-2)",
  on_hold: "var(--chart-3)",
  draft: "var(--chart-4)",
  archived: "var(--chart-5)",
};

const statusLabels: Record<string, string> = {
  active: "Active",
  completed: "Completed",
  on_hold: "On hold",
  draft: "Draft",
  archived: "Archived",
};

const chartConfig = {
  active: { label: "Active", color: statusColors.active },
  completed: { label: "Completed", color: statusColors.completed },
  on_hold: { label: "On hold", color: statusColors.on_hold },
  draft: { label: "Draft", color: statusColors.draft },
  archived: { label: "Archived", color: statusColors.archived },
} satisfies ChartConfig;

function statusLabel(status: string): string {
  if (statusLabels[status]) return statusLabels[status];
  const pretty = status.replace(/_/g, " ").toLowerCase();
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

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

  const total = projects.length;

  return (
    <DashboardCard
      title="Projects by status"
      icon={<PieChartIcon size={16} />}
      titleAction={<PanelMeta>{total} total</PanelMeta>}
      className="h-full"
      contentClassName="flex flex-col justify-center"
    >
      {total === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No projects to chart yet.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
          <div className="w-full max-w-[210px] shrink-0">
            <ChartContainer config={chartConfig} className="h-[170px] w-full">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="count"
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
                      labelFormatter={() => "Projects"}
                    />
                  }
                />
              </PieChart>
            </ChartContainer>
          </div>

          <ul className="flex w-full min-w-0 flex-col gap-2">
            {data
              .slice()
              .sort((a, b) => b.count - a.count)
              .map((entry) => (
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
                    <span className="truncate">{statusLabel(entry.status)}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {entry.count} · {Math.round((entry.count / total) * 100)}%
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </DashboardCard>
  );
}
