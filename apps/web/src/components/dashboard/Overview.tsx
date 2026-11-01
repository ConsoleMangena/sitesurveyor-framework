import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type OverviewDataPoint = {
  name: string;
  total: number;
};

const defaultData: OverviewDataPoint[] = [
  { name: "Jan", total: 1800 },
  { name: "Feb", total: 2400 },
  { name: "Mar", total: 2100 },
  { name: "Apr", total: 3200 },
  { name: "May", total: 2800 },
  { name: "Jun", total: 3900 },
  { name: "Jul", total: 4200 },
  { name: "Aug", total: 3800 },
  { name: "Sep", total: 4600 },
  { name: "Oct", total: 5100 },
  { name: "Nov", total: 4800 },
  { name: "Dec", total: 5400 },
];

interface OverviewProps {
  data?: OverviewDataPoint[];
  height?: number;
  valueFormatter?: (value: number) => string;
}

export function Overview({
  data = defaultData,
  height = 350,
  valueFormatter = (val) => `$${val}`,
}: OverviewProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
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
          tickFormatter={(value) => valueFormatter(value as number)}
        />
        <Tooltip
          formatter={(value: any) => [valueFormatter(Number(value)), "Total"]}
          contentStyle={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
            borderRadius: "0.5rem",
            color: "var(--foreground)",
            fontSize: "12px",
          }}
        />
        <Bar
          dataKey="total"
          fill="currentColor"
          radius={[4, 4, 0, 0]}
          className="fill-primary"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

