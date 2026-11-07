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
  Copy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { toast } from "sonner";

import ErrorNotice from "@/components/errors/ErrorNotice.tsx";
import { DataTableBulkActions } from "@/components/data-table/bulk-actions";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { DataTablePagination } from "@/components/data-table/pagination";
import { DataTableToolbar } from "@/components/data-table/toolbar";
import { Badge } from "@/components/ui/badge";
import { DashboardHeader } from "@/components/dashboard/DashboardShell.tsx";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { useDialogState } from "@/lib/hooks/useDialogState.ts";
import {
  getProfileWithWorkspaces,
  listAllProfiles,
  togglePlatformAdmin,
  type AdminProfileRow,
  type AdminProfileWithWorkspaces,
} from "../../lib/repositories/adminPlatform.ts";

interface AdminUsersPageProps {
  isPlatformAdmin: boolean;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

const ACCESS_OPTIONS = [
  { label: "Platform admins", value: "admin" },
  { label: "Regular users", value: "user" },
];

export default function AdminUsersPage({ isPlatformAdmin }: AdminUsersPageProps) {
  const [profiles, setProfiles] = useState<AdminProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailUser, setDetailUser] = useState<AdminProfileWithWorkspaces | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const toggleAdminState = useDialogState();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [globalFilter, setGlobalFilter] = useState("");

