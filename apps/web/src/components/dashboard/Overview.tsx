import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type OverviewDataPoint = {
  name: string;
  total: number;
};

const chartConfig = {
  total: { label: "Billed", color: "var(--chart-1)" },
} satisfies ChartConfig;

function compactCurrency(value: number): string {
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${value}`;
}

interface OverviewProps {
  data?: OverviewDataPoint[];
  height?: number;
  valueFormatter?: (value: number) => string;
  emptyLabel?: string;
}

export function Overview({
  data = [],
  height = 250,
  valueFormatter = (val) => `$${val.toLocaleString()}`,
  emptyLabel = "Nothing billed yet.",
}: OverviewProps) {
  const hasActivity = data.some((point) => point.total > 0);

  if (!hasActivity) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          width={52}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => compactCurrency(Number(value))}
        />
        <ChartTooltip
          cursor={{ fill: "var(--color-muted)" }}
          content={
            <ChartTooltipContent
              indicator="line"
              formatter={(value) => [
                valueFormatter(Number(value)),
                chartConfig.total.label,
              ]}
            />
          }
        />
        <Bar
          dataKey="total"
          name={chartConfig.total.label}
          fill="var(--color-total)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}
