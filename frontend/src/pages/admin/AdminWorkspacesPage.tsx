import { useCallback, useMemo, useState } from "react";
import { RefreshCw, Search, Archive, ArchiveRestore, Loader2 } from "lucide-react";

import PageLoader from "@/components/PageLoader.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import { SuccessDialog } from "@/components/SuccessDialog.tsx";
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
  listWorkspaces,
  listWorkspaceMembersAdmin,
  getWorkspaceSummary,
  archiveWorkspace,
  unarchiveWorkspace,
  listProfilesSummary,
  type WorkspaceRowAdmin,
  type WorkspaceMemberAdmin,
  type WorkspaceSummary,
} from "../../lib/repositories/adminPlatform.ts";

interface AdminWorkspacesPageProps {
  isPlatformAdmin: boolean;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border bg-muted/40 p-3">
      <span className="text-xl font-bold text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground capitalize">{label}</span>
    </div>
  );
}

export default function AdminWorkspacesPage({
  isPlatformAdmin,
}: AdminWorkspacesPageProps) {
  const [rows, setRows] = useState<WorkspaceRowAdmin[]>([]);
  const [ownerLabels, setOwnerLabels] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [selectedWsId, setSelectedWsId] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberAdmin[]>([]);
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    if (!isPlatformAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listWorkspaces();
      setRows(data);
      const owners = await listProfilesSummary(data.map((r) => r.owner_user_id));
      setOwnerLabels(owners);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load workspaces.");
    } finally {
      setLoading(false);
    }
  }, [isPlatformAdmin]);

  useAsyncAction(load, [load]);

  const filtered = useMemo(() => {
    let result = rows;
    if (!showArchived) result = result.filter((r) => !r.archived_at);
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter((r) => {
        const owner = ownerLabels.get(r.owner_user_id) ?? "";
        return (
          r.name.toLowerCase().includes(q) ||
          (r.slug ?? "").toLowerCase().includes(q) ||
          owner.toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [rows, query, showArchived, ownerLabels]);

  const selectedRow = selectedWsId
    ? rows.find((r) => r.id === selectedWsId) ?? null
    : null;

  const openDetail = async (wsId: string) => {
    setSelectedWsId(wsId);
    setDetailLoading(true);
    try {
      const [m, s] = await Promise.all([
        listWorkspaceMembersAdmin(wsId),
        getWorkspaceSummary(wsId),
      ]);
      setMembers(m);
      setSummary(s);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load workspace details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleArchiveToggle = async () => {
    if (!selectedRow) return;
    const isArchived = !!selectedRow.archived_at;
    const verb = isArchived ? "Unarchive" : "Archive";
    if (!window.confirm(`${verb} workspace "${selectedRow.name}"?`)) return;

    setArchiving(true);
    try {
      if (isArchived) {
        await unarchiveWorkspace(selectedRow.id);
      } else {
        await archiveWorkspace(selectedRow.id);
      }
      setSuccessMessage(`Workspace ${verb.toLowerCase()}d.`);
      setSelectedWsId(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to ${verb.toLowerCase()} workspace.`);
    } finally {
      setArchiving(false);
    }
  };

  if (!isPlatformAdmin) return null;

  return (
    <DashboardShell className="hub-body admin-console-page">
      <DashboardHeader
        badge={<Badge variant="secondary">Platform admin</Badge>}
        title="Workspaces"
        subtitle="Inspect any workspace — members, entity counts, archive status"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
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
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            placeholder="Filter by name, slug, or owner…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter workspaces"
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary accent-primary"
          />
          Show archived
        </label>
      </div>

      {loading ? (
        <PageLoader compact />
      ) : (
        <Card className="border-border/60 overflow-hidden">
          <CardContent className="p-0">
            <ResponsiveTable>
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Workspace</TableHead>
                    <TableHead className="w-[100px]">Type</TableHead>
                    <TableHead className="min-w-[160px]">Owner</TableHead>
                    <TableHead className="w-[120px]">Created</TableHead>
                    <TableHead className="w-[100px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No workspaces found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="align-middle">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground truncate max-w-[240px]" title={row.name}>
                              {row.name}
                            </span>
                            {row.archived_at && (
                              <Badge variant="outline" className="mt-1 w-fit text-xs">
                                Archived
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="align-middle capitalize">{row.type}</TableCell>
                        <TableCell className="align-middle text-muted-foreground">
                          <span className="block truncate max-w-[180px]" title={ownerLabels.get(row.owner_user_id) ?? undefined}>
                            {ownerLabels.get(row.owner_user_id) ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="align-middle text-muted-foreground whitespace-nowrap">
                          {formatDate(row.created_at)}
                        </TableCell>
                        <TableCell className="align-middle text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void openDetail(row.id)}
                            disabled={detailLoading}
                          >
                            Inspect
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ResponsiveTable>
          </CardContent>
        </Card>
      )}

      <DialogTemplate
        open={!!selectedRow}
        onOpenChange={(open) => !open && setSelectedWsId(null)}
        title={selectedRow?.name ?? "Workspace"}
        description="Members, entity counts, and archive status for this workspace."
        size="2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setSelectedWsId(null)}>
              Close
            </Button>
            {selectedRow && (
              <Button
                variant={selectedRow.archived_at ? "default" : "outline"}
                onClick={() => void handleArchiveToggle()}
                disabled={archiving}
                className="gap-2"
              >
                {selectedRow.archived_at ? (
                  <>
                    {archiving ? <Loader2 size={14} className="animate-spin" /> : <ArchiveRestore size={16} />}
                    Unarchive
                  </>
                ) : (
                  <>
                    {archiving ? <Loader2 size={14} className="animate-spin" /> : <Archive size={16} />}
                    Archive
                  </>
                )}
              </Button>
            )}
          </>
        }
      >
        {detailLoading ? (
          <PageLoader compact />
        ) : selectedRow ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-0.5">
                <span className="text-xs text-muted-foreground">Type</span>
                <p className="text-sm font-medium capitalize">{selectedRow.type}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-xs text-muted-foreground">Owner</span>
                <p className="text-sm font-medium">{ownerLabels.get(selectedRow.owner_user_id) ?? "—"}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-xs text-muted-foreground">Slug</span>
                <p className="text-sm font-medium">{selectedRow.slug ?? "—"}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-xs text-muted-foreground">Created</span>
                <p className="text-sm font-medium">{formatDate(selectedRow.created_at)}</p>
              </div>
              {selectedRow.archived_at && (
                <div className="space-y-0.5">
                  <span className="text-xs text-muted-foreground">Archived</span>
                  <p className="text-sm font-medium">{formatDate(selectedRow.archived_at)}</p>
                </div>
              )}
            </div>

            {summary && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Entity counts</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {(Object.entries(summary) as [string, number][]).map(([key, val]) => (
                    <StatBox key={key} label={key.replace(/_/g, " ")} value={val} />
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Members ({members.length})</h4>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members.</p>
              ) : (
                <div className="max-h-[220px] overflow-auto rounded-md border">
                  <Table className="min-w-[420px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs min-w-[120px]">Name</TableHead>
                        <TableHead className="text-xs min-w-[160px]">Email</TableHead>
                        <TableHead className="text-xs w-[100px]">Role</TableHead>
                        <TableHead className="text-xs w-[80px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="align-middle text-sm">
                            <span className="block truncate max-w-[150px]" title={m.full_name ?? undefined}>
                              {m.full_name ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="align-middle text-sm">
                            <span className="block truncate max-w-[180px]" title={m.email ?? undefined}>
                              {m.email ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="align-middle whitespace-nowrap">
                            <Badge variant="outline" className="text-xs">
                              {m.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-middle text-xs">
                            <Badge variant={m.status === "active" ? "default" : "secondary"}>
                              {m.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogTemplate>

      <SuccessDialog
        open={!!successMessage}
        onOpenChange={() => setSuccessMessage(null)}
        message={successMessage ?? ""}
      />
    </DashboardShell>
  );
}
