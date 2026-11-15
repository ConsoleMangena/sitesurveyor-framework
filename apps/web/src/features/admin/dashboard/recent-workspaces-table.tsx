import * as React from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, Building2, MoreHorizontal } from "lucide-react";
import { format, parseISO } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ResponsiveTable } from "@/components/ui/responsive-table";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import type { WorkspaceRowAdmin } from "@/lib/repositories/adminPlatform";

type WorkspaceFilter = "All" | "Personal" | "Business" | "Archived";
const filters: WorkspaceFilter[] = ["All", "Personal", "Business", "Archived"];

/** Column labels for the phone record view, keyed by column id. */
const COLUMN_LABELS: Record<string, string> = {
  name: "Workspace",
  type: "Type",
  owner_user_id: "Owner",
  status: "Status",
  created_at: "Created",
  actions: "Actions",
};

interface RecentWorkspacesTableProps {
  workspaces: WorkspaceRowAdmin[];
  ownerLabels: Map<string, string>;
}

function StatusBadge({ archivedAt }: { archivedAt: string | null }) {
  if (archivedAt) {
    return (
      <Badge variant="secondary" className="gap-1">
        <span className="size-1.5 rounded-full bg-current" />
        Archived
      </Badge>
    );
  }
  return (
    <Badge variant="success" className="gap-1">
      <span className="size-1.5 rounded-full bg-current" />
      Active
    </Badge>
  );
}

export function RecentWorkspacesTable({ workspaces, ownerLabels }: RecentWorkspacesTableProps) {
  const [filter, setFilter] = React.useState<WorkspaceFilter>("All");
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "created_at", desc: true }]);
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({});

  const data = React.useMemo(() => {
    if (filter === "All") return workspaces;
    if (filter === "Archived") return workspaces.filter((w) => w.archived_at);
    return workspaces.filter((w) => !w.archived_at && w.type === filter.toLowerCase());
  }, [workspaces, filter]);

  const columns = React.useMemo<ColumnDef<WorkspaceRowAdmin>[]>(
    () => [
      {
        /* The row checkbox sits inside the name cell: on phones the name then
           reads as the record title instead of a lone floating checkbox. */
        accessorKey: "name",
        header: ({ table }) => (
          <div className="flex items-center gap-2.5">
            <Checkbox
              aria-label="Select all"
              checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            />
            Workspace
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex items-start gap-2.5">
            <Checkbox
              aria-label={`Select ${row.original.name}`}
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              className="mt-0.5"
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="truncate font-medium leading-none">{row.original.name}</div>
              {row.original.slug ? (
                <div className="truncate text-muted-foreground text-xs">/{row.original.slug}</div>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => <Badge variant="outline" className="capitalize">{row.original.type}</Badge>,
      },
      {
        accessorKey: "owner_user_id",
        header: "Owner",
        cell: ({ row }) => (
          <span className="block max-w-[180px] truncate text-muted-foreground">
            {ownerLabels.get(row.original.owner_user_id) ?? "—"}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge archivedAt={row.original.archived_at} />,
      },
      {
        accessorKey: "created_at",
        header: ({ column }) => (
          <div className="flex items-center gap-1">
            Created
            <Button
              aria-label="Sort by date"
              size="icon"
              variant="ghost"
              className="size-6"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
              <ArrowUpDown className="size-3" />
            </Button>
          </div>
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-muted-foreground">
            {format(parseISO(row.original.created_at), "MMM d, yyyy")}
          </span>
        ),
        sortingFn: "datetime",
      },
      {
        id: "actions",
        header: () => <div className="flex w-full justify-end">Actions</div>,
        cell: () => (
          <div className="flex w-full justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="Open actions" size="icon" variant="ghost" className="size-7">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem>View workspace</DropdownMenuItem>
                <DropdownMenuItem>View owner</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
        enableSorting: false,
      },
    ],
    [ownerLabels],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination, rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (row) => row.id,
  });

  const currentPage = table.getState().pagination.pageIndex + 1;
  const pageCount = table.getPageCount();
  const pageNumbers = React.useMemo(() => {
    if (pageCount <= 3) return Array.from({ length: pageCount }, (_, i) => i + 1);
    if (currentPage <= 2) return [1, 2, 3];
    if (currentPage >= pageCount - 1) return [pageCount - 2, pageCount - 1, pageCount];
    return [currentPage - 1, currentPage, currentPage + 1];
  }, [currentPage, pageCount]);

  const selectedCount = Object.keys(rowSelection).length;
  const rowCount = table.getFilteredRowModel().rows.length;
  const subtitle =
    selectedCount > 0
      ? `${selectedCount} selected`
      : `${rowCount} workspace${rowCount === 1 ? "" : "s"}`;

  return (
    <DashboardCard
      className="h-full"
      title="Recent workspaces"
      icon={<Building2 className="size-4" />}
      titleAction={<Badge variant="outline">{subtitle}</Badge>}
      contentClassName="flex flex-col gap-4 px-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6">
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(value) => {
            if (!value) return;
            setFilter(value as WorkspaceFilter);
            table.setPageIndex(0);
          }}
          size="sm"
          variant="outline"
          className="flex-wrap"
        >
          {filters.map((f) => (
            <ToggleGroupItem key={f} value={f}>
              {f}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <ResponsiveTable records>
        <Table className="min-w-[640px]">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    colSpan={header.colSpan}
                    className="whitespace-nowrap first:pl-6 last:pr-6"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      data-label={COLUMN_LABELS[cell.column.id]}
                      className="align-middle first:pl-6 last:pr-6"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-24 text-center" colSpan={columns.length}>
                  No workspaces found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ResponsiveTable>

      <div className="flex flex-col gap-3 px-4 pb-1 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-muted-foreground text-sm">
          Viewing {table.getRowModel().rows.length} of {table.getFilteredRowModel().rows.length}
        </p>

        <Pagination className="mx-0 w-auto justify-start sm:justify-end">
          <PaginationContent className="flex-wrap gap-1.5">
            <PaginationItem>
              <PaginationPrevious
                className={!table.getCanPreviousPage() ? "pointer-events-none opacity-50" : undefined}
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  table.previousPage();
                }}
              />
            </PaginationItem>
            {pageNumbers[0] > 1 ? (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            ) : null}
            {pageNumbers.map((pageNumber) => (
              <PaginationItem key={`page-${pageNumber}`}>
                <PaginationLink
                  href="#"
                  isActive={table.getState().pagination.pageIndex === pageNumber - 1}
                  onClick={(event) => {
                    event.preventDefault();
                    table.setPageIndex(pageNumber - 1);
                  }}
                >
                  {pageNumber}
                </PaginationLink>
              </PaginationItem>
            ))}
            {pageNumbers[pageNumbers.length - 1] < pageCount ? (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            ) : null}
            <PaginationItem>
              <PaginationNext
                className={!table.getCanNextPage() ? "pointer-events-none opacity-50" : undefined}
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  table.nextPage();
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </DashboardCard>
  );
}
