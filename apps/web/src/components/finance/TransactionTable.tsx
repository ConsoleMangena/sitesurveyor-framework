import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { explorerTxUrl } from "@/features/phantom/lib/config.ts";
import type { PaymentWithInvoice } from "@/lib/repositories/payments.ts";
import { formatCurrency, formatDate } from "./FinanceUtils.ts";

interface TransactionTableProps {
  rows: PaymentWithInvoice[];
  loading: boolean;
  error: string | null;
}

function methodVariant(method: string | null): "purple" | "secondary" {
  return method?.toLowerCase().includes("solana") ? "purple" : "secondary";
}

export default function TransactionTable({ rows, loading, error }: TransactionTableProps) {
  if (error) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No payments recorded yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5">Date</th>
            <th className="px-4 py-2.5">Invoice</th>
            <th className="px-4 py-2.5">Method</th>
            <th className="px-4 py-2.5">Reference</th>
            <th className="px-4 py-2.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((entry) => (
            <tr key={entry.id} className="hover:bg-muted/30">
              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(entry.paid_on)}</td>
              <td className="px-4 py-3 font-medium">{entry.invoice_number ?? "Payment"}</td>
              <td className="px-4 py-3">
                <Badge variant={methodVariant(entry.payment_method)}>{entry.payment_method ?? "Manual"}</Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{entry.reference ?? "—"}</span>
                  {entry.tx_signature && (
                    <a
                      href={explorerTxUrl(entry.tx_signature)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
                    >
                      View on Explorer
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold tabular-nums">
                {formatCurrency(entry.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
