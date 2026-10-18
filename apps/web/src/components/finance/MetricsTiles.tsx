import { Banknote, Clock3, FileText } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "./FinanceUtils.ts";

interface MetricsTilesProps {
  collected: number;
  outstanding: number;
  invoiceCount: number;
}

const tiles = (props: MetricsTilesProps) => [
  {
    key: "collected",
    label: "Collected",
    value: formatCurrency(props.collected),
    caption: "recorded payments",
    accent: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    icon: <Banknote size={18} />,
  },
  {
    key: "outstanding",
    label: "Outstanding",
    value: formatCurrency(props.outstanding),
    caption: "open invoices",
    accent: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    icon: <Clock3 size={18} />,
  },
  {
    key: "invoices",
    label: "Invoices",
    value: String(props.invoiceCount),
    caption: "in this workspace",
    accent: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    icon: <FileText size={18} />,
  },
];

export default function MetricsTiles(props: MetricsTilesProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {tiles(props).map((tile) => (
        <div key={tile.key} className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", tile.accent)}>
              {tile.icon}
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tile.label}</p>
          </div>
          <p className="mt-3 font-mono text-2xl font-bold tabular-nums tracking-tight">{tile.value}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{tile.caption}</p>
        </div>
      ))}
    </div>
  );
}
