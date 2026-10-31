import { useCallback, useState } from "react";
import { RefreshCw, Loader2, ChevronDown, Activity } from "lucide-react";

import PageLoader from "@/components/PageLoader.tsx";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { DashboardHeader, DashboardShell } from "@/components/dashboard/DashboardShell.tsx";

import {
  listAuditLogs,
  listProfilesSummary,
  type AuditLogEntry,
} from "../../lib/repositories/adminPlatform.ts";

const PAGE_SIZE = 40;

interface AdminActivityPageProps {
  isPlatformAdmin: boolean;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function AdminActivityPage({ isPlatformAdmin }: AdminActivityPageProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [actorLabels, setActorLabels] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (start: number, append: boolean) => {
      if (!isPlatformAdmin) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const batch = await listAuditLogs({ limit: PAGE_SIZE, offset: start });
        if (append) {
          setEntries((prev) => [...prev, ...batch]);
        } else {
          setEntries(batch);
        }
        setHasMore(batch.length === PAGE_SIZE);

        const actorIds = batch
          .map((e) => e.actor_user_id)
          .filter((id): id is string => id != null);
        if (actorIds.length > 0) {
          const labels = await listProfilesSummary(actorIds);
          setActorLabels((prev) => {
            const next = new Map(prev);
            labels.forEach((v, k) => next.set(k, v));
            return next;
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load events.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [isPlatformAdmin],
  );

  useAsyncAction(() => loadPage(0, false), [loadPage]);

  if (!isPlatformAdmin) {
    return null;
  }

  return (
    <DashboardShell className="hub-body admin-console-page">
      <DashboardHeader
        badge={<Badge variant="secondary">Platform admin</Badge>}
        title="Platform activity"
        subtitle="Recent administrative activity across workspaces"
        meta={
          <>
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadPage(0, false)}
            disabled={loading}
            className="gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </Button>
        }
      />

      {error ? (
        <ErrorNotice tone="danger">
          {error}
        </ErrorNotice>
      ) : null}

      {loading ? (
        <PageLoader compact />
      ) : entries.length === 0 ? (
        <div className="console-empty">
          <span className="console-empty-icon">
            <Activity size={18} />
          </span>
          <span className="console-empty-title">No activity yet</span>
          <span>Administrative actions across workspaces will appear here.</span>
        </div>
      ) : (
        <>
          <Card className="border-border/60 overflow-hidden">
            <CardContent className="p-0">
              <ResponsiveTable records>
                <Table className="console-table min-w-[540px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">When</TableHead>
                      <TableHead className="min-w-[160px]">Actor</TableHead>
                      <TableHead className="w-[120px]">Table</TableHead>
                      <TableHead className="w-[120px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((ev) => (
                      <TableRow key={ev.id}>
                        <TableCell data-label="When" className="align-middle text-muted-foreground whitespace-nowrap">
                          {formatWhen(ev.created_at)}
                        </TableCell>
                        <TableCell data-label="Actor" className="align-middle">
                          {ev.actor_user_id ? (
                            <span className="block truncate max-w-[200px]" title={actorLabels.get(ev.actor_user_id) ?? ev.actor_user_id}>
                              {actorLabels.get(ev.actor_user_id) ?? `${ev.actor_user_id.slice(0, 8)}…`}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">system</span>
                          )}
                        </TableCell>
                        <TableCell data-label="Table" className="align-middle">
                          <code className="text-xs break-all">{ev.entity_table}</code>
                        </TableCell>
                        <TableCell data-label="Action" className="align-middle">
                          <Badge variant="outline">{ev.action}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ResponsiveTable>
            </CardContent>
          </Card>

          {hasMore && (
            <div className="console-pagination">
              <Button
                variant="outline"
                disabled={loadingMore}
                onClick={() => void loadPage(entries.length, true)}
                className="gap-2"
              >
                {loadingMore ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ChevronDown size={14} />
                )}
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </DashboardShell>
  );
}
