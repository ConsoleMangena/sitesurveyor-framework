import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type AnalyticsDataPoint = {
  name: string;
  clicks: number;
  uniques: number;
};

const defaultData: AnalyticsDataPoint[] = [
  { name: "Mon", clicks: 420, uniques: 240 },
  { name: "Tue", clicks: 680, uniques: 390 },
  { name: "Wed", clicks: 510, uniques: 310 },
  { name: "Thu", clicks: 790, uniques: 480 },
  { name: "Fri", clicks: 860, uniques: 530 },
  { name: "Sat", clicks: 390, uniques: 210 },
  { name: "Sun", clicks: 430, uniques: 250 },
];

interface AnalyticsChartProps {
  data?: AnalyticsDataPoint[];
  height?: number;
}

export function AnalyticsChart({
  data = defaultData,
  height = 300,
}: AnalyticsChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <XAxis
          dataKey="name"
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
            borderRadius: "0.5rem",
            color: "var(--foreground)",
            fontSize: "12px",
          }}
        />
        <Area
          type="monotone"
          dataKey="clicks"
          stroke="currentColor"
          className="text-primary"
          fill="currentColor"
          fillOpacity={0.15}
        />
        <Area
          type="monotone"
          dataKey="uniques"
          stroke="currentColor"
          className="text-muted-foreground"
          fill="currentColor"
          fillOpacity={0.1}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

