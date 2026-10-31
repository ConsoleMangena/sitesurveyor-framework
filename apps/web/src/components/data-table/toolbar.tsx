import { X } from "lucide-react";
import type { Table } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableFacetedFilter } from "./faceted-filter";
import { DataTableViewOptions } from "./view-options";

export type DataTableFilterConfig = {
  columnId: string;
  title: string;
  options: {
    label: string;
    value: string;
    icon?: React.ComponentType<{ className?: string }>;
  }[];
};

type DataTableToolbarProps<TData> = {
  table: Table<TData>;
  searchPlaceholder?: string;
  /** Column to bind the text input to. Omit to drive the global filter. */
  searchKey?: string;
  filters?: DataTableFilterConfig[];
  children?: React.ReactNode;
};

export function DataTableToolbar<TData>({
  table,
  searchPlaceholder = "Filter…",
  searchKey,
  filters = [],
  children,
}: DataTableToolbarProps<TData>) {
  const isFiltered =
    table.getState().columnFilters.length > 0 ||
    Boolean(table.getState().globalFilter);

  const searchColumn = searchKey ? table.getColumn(searchKey) : undefined;
  const searchValue = searchKey
    ? ((searchColumn?.getFilterValue() as string) ?? "")
    : ((table.getState().globalFilter as string) ?? "");

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(event) => {
            if (searchKey) {
              searchColumn?.setFilterValue(event.target.value);
            } else {
              table.setGlobalFilter(event.target.value);
            }
          }}
          className="h-8 w-full sm:w-64"
        />

        {filters.map((filter) => {
          const column = table.getColumn(filter.columnId);
          if (!column) return null;
          return (
            <DataTableFacetedFilter
              key={filter.columnId}
              column={column}
              title={filter.title}
              options={filter.options}
            />
          );
        })}

        {isFiltered ? (
          <Button
            variant="ghost"
            onClick={() => {
              table.resetColumnFilters();
              table.setGlobalFilter("");
            }}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X className="ms-2 size-4" />
          </Button>
        ) : null}

        {children}
      </div>

      <DataTableViewOptions table={table} />
    </div>
  );
}
