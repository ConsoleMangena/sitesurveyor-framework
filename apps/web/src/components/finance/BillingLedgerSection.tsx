import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Search, Undo2, Wallet } from "lucide-react";

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
  recordTransactionRefund,
  verifyOrder,
  type PesepayTransactionRow,
  type RefundOutcome,
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
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
] as const;

type KindFilter = (typeof KIND_FILTERS)[number]["value"];
type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

interface BillingLedgerSectionProps {
  workspaceId: string;
  refreshKey: number;
  onMessage: (message: PurchaseMessage | null) => void;
  /** Raised after a pending order resolves, so balances elsewhere refresh too. */
  onSettled: () => void;
  /** Only platform administrators can record a refund settled with PesePay. */
  isPlatformAdmin?: boolean;
}

/**
 * Turns what the server actually took back into a sentence, because a refund
 * rarely claws back everything: credits may already be spent and a deposit may
 * already be paid out.
 */
function describeRefund(row: PesepayTransactionRow, outcome: RefundOutcome): string {
  const parts = ["Refund recorded."];
  if (row.kind === "ai_credit_purchase" && outcome.creditsGranted > 0) {
    parts.push(
      outcome.creditsReclaimed >= outcome.creditsGranted
        ? `${outcome.creditsReclaimed.toLocaleString()} credits taken back.`
        : `Only ${outcome.creditsReclaimed.toLocaleString()} of the ${outcome.creditsGranted.toLocaleString()} credits granted were still in the balance to take back.`,
    );
  }
  if (row.kind === "storage_purchase" && outcome.storageMbRevoked > 0) {
    parts.push(
      `${outcome.storageMbRevoked.toLocaleString()} MB of purchased storage stopped counting. Stored files are untouched.`,
    );
  }
  if (row.kind === "deposit") {
    parts.push(
      Number(outcome.balanceReclaimed) >= Number(row.amount)
        ? `${formatMoney(Number(row.amount), row.currency_code)} removed from the PesePay balance.`
        : `Only ${formatMoney(Number(outcome.balanceReclaimed), row.currency_code)} was left in the PesePay balance to take back.`,
    );
  }
  if (row.kind === "invoice_payment") {
    parts.push("The invoice was already delivered, so nothing else changed.");
  }
  return parts.join(" ");
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
    "refunded_at",
    "refund_reason",
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
      row.refunded_at,
      row.refund_reason,
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
  isPlatformAdmin = false,
}: BillingLedgerSectionProps) {
  const [rows, setRows] = useState<PesepayTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refunding, setRefunding] = useState(false);

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
      if (status !== "all" && row.status !== status) return false;
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
      refunded: filtered
        .filter((row) => row.status === "refunded")
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

  const recordRefund = async (row: PesepayTransactionRow) => {
    const reason = refundReason.trim();
    if (reason.length < 3) return;
    setRefunding(true);
    try {
      const outcome = await recordTransactionRefund(row.id, reason);
      onMessage({ tone: "success", text: describeRefund(row, outcome) });
      setRefundFor(null);
      setRefundReason("");
      await load();
      onSettled();
    } catch (err: unknown) {
      onMessage({
        tone: "error",
        text: err instanceof Error ? err.message : "Unable to record this refund.",
      });
    } finally {
      setRefunding(false);
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
            {totals.refunded > 0 ? (
              <span>
                Refunded:{" "}
                <span className="font-mono tabular-nums text-foreground">
                  {formatMoney(totals.refunded)}
                </span>
              </span>
            ) : null}
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
                        <TableCell className="hidden md:table-cell max-w-[260px] text-sm text-muted-foreground">
                          <span className="block truncate">{row.description}</span>
                          {row.status === "refunded" && row.refund_reason ? (
                            <span className="block truncate text-xs">
                              Refund: {row.refund_reason}
                            </span>
                          ) : null}
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
                          ) : isPlatformAdmin && row.status === "completed" ? (
                            refundFor === row.id ? (
                              <div className="flex flex-col items-end gap-1">
                                <Input
                                  value={refundReason}
                                  onChange={(event) => setRefundReason(event.target.value)}
                                  placeholder="Provider refund reference"
                                  className="h-8 w-44 text-xs"
                                  aria-label="Reason for this refund"
                                />
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7"
                                    disabled={refunding || refundReason.trim().length < 3}
                                    onClick={() => void recordRefund(row)}
                                  >
                                    {refunding ? <Loader2 className="animate-spin" /> : null}
                                    Record refund
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7"
                                    onClick={() => {
                                      setRefundFor(null);
                                      setRefundReason("");
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5"
                                onClick={() => {
                                  setRefundFor(row.id);
                                  setRefundReason("");
                                }}
                              >
                                <Undo2 size={13} />
                                Refund
                              </Button>
                            )
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
            payment completed, so a payment is never counted twice. PesePay exposes no refund
            call to this integration, so the money is settled with the provider first and then
            recorded here; recording it takes back the credits, storage window or wallet
            balance the payment granted, capped at what the workspace still holds.
          </p>
        </CardContent>
      </Card>
    </DashboardSection>
  );
}
