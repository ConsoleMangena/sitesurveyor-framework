import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Search, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { DashboardSection } from "@/components/dashboard/DashboardShell.tsx";
import {
  listPesepayTransactions,
  verifyOrder,
  type PesepayTransactionRow,
} from "../../lib/repositories/pesepay.ts";
import {
  formatMoney,
  pesepayKindLabel,
  pesepayStatusLabel,
  pesepayStatusVariant,
} from "./FinanceUtils.ts";
import type { PurchaseMessage } from "./PackageCatalog.tsx";

const KIND_FILTERS = [
  { value: "all", label: "All" },
  { value: "deposit", label: "Deposits" },
  { value: "ai_credit_purchase", label: "AI credits" },
  { value: "storage_purchase", label: "Storage" },
  { value: "invoice_payment", label: "Invoices" },
] as const;

const STATUS_FILTERS = [
  { value: "all", label: "Any status" },
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
] as const;

type KindFilter = (typeof KIND_FILTERS)[number]["value"];
type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

interface BillingLedgerSectionProps {
  workspaceId: string;
  refreshKey: number;
  onMessage: (message: PurchaseMessage | null) => void;
  /** Raised after a pending order resolves, so balances elsewhere refresh too. */
  onSettled: () => void;
}

function downloadCsv(rows: PesepayTransactionRow[]) {
  const header = [
    "created_at",
    "completed_at",
    "kind",
    "description",
    "amount",
    "currency",
    "payment_method",
    "status",
    "provider_status",
    "package_id",
    "credits",
    "storage_mb",
    "duration_days",
    "payment_fee",
    "infrastructure_cost",
    "reference",
  ];
  const escape = (value: unknown) => {
    const str = String(value ?? "");
    return /[",\n]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
  };
  const lines = rows.map((row) =>
    [
      row.created_at,
      row.completed_at,
      pesepayKindLabel(row.kind),
      row.description,
      row.amount,
      row.currency_code,
      row.kind === "deposit" ? "PesePay deposit" : row.status === "completed" && row.pesepay_reference ? "PesePay" : "Balance",
      row.status,
      row.provider_status,
      row.package_id,
      row.credit_amount,
      row.storage_mb,
      row.duration_days,
      row.estimated_payment_fee,
      row.estimated_infrastructure_cost,
      row.pesepay_reference,
    ]
      .map(escape)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `site-surveyor-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function BillingLedgerSection({
  workspaceId,
  refreshKey,
  onMessage,
  onSettled,
}: BillingLedgerSectionProps) {
  const [rows, setRows] = useState<PesepayTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setRows(await listPesepayTransactions(workspaceId, 50));
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to load transaction history.",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (kind !== "all" && row.kind !== kind) return false;
      if (status !== "all") {
        if (status === "failed" && row.status !== "failed" && row.status !== "cancelled") {
          return false;
        }
        if (status !== "failed" && row.status !== status) return false;
      }
      if (query) {
        const haystack = `${row.description} ${row.pesepay_reference ?? ""} ${row.package_id ?? ""}`;
        if (!haystack.toLowerCase().includes(query)) return false;
      }
      return true;
    });
  }, [rows, kind, status, search]);

  const totals = useMemo(() => {
    const completed = filtered.filter((row) => row.status === "completed");
    return {
      spent: completed
        .filter((row) => row.kind !== "deposit")
        .reduce((sum, row) => sum + Number(row.amount), 0),
      deposited: completed
        .filter((row) => row.kind === "deposit")
        .reduce((sum, row) => sum + Number(row.amount), 0),
      pending: filtered.filter((row) => row.status === "pending").length,
    };
  }, [filtered]);

  const checkPending = async (row: PesepayTransactionRow) => {
    setCheckingId(row.id);
    try {
      const result = await verifyOrder({ workspaceId, orderId: row.id });
      if (result.status === "completed") {
        onMessage({
          tone: "success",
          text: `${pesepayKindLabel(row.kind)} confirmed by PesePay and added to this workspace.`,
        });
      } else if (result.status === "pending") {
        onMessage({
          tone: "pending",
          text: "PesePay has not confirmed this payment yet. If you completed it, check again shortly.",
        });
      } else {
        onMessage({
          tone: "error",
          text: `This payment ended as ${pesepayStatusLabel(result.status)}. Nothing was charged to your balance.`,
        });
      }
      await load();
      onSettled();
    } catch (err: unknown) {
      onMessage({
        tone: "error",
        text:
          err instanceof Error
            ? err.message
            : "Unable to check this payment with PesePay right now.",
      });
    } finally {
      setCheckingId(null);
    }
  };

  return (
    <DashboardSection title="Transactions">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Financial history</CardTitle>
          <CardDescription>
            Every deposit, package purchase, invoice payment and refund, with the
            provider reference and the fee recorded at the time of purchase.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {KIND_FILTERS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={kind === option.value ? "default" : "outline"}
                onClick={() => setKind(option.value)}
              >
                {option.label}
              </Button>
            ))}
            <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
            {STATUS_FILTERS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={status === option.value ? "default" : "outline"}
                onClick={() => setStatus(option.value)}
              >
                {option.label}
              </Button>
            ))}
            <div className="relative w-full sm:ml-auto sm:w-52">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search reference…"
                className="h-9 pl-8"
                aria-label="Search transactions"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => downloadCsv(filtered)}
              disabled={filtered.length === 0}
            >
              <Download size={14} />
              CSV
            </Button>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>
              Spent in view:{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatMoney(totals.spent)}
              </span>
            </span>
            <span>
              Deposited:{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatMoney(totals.deposited)}
              </span>
            </span>
            <span>
              Awaiting confirmation:{" "}
              <span className="font-mono tabular-nums text-foreground">{totals.pending}</span>
            </span>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading transactions…
            </div>
          ) : filtered.length === 0 ? (
            <Empty className="gap-4 border border-dashed p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Wallet />
                </EmptyMedia>
                <EmptyTitle className="text-base">No transactions match</EmptyTitle>
                <EmptyDescription>
                  Deposits, credit and storage purchases, invoice payments and refunds all
                  land here once PesePay confirms them.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {(kind !== "all" || status !== "all" || search.trim()) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setKind("all");
                      setStatus("all");
                      setSearch("");
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </EmptyContent>
            </Empty>
          ) : (
            <div className="border rounded-none overflow-hidden">
              <ResponsiveTable>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="hidden md:table-cell">Detail</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="hidden lg:table-cell text-right">Fee</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Reference</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          <time dateTime={row.created_at}>
                            {new Date(row.created_at).toLocaleString()}
                          </time>
                        </TableCell>
                        <TableCell className="text-sm">{pesepayKindLabel(row.kind)}</TableCell>
                        <TableCell className="hidden md:table-cell max-w-[260px] truncate text-sm text-muted-foreground">
                          {row.description}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {row.kind === "deposit" ? "+ " : ""}
                          {formatMoney(Number(row.amount), row.currency_code)}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {Number(row.estimated_payment_fee) > 0
                            ? formatMoney(Number(row.estimated_payment_fee), row.currency_code)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={pesepayStatusVariant(row.status)}>
                            {pesepayStatusLabel(row.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {row.pesepay_reference ? (
                            <span
                              className="block max-w-40 truncate font-mono text-xs"
                              title={row.pesepay_reference}
                            >
                              {row.pesepay_reference}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.status === "pending" && row.kind !== "invoice_payment" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={checkingId === row.id}
                              onClick={() => void checkPending(row)}
                            >
                              {checkingId === row.id ? (
                                <Loader2 className="animate-spin" />
                              ) : null}
                              Check
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ResponsiveTable>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Statuses come from PesePay&rsquo;s encrypted check-payment response, never from
            the browser. Allocation happens in the same database transaction that marks the
            payment completed, so a payment is never counted twice.
          </p>
        </CardContent>
      </Card>
    </DashboardSection>
  );
}
