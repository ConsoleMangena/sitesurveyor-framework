import { useCallback, useMemo, useState } from "react";
import { RefreshCw, Loader2, ChevronDown } from "lucide-react";

import PageLoader from "@/components/PageLoader.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  listWorkspaces,
  listProfilesSummary,
  type AuditLogEntry,
  type WorkspaceRowAdmin,
} from "../../lib/repositories/adminPlatform.ts";

const PAGE_SIZE = 50;

interface AdminAuditPageProps {
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

export default function AdminAuditPage({ isPlatformAdmin }: AdminAuditPageProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [workspaces, setWorkspaces] = useState<WorkspaceRowAdmin[]>([]);
  const [actorLabels, setActorLabels] = useState<Map<string, string>>(new Map());
  const [wsLabels, setWsLabels] = useState<Map<string, string>>(new Map());

  const [filterWsId, setFilterWsId] = useState<string>("");
  const [filterAction, setFilterAction] = useState<string>("");

  const loadWorkspaces = useCallback(async () => {
    try {
      const ws = await listWorkspaces();
      setWorkspaces(ws);
      const map = new Map<string, string>();
      for (const w of ws) map.set(w.id, w.name);
      setWsLabels(map);
    } catch {
      // non-critical
    }
  }, []);

  const loadPage = useCallback(
    async (start: number, append: boolean) => {
      if (!isPlatformAdmin) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const batch = await listAuditLogs({
          limit: PAGE_SIZE,
          offset: start,
          workspaceId: filterWsId || null,
          action: filterAction || null,
        });
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
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load audit log.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [isPlatformAdmin, filterWsId, filterAction],
  );

  useAsyncAction(loadWorkspaces, [loadWorkspaces]);

  useAsyncAction(() => loadPage(0, false), [loadPage]);

  const actionOptions = useMemo(() => {
    const set = new Set(entries.map((e) => e.action));
    return Array.from(set).sort();
  }, [entries]);

  if (!isPlatformAdmin) return null;

  return (
    <DashboardShell className="hub-body admin-console-page">
      <DashboardHeader
        badge={<Badge variant="secondary">Platform admin</Badge>}
        title="Audit log"
        subtitle="Cross-workspace activity trail — who did what, when"
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

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterWsId} onValueChange={(v) => setFilterWsId(v)}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="All workspaces" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All workspaces</SelectItem>
            {workspaces.map((ws) => (
              <SelectItem key={ws.id} value={ws.id}>
                {ws.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAction} onValueChange={(v) => setFilterAction(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All actions</SelectItem>
            {actionOptions.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <PageLoader compact />
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit entries found.</p>
      ) : (
        <>
          <Card className="border-border/60 overflow-hidden">
            <CardContent className="p-0">
              <ResponsiveTable>
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">When</TableHead>
                      <TableHead className="min-w-[180px]">Workspace</TableHead>
                      <TableHead className="min-w-[180px]">Actor</TableHead>
                      <TableHead className="w-[120px]">Table</TableHead>
                      <TableHead className="w-[110px]">Action</TableHead>
                      <TableHead className="w-[110px]">Entity ID</TableHead>
                      <TableHead className="min-w-[160px]">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((ev) => (
                      <TableRow key={ev.id}>
                        <TableCell className="align-middle text-muted-foreground whitespace-nowrap">
                          {formatWhen(ev.created_at)}
                        </TableCell>
                        <TableCell className="align-middle">
                          {ev.workspace_id ? (
                            <span className="block truncate max-w-[220px]" title={wsLabels.get(ev.workspace_id) ?? ev.workspace_id}>
                              {wsLabels.get(ev.workspace_id) ?? `${ev.workspace_id.slice(0, 8)}…`}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="align-middle">
                          {ev.actor_user_id ? (
                            <span className="block truncate max-w-[220px]" title={actorLabels.get(ev.actor_user_id) ?? ev.actor_user_id}>
                              {actorLabels.get(ev.actor_user_id) ?? `${ev.actor_user_id.slice(0, 8)}…`}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">system</span>
                          )}
                        </TableCell>
                        <TableCell className="align-middle">
                          <code className="text-xs">{ev.entity_table}</code>
                        </TableCell>
                        <TableCell className="align-middle whitespace-nowrap">
                          <Badge variant="outline">{ev.action}</Badge>
                        </TableCell>
                        <TableCell className="align-middle">
                          {ev.entity_id ? (
                            <code className="text-[11px]">{ev.entity_id.slice(0, 8)}…</code>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="align-middle">
                          {Object.keys(ev.details).length > 0 ? (
                            <details>
                              <summary className="cursor-pointer text-xs">
                                {Object.keys(ev.details).length} field
                                {Object.keys(ev.details).length === 1 ? "" : "s"}
                              </summary>
                              <pre className="text-[11px] max-h-32 overflow-auto mt-1 bg-muted p-1.5 rounded">
                                {JSON.stringify(ev.details, null, 2)}
                              </pre>
                            </details>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ResponsiveTable>
            </CardContent>
          </Card>

          {hasMore && (
            <div className="flex justify-center">
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