  const load = useCallback(async () => {
    if (!isPlatformAdmin) return;
    setLoading(true);
    setError(null);
    try {
      setProfiles(await listAllProfiles());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [isPlatformAdmin]);

  useAsyncAction(load, [load]);

  const openDetail = useCallback(async (userId: string) => {
    setDetailLoading(true);
    try {
      setDetailUser(await getProfileWithWorkspaces(userId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load user details.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const columns = useMemo<ColumnDef<AdminProfileRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all rows on this page"
            className="translate-y-0.5"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            className="translate-y-0.5"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "name",
        accessorFn: (row) => row.full_name ?? "",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => (
          <span
            className="block max-w-[200px] truncate font-medium"
            title={row.original.full_name ?? undefined}
          >
            {row.original.full_name || "—"}
          </span>
        ),
      },
      {
        id: "email",
        accessorFn: (row) => row.email ?? "",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Email" />
        ),
        cell: ({ row }) => (
          <span
            className="block max-w-[220px] truncate text-muted-foreground"
            title={row.original.email ?? undefined}
          >
            {row.original.email ?? "—"}
          </span>
        ),
      },
      {
        id: "title",
        accessorFn: (row) => row.professional_title ?? "",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Title" />
        ),
        cell: ({ row }) => (
          <span
            className="block max-w-[160px] truncate"
            title={row.original.professional_title ?? undefined}
          >
            {row.original.professional_title ?? "—"}
          </span>
        ),
      },
      {
        id: "signup",
        accessorFn: (row) => row.auth_signup_account_type ?? "",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Signup" />
        ),
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.auth_signup_account_type ?? "—"}
          </Badge>
        ),
      },
      {
        id: "access",
        accessorFn: (row) => (row.is_platform_admin ? "admin" : "user"),
        filterFn: "arrIncludesSome",
        enableGlobalFilter: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Access" />
        ),
        cell: ({ row }) =>
          row.original.is_platform_admin ? (
            <Badge variant="purple" className="inline-flex items-center gap-1">
              <ShieldCheck size={12} />
              Admin
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">User</span>
          ),
      },
      {
        id: "created_at",
        accessorFn: (row) => row.created_at,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Joined" />
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
              View
            </Button>
          </div>
        ),
      },
    ],
    [openDetail, detailLoading],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table is not React Compiler compatible.
  const table = useReactTable({
    data: profiles,
    columns,
    state: { sorting, columnFilters, columnVisibility, rowSelection, globalFilter },
    enableRowSelection: true,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue ?? "").trim().toLowerCase();
      if (!q) return true;
      const { full_name, email, professional_title } = row.original;
      return [full_name, email, professional_title].some((value) =>
        (value ?? "").toLowerCase().includes(q),
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

  const handleCopySelectedEmails = async () => {
    const emails = table
      .getFilteredSelectedRowModel()
      .rows.map((row) => row.original.email)
      .filter((email): email is string => Boolean(email));

    if (emails.length === 0) return;

    try {
      await navigator.clipboard.writeText(emails.join(", "));
      toast.success(`Copied ${emails.length} email${emails.length > 1 ? "s" : ""}.`);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  const handleToggleAdmin = async () => {
    if (!detailUser) return;
    const newVal = !detailUser.is_platform_admin;
    const action = newVal ? "grant" : "revoke";

    setToggling(true);
    try {
      await togglePlatformAdmin(detailUser.id, newVal);
      setDetailUser({ ...detailUser, is_platform_admin: newVal });
      setSuccessMessage(`Platform admin ${action}d.`);
      await load();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : `Failed to ${action} platform admin.`,
      );
    } finally {
      setToggling(false);
      toggleAdminState.setOpen(false);
    }
  };

  if (!isPlatformAdmin) return null;

  const filteredCount = table.getFilteredRowModel().rows.length;

  return (
    <div className="space-y-4">
      <DashboardHeader
        title="User management"
        badge={<Badge variant="secondary">Platform admin</Badge>}
        subtitle="View registered users and manage platform admin access"
        meta={`${filteredCount} ${filteredCount === 1 ? "user" : "users"}`}
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
            searchPlaceholder="Search by name, email or title…"
            filters={[
              { columnId: "access", title: "Access", options: ACCESS_OPTIONS },
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
                        No users found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        data-state={row.getIsSelected() ? "selected" : undefined}
                      >
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

          <DataTableBulkActions table={table} entityName="user">
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => void handleCopySelectedEmails()}
            >
              <Copy className="size-4" />
              Copy emails
            </Button>
          </DataTableBulkActions>
        </div>
      )}

      <DialogTemplate
        open={!!detailUser}
        onOpenChange={(open) => !open && setDetailUser(null)}
        title="User detail"
        kicker="Platform record"
        description="Workspace memberships and platform admin privileges."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setDetailUser(null)}>
              Close
            </Button>
            {detailUser && (
              <Button
                variant={detailUser.is_platform_admin ? "outline" : "default"}
                onClick={() => toggleAdminState.setOpen(true)}
                disabled={toggling}
                className="gap-2"
              >
                {toggling ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : detailUser.is_platform_admin ? (
                  <ShieldX size={16} />
                ) : (
                  <ShieldCheck size={16} />
                )}
                {detailUser.is_platform_admin ? "Revoke admin" : "Grant admin"}
              </Button>
            )}
          </>
        }
      >
        {detailLoading || !detailUser ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-5">
            <div className="space-y-1">
              <p className="text-base font-semibold break-words">
                {detailUser.full_name || "Unnamed"}
              </p>
              <p className="text-sm text-muted-foreground break-all">
                {detailUser.email ?? ""}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                <span className="shrink-0 text-muted-foreground">Title</span>
                <span className="min-w-0 break-words text-right font-medium text-foreground">
                  {detailUser.professional_title ?? "—"}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                <span className="shrink-0 text-muted-foreground">
                  Signup type
                </span>
                <span className="min-w-0 break-words text-right font-medium text-foreground">
                  <Badge variant="outline">
                    {detailUser.auth_signup_account_type ?? "—"}
                  </Badge>
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                <span className="shrink-0 text-muted-foreground">
                  Platform admin
                </span>
                <span className="min-w-0 break-words text-right font-medium text-foreground">
                  {detailUser.is_platform_admin ? (
                    <Badge variant="purple">Yes</Badge>
                  ) : (
                    <Badge variant="secondary">No</Badge>
                  )}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
                <span className="shrink-0 text-muted-foreground">Joined</span>
                <span className="min-w-0 break-words text-right font-medium text-foreground">
                  {formatDate(detailUser.created_at)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold">
                Workspace memberships ({detailUser.workspaces.length})
              </h4>
              {detailUser.workspaces.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No workspace memberships.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {detailUser.workspaces.map((ws) => (
                    <li
                      key={ws.workspace_id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate" title={ws.workspace_name}>
                        {ws.workspace_name}
                      </span>
                      <Badge variant="outline" className="shrink-0">
                        {ws.role}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogTemplate>

      <ConfirmDialog
        open={toggleAdminState.open}
        onOpenChange={toggleAdminState.setOpen}
        title={
          detailUser?.is_platform_admin
            ? "Revoke platform admin"
            : "Grant platform admin"
        }
        description={
          detailUser
            ? `${detailUser.is_platform_admin ? "Revoke" : "Grant"} platform admin for ${
                detailUser.full_name ?? detailUser.email ?? detailUser.id
              }?`
            : undefined
        }
        confirmText={detailUser?.is_platform_admin ? "Revoke" : "Grant"}
        loading={toggling}
        onConfirm={() => void handleToggleAdmin()}
      />

      <SuccessDialog
        open={!!successMessage}
        onOpenChange={() => setSuccessMessage(null)}
        message={successMessage ?? ""}
      />
    </div>
  );
}
