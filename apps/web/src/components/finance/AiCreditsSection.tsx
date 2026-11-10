import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { KpiCard, KpiGrid } from "@/components/dashboard/KpiCard.tsx";
import {
  getAiCreditBalance,
  listAiCreditTransactions,
  reverseAiCreditEntry,
  type AiCreditTransactionRow,
} from "../../lib/repositories/pesepay.ts";
import { formatDate } from "./FinanceUtils.ts";
import PackageCatalog, { type PurchaseMessage } from "./PackageCatalog.tsx";

const KIND_LABELS: Record<string, string> = {
  purchase: "Purchase",
  usage: "AI usage",
  refund: "Refund",
  reversal: "Reversal",
  adjustment: "Adjustment",
};

/** Kinds a reversal can be appended against; reversals reverse nothing. */
const REVERSIBLE_KINDS = new Set(["purchase", "usage", "refund"]);

interface AiCreditsSectionProps {
  workspaceId: string;
  walletBalance: number;
  /** Bumped by the parent after a purchase or a verified return so tables reload. */
  refreshKey: number;
  onMessage: (message: PurchaseMessage | null) => void;
  /** Reversing an entry is an accounting correction, so only admins get the control. */
  isPlatformAdmin?: boolean;
}

export default function AiCreditsSection({
  workspaceId,
  walletBalance,
  refreshKey,
  onMessage,
  isPlatformAdmin = false,
}: AiCreditsSectionProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [entries, setEntries] = useState<AiCreditTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reversalFor, setReversalFor] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversing, setReversing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [nextBalance, nextEntries] = await Promise.all([
        getAiCreditBalance(workspaceId),
        listAiCreditTransactions(workspaceId),
      ]);
      setBalance(nextBalance);
      setEntries(nextEntries);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load AI credits.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const purchased = entries
    .filter((entry) => entry.kind === "purchase")
    .reduce((sum, entry) => sum + Number(entry.credits_delta), 0);
  const used = entries
    .filter((entry) => entry.kind === "usage")
    .reduce((sum, entry) => sum + Math.abs(Number(entry.credits_delta)), 0);

  const reversedIds = new Set(
    entries
      .filter((entry) => entry.kind === "reversal" && entry.related_id)
      .map((entry) => String(entry.related_id)),
  );

  const closeReversal = () => {
    setReversalFor(null);
    setReversalReason("");
  };

  const handleReverse = async (entryId: string) => {
    setReversing(true);
    setError(null);
    try {
      await reverseAiCreditEntry(workspaceId, entryId, reversalReason);
      closeReversal();
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to reverse that entry.");
    } finally {
      setReversing(false);
    }
  };

  const columnCount = isPlatformAdmin ? 6 : 5;

  return (
    <DashboardSection title="AI credits">
      <KpiGrid>
        <KpiCard
          title="Available credits"
          value={loading ? "…" : (balance ?? 0).toLocaleString()}
          subtext={`${used.toLocaleString()} used`}
          tone="primary"
          icon={<Sparkles />}
        />
        <KpiCard
          title="Credits purchased"
          value={purchased.toLocaleString()}
          icon={<Coins />}
        />
      </KpiGrid>

      <PackageCatalog
        workspaceId={workspaceId}
        kind="ai_credits"
        walletBalance={walletBalance}
        headline={(pkg) =>
          `${(pkg.credits ?? 0).toLocaleString()} AI credits`
        }
        unitNote={(pkg) =>
          pkg.credits
            ? `$${(pkg.amount / pkg.credits).toFixed(3)} per credit`
            : null
        }
        onMessage={onMessage}
        onChanged={load}
      />

      <div className="border rounded-none overflow-hidden">
        <ResponsiveTable>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden sm:table-cell">Detail</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead className="hidden md:table-cell text-right">Balance after</TableHead>
                {isPlatformAdmin && <TableHead className="text-right">Correction</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={columnCount}>
                    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading credit ledger…
                    </div>
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={columnCount} className="py-6 text-sm text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columnCount} className="py-6 text-sm text-muted-foreground">
                    No credit activity yet.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(entry.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={entry.kind === "usage" ? "secondary" : "success"}>
                        {KIND_LABELS[entry.kind] ?? entry.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell max-w-[280px] truncate text-sm text-muted-foreground">
                      {entry.description}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm tabular-nums ${
                        Number(entry.credits_delta) < 0 ? "text-destructive" : "text-success"
                      }`}
                    >
                      {Number(entry.credits_delta) > 0 ? "+" : ""}
                      {Number(entry.credits_delta).toLocaleString()}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right font-mono text-sm tabular-nums">
                      {Number(entry.balance_after).toLocaleString()}
                    </TableCell>
                    {isPlatformAdmin && (
                      <TableCell className="text-right">
                        {reversalFor === entry.id ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Input
                              aria-label="Reason for this reversal"
                              value={reversalReason}
                              onChange={(event) => setReversalReason(event.target.value)}
                              placeholder="Reason"
                              className="h-8 w-32 text-xs"
                            />
                            <Button
                              size="sm"
                              disabled={reversing || reversalReason.trim().length < 3}
                              onClick={() => void handleReverse(entry.id)}
                            >
                              {reversing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              Confirm
                            </Button>
                            <Button size="sm" variant="ghost" onClick={closeReversal}>
                              Cancel
                            </Button>
                          </div>
                        ) : REVERSIBLE_KINDS.has(entry.kind) && !reversedIds.has(entry.id) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReversalFor(entry.id);
                              setReversalReason("");
                            }}
                          >
                            Reverse
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {reversedIds.has(entry.id) ? "Reversed" : "—"}
                          </span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ResponsiveTable>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Refresh
        </Button>
      </div>
    </DashboardSection>
  );
}
