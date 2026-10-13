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
import { ArrowUpDown, MoreHorizontal } from "lucide-react";
import { format, parseISO } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { WorkspaceRowAdmin } from "@/lib/repositories/adminPlatform";

type WorkspaceFilter = "All" | "Personal" | "Business" | "Archived";
const filters: WorkspaceFilter[] = ["All", "Personal", "Business", "Archived"];

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
    <Badge variant="outline" className="border-green-700/25 text-green-700 gap-1">
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
        id: "select",
        header: ({ table }) => (
          <Checkbox
            aria-label="Select all"
            checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Select ${row.original.name}`}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "name",
        header: "Workspace",
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <div className="font-medium leading-none">{row.original.name}</div>
            {row.original.slug ? (
              <div className="text-muted-foreground text-xs">/{row.original.slug}</div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => <Badge variant="outline">{row.original.type}</Badge>,
      },
      {
        accessorKey: "owner_user_id",
        header: "Owner",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{ownerLabels.get(row.original.owner_user_id) ?? "—"}</span>
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
          <span className="text-muted-foreground">{format(parseISO(row.original.created_at), "MMM d, yyyy")}</span>
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
  const description =
    selectedCount > 0 ? `${selectedCount} selected` : `${table.getFilteredRowModel().rows.length} workspaces`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">Recent workspaces</CardTitle>
        <CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">
          {description}
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button aria-label="Open all" size="icon" variant="outline" className="size-8">
            <MoreHorizontal className="size-4" />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 px-0">
        <div className="flex items-center justify-between gap-4 px-4">
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
          >
            {filters.map((f) => (
              <ToggleGroupItem key={f} value={f}>
                {f}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="overflow-hidden">
          <Table>
            <TableHeader className="border-t">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} colSpan={header.colSpan}>
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
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                )))
                : (
                <TableRow>
                  <TableCell className="h-24 text-center" colSpan={columns.length}>
                    No workspaces found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-4 px-4 pb-1">
          <p className="text-muted-foreground text-sm">
            Viewing {table.getRowModel().rows.length} of {table.getFilteredRowModel().rows.length}
          </p>

          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent className="gap-1.5">
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
      </CardContent>
    </Card>
  );
}
