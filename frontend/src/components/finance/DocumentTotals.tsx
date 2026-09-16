import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { FinanceLineItem } from "./FinanceTypes.ts";
import { VAT_RATE, calcSubtotal } from "./FinanceUtils.ts";

interface DocumentTotalsProps {
  items?: FinanceLineItem[];
  subtotal?: number;
  vatRate?: number;
  totalLabel?: string;
  className?: string;
}

export function DocumentTotals({
  items,
  subtotal: subtotalProp,
  vatRate = VAT_RATE,
  totalLabel = "Total",
  className,
}: DocumentTotalsProps) {
  const subtotal =
    subtotalProp ?? (items ? calcSubtotal(items) : 0);
  const vat = subtotal * vatRate;
  const total = subtotal + vat;

  return (
    <div className={cn("flex justify-end", className)}>
      <div className="w-full max-w-xs rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="tabular-nums">
            {formatCurrency(subtotal)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">VAT ({Math.round(vatRate * 100)}%)</span>
          <span className="tabular-nums">
            {formatCurrency(vat)}
          </span>
        </div>
        <Separator />
        <div className="flex justify-between font-bold">
          <span>{totalLabel}</span>
          <span className="tabular-nums">
            {formatCurrency(total)}
          </span>
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
