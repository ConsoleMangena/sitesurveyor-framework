import { ExternalLink, ReceiptText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ReceiptText className="h-5 w-5" />
          </EmptyMedia>
          <EmptyTitle>No payments recorded yet.</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Date</TableHead>
            <TableHead scope="col">Invoice</TableHead>
            <TableHead scope="col">Method</TableHead>
            <TableHead scope="col">Reference</TableHead>
            <TableHead scope="col" className="text-right">
              Amount
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatDate(entry.paid_on)}
              </TableCell>
              <TableCell className="font-medium">
                {entry.invoice_number ?? "Payment"}
              </TableCell>
              <TableCell>
                <Badge variant={methodVariant(entry.payment_method)}>
                  {entry.payment_method ?? "Manual"}
                </Badge>
              </TableCell>
              <TableCell>
                <span className="block max-w-[190px] truncate font-mono text-xs text-muted-foreground">
                  {entry.reference ?? "—"}
                </span>
                {entry.tx_signature && (
                  <a
                    href={explorerTxUrl(entry.tx_signature)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    View on Explorer
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold tabular-nums">
                {formatCurrency(entry.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
