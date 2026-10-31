import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";
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
      <ErrorNotice tone="danger">{error}</ErrorNotice>
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
    <div className="txn-table-wrap">
      <table className="txn-table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Invoice</th>
            <th scope="col">Method</th>
            <th scope="col">Reference</th>
            <th scope="col" className="txn-amount">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.id}>
              <td className="txn-date">{formatDate(entry.paid_on)}</td>
              <td className="txn-invoice">{entry.invoice_number ?? "Payment"}</td>
              <td className="txn-method">
                <Badge variant={methodVariant(entry.payment_method)}>
                  {entry.payment_method ?? "Manual"}
                </Badge>
              </td>
              <td className="txn-reference">
                <span className="txn-ref-text">{entry.reference ?? "—"}</span>
                {entry.tx_signature && (
                  <a
                    href={explorerTxUrl(entry.tx_signature)}
                    target="_blank"
                    rel="noreferrer"
                    className="txn-explorer"
                  >
                    View on Explorer
                    <ExternalLink size={12} />
                  </a>
                )}
              </td>
              <td className="txn-amount">{formatCurrency(entry.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
