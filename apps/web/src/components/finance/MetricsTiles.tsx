import { CircleDollarSign, FileText, TrendingUp } from "lucide-react";

import { MetricStrip } from "@/components/dashboard/MetricStrip.tsx";
import { formatCurrency } from "./FinanceUtils.ts";

interface MetricsTilesProps {
  collected: number;
  outstanding: number;
  invoiceCount: number;
}

export default function MetricsTiles(props: MetricsTilesProps) {
  return (
    <MetricStrip
      metrics={[
        {
          label: "Collected",
          value: formatCurrency(props.collected),
          tone: "success",
          icon: <CircleDollarSign />,
        },
        {
          label: "Outstanding",
          value: formatCurrency(props.outstanding),
          tone: "warning",
          icon: <TrendingUp />,
        },
        {
          label: "Invoices",
          value: String(props.invoiceCount),
          icon: <FileText />,
        },
      ]}
    />
  );
}