import { CircleDollarSign, FileText, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency } from "./FinanceUtils.ts";

interface MetricsTilesProps {
  collected: number;
  outstanding: number;
  invoiceCount: number;
}

type TileTone = "success" | "warning" | "neutral";

const toneClasses: Record<TileTone, string> = {
  success: "text-success",
  warning: "text-warning",
  neutral: "text-foreground",
};

const tiles = (props: MetricsTilesProps) => [
  {
    key: "collected",
    label: "Collected",
    value: formatCurrency(props.collected),
    caption: "Recorded payments",
    tone: "success" as TileTone,
    icon: CircleDollarSign,
    money: true,
  },
  {
    key: "outstanding",
    label: "Outstanding",
    value: formatCurrency(props.outstanding),
    caption: "Open invoices",
    tone: "warning" as TileTone,
    icon: TrendingUp,
    money: true,
  },
  {
    key: "invoices",
    label: "Invoices",
    value: String(props.invoiceCount),
    caption: "In this workspace",
    tone: "neutral" as TileTone,
    icon: FileText,
    money: false,
  },
];

export default function MetricsTiles(props: MetricsTilesProps) {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="list"
      aria-label="Treasury totals"
    >
      {tiles(props).map((tile) => {
        const Icon = tile.icon;
        return (
          <Card key={tile.key} role="listitem" className="gap-4 border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{tile.label}</CardTitle>
              <Icon className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "text-2xl font-bold tabular-nums",
                  tile.money && "font-mono",
                  toneClasses[tile.tone],
                )}
              >
                {tile.value}
              </div>
              <p className="text-xs text-muted-foreground">{tile.caption}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
