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
import { ArrowUpDown } from "lucide-react";
import { format, parseISO } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { ProjectWithOrg } from "@/lib/repositories/projects";

type StatusFilter = "All" | "Active" | "Completed";
const filters: StatusFilter[] = ["All", "Active", "Completed"];

interface RecentProjectsTableProps {
  projects: ProjectWithOrg[];
}

function ProjectStatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return <Badge variant="default">Completed</Badge>;
  }
  if (status === "active") {
    return (
      <Badge variant="outline" className="border-green-700/25 text-green-700">
        Active
      </Badge>
    );
  }
  return <Badge variant="secondary">{status}</Badge>;
}

export function RecentProjectsTable({ projects }: RecentProjectsTableProps) {
  const [filter, setFilter] = React.useState<StatusFilter>("All");
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "created_at", desc: true }]);
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 7 });

  const data = React.useMemo(() => {
    if (filter === "All") return projects;
    const target = filter.toLowerCase();
    return projects.filter((p) => p.status === target);
  }, [projects, filter]);

  const columns = React.useMemo<ColumnDef<ProjectWithOrg>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Project",
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <div className="font-medium leading-none">{row.original.name}</div>
            <div className="text-muted-foreground text-xs">{row.original.organization_name ?? "Private"}</div>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <ProjectStatusBadge status={row.original.status} />,
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
    ],
    [],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination },
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-normal text-muted-foreground text-sm">Recent projects</CardTitle>
        <CardDescription className="text-foreground text-xl tabular-nums leading-none tracking-tight">
          {table.getFilteredRowModel().rows.length} projects
        </CardDescription>
        <CardAction />
      </CardHeader>

      <CardContent className="flex flex-col gap-4 px-0">
        <div className="px-4">
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(value) => {
              if (!value) return;
              setFilter(value as StatusFilter);
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
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="h-24 text-center" colSpan={columns.length}>
                    No projects found.
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
