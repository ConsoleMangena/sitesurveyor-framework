import { useCallback, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  Archive,
  ArchiveRestore,
  Loader2,
  RefreshCw,
} from "lucide-react";

import ErrorNotice from "@/components/errors/ErrorNotice.tsx";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { DataTablePagination } from "@/components/data-table/pagination";
import { DataTableToolbar } from "@/components/data-table/toolbar";
import { Badge } from "@/components/ui/badge";
import { DashboardHeader } from "@/components/dashboard/DashboardShell.tsx";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/templates/ConfirmDialog.tsx";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import { SuccessDialog } from "@/components/SuccessDialog.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { useDialogState } from "@/lib/hooks/useDialogState.ts";
import {
  archiveWorkspace,
  getWorkspaceSummary,
  listProfilesSummary,
  listWorkspaceMembersAdmin,
  listWorkspaces,
  unarchiveWorkspace,
  type WorkspaceMemberAdmin,
  type WorkspaceRowAdmin,
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
      <span className="text-xs capitalize text-muted-foreground">{label}</span>
    </div>
  );
}

const TYPE_OPTIONS = [
  { label: "Personal", value: "personal" },
  { label: "Business", value: "business" },
];

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Archived", value: "archived" },
];

export default function AdminWorkspacesPage({
  isPlatformAdmin,
}: AdminWorkspacesPageProps) {
  const [rows, setRows] = useState<WorkspaceRowAdmin[]>([]);
  const [ownerLabels, setOwnerLabels] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [selectedWsId, setSelectedWsId] = useState<string | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberAdmin[]>([]);
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const archiveState = useDialogState();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState("");

  const load = useCallback(async () => {
    if (!isPlatformAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listWorkspaces();
      setRows(data);
      setOwnerLabels(await listProfilesSummary(data.map((r) => r.owner_user_id)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load workspaces.");
    } finally {
      setLoading(false);
    }
  }, [isPlatformAdmin]);

  useAsyncAction(load, [load]);

  const selectedRow = selectedWsId
    ? (rows.find((r) => r.id === selectedWsId) ?? null)
    : null;

  const openDetail = useCallback(async (wsId: string) => {
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
      setError(
        err instanceof Error ? err.message : "Failed to load workspace details.",
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleArchiveToggle = async () => {
    if (!selectedRow) return;
    const isArchived = !!selectedRow.archived_at;
    const verb = isArchived ? "Unarchive" : "Archive";

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
      setError(
        err instanceof Error
          ? err.message
          : `Failed to ${verb.toLowerCase()} workspace.`,
      );
    } finally {
      setArchiving(false);
      archiveState.setOpen(false);
    }
  };

  const columns = useMemo<ColumnDef<WorkspaceRowAdmin>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Workspace" />
        ),
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span
              className="block max-w-[240px] truncate font-medium text-foreground"
              title={row.original.name}
            >
              {row.original.name}
            </span>
            {row.original.archived_at ? (
              <Badge variant="outline" className="mt-1 w-fit text-xs">
                Archived
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: "type",
        accessorFn: (row) => row.type,
        filterFn: "arrIncludesSome",
        enableGlobalFilter: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Type" />
        ),
        cell: ({ row }) => (
          <span className="capitalize">{row.original.type}</span>
        ),
      },
      {
        id: "owner",
        accessorFn: (row) => ownerLabels.get(row.owner_user_id) ?? "",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Owner" />
        ),
        cell: ({ row }) => (
          <span
            className="block max-w-[180px] truncate text-muted-foreground"
            title={ownerLabels.get(row.original.owner_user_id) ?? undefined}
          >
            {ownerLabels.get(row.original.owner_user_id) ?? "—"}
          </span>
        ),
      },
      {
        id: "status",
        accessorFn: (row) => (row.archived_at ? "archived" : "active"),
        filterFn: "arrIncludesSome",
        enableGlobalFilter: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ row }) =>
          row.original.archived_at ? (
            <Badge variant="secondary">Archived</Badge>
          ) : (
            <Badge variant="success">Active</Badge>
          ),
      },
      {
        id: "created_at",
        accessorFn: (row) => row.created_at,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Created" />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {formatDate(row.original.created_at)}
          </span>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openDetail(row.original.id)}
              disabled={detailLoading}
            >
              Inspect
            </Button>
          </div>
        ),
      },
    ],
    [openDetail, ownerLabels, detailLoading],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is not React Compiler compatible.
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnFilters, columnVisibility, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue ?? "").trim().toLowerCase();
      if (!q) return true;
      const owner = ownerLabels.get(row.original.owner_user_id) ?? "";
      return [row.original.name, row.original.slug ?? "", owner].some((value) =>
        value.toLowerCase().includes(q),
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: { pagination: { pageSize: 20 } },
  });

  if (!isPlatformAdmin) return null;

  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
    <div className="space-y-4">
      <DashboardHeader
        title="Workspaces"
        badge={<Badge variant="secondary">Platform admin</Badge>}
        subtitle="Inspect any workspace — members, entity counts, archive status"
        meta={`${filteredCount} ${filteredCount === 1 ? "workspace" : "workspaces"}`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Refresh
          </Button>
        }
      />

      {error ? <ErrorNotice tone="danger">{error}</ErrorNotice> : null}

      {loading ? (
        <div className="space-y-4" role="status" aria-label="Loading">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="space-y-3">
          <DataTableToolbar
            table={table}
            searchPlaceholder="Filter by name, slug, or owner…"
            filters={[
              { columnId: "status", title: "Status", options: STATUS_OPTIONS },
              { columnId: "type", title: "Type", options: TYPE_OPTIONS },
            ]}
          />

          <div className="overflow-hidden rounded-lg border">
            <div className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id} colSpan={header.colSpan}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No workspaces found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="align-middle">
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <DataTablePagination table={table} />
        </div>
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
                onClick={() => archiveState.setOpen(true)}
                disabled={archiving}
                className="gap-2"
              >
                {selectedRow.archived_at ? (
                  <>
                    {archiving ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <ArchiveRestore size={16} />
                    )}
                    Unarchive
                  </>
                ) : (
                  <>
                    {archiving ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Archive size={16} />
                    )}
                    Archive
                  </>
                )}
              </Button>
            )}
          </>
        }
      >
        {detailLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : selectedRow ? (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                <span className="shrink-0 text-muted-foreground">Type</span>
                <span className="min-w-0 break-words text-right font-medium capitalize text-foreground">
                  {selectedRow.type}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                <span className="shrink-0 text-muted-foreground">Owner</span>
                <span className="min-w-0 break-words text-right font-medium text-foreground">
                  {ownerLabels.get(selectedRow.owner_user_id) ?? "—"}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                <span className="shrink-0 text-muted-foreground">Slug</span>
                <span className="min-w-0 break-words text-right font-medium text-foreground">
                  {selectedRow.slug ?? "—"}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                <span className="shrink-0 text-muted-foreground">Created</span>
                <span className="min-w-0 break-words text-right font-medium text-foreground">
                  {formatDate(selectedRow.created_at)}
                </span>
              </div>
              {selectedRow.archived_at && (
                <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                  <span className="shrink-0 text-muted-foreground">
                    Archived
                  </span>
                  <span className="min-w-0 break-words text-right font-medium text-foreground">
                    {formatDate(selectedRow.archived_at)}
                  </span>
                </div>
              )}
            </div>

            {summary && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Entity counts</h4>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {(Object.entries(summary) as [string, number][]).map(
                    ([key, val]) => (
                      <StatBox key={key} label={key.replace(/_/g, " ")} value={val} />
                    ),
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Members ({members.length})</h4>
              {members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members.</p>
              ) : (
                <div className="max-h-[220px] overflow-auto rounded-lg border">
                  <Table className="min-w-[420px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[120px] text-xs">Name</TableHead>
                        <TableHead className="min-w-[160px] text-xs">Email</TableHead>
                        <TableHead className="w-[100px] text-xs">Role</TableHead>
                        <TableHead className="w-[80px] text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="align-middle text-sm">
                            <span
                              className="block max-w-[150px] truncate"
                              title={m.full_name ?? undefined}
                            >
                              {m.full_name ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="align-middle text-sm">
                            <span
                              className="block max-w-[180px] truncate"
                              title={m.email ?? undefined}
                            >
                              {m.email ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap align-middle">
                            <Badge variant="outline" className="text-xs">
                              {m.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="align-middle text-xs">
                            <Badge
                              variant={m.status === "active" ? "default" : "secondary"}
                            >
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

      <ConfirmDialog
        open={archiveState.open}
        onOpenChange={archiveState.setOpen}
        title={selectedRow?.archived_at ? "Unarchive workspace" : "Archive workspace"}
        description={
          selectedRow
            ? `${selectedRow.archived_at ? "Unarchive" : "Archive"} workspace "${selectedRow.name}"?`
            : undefined
        }
        confirmText={selectedRow?.archived_at ? "Unarchive" : "Archive"}
        loading={archiving}
        onConfirm={() => void handleArchiveToggle()}
      />

      <SuccessDialog
        open={!!successMessage}
        onOpenChange={() => setSuccessMessage(null)}
        message={successMessage ?? ""}
      />
    </div>
  );
}
