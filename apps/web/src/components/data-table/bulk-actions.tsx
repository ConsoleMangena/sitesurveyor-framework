import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Table } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type DataTableBulkActionsProps<TData> = {
  table: Table<TData>;
  entityName: string;
  children: React.ReactNode;
};

/**
 * Floating action bar shown while rows are selected.
 *
 * Announces the selection to screen readers, supports ←/→/Home/End roving
 * focus, and clears the selection on Escape (unless a dropdown is open).
 */
export function DataTableBulkActions<TData>({
  table,
  entityName,
  children,
}: DataTableBulkActionsProps<TData>) {
  const selectedCount = table.getFilteredSelectedRowModel().rows.length;
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (selectedCount === 0) return;

    const message = `${selectedCount} ${entityName}${selectedCount > 1 ? "s" : ""} selected. Bulk actions toolbar is available.`;
    queueMicrotask(() => setAnnouncement(message));

    const timer = setTimeout(() => setAnnouncement(""), 3000);
    return () => clearTimeout(timer);
  }, [selectedCount, entityName]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const buttons = toolbarRef.current?.querySelectorAll("button");
    if (!buttons || buttons.length === 0) return;

    const currentIndex = Array.from(buttons).findIndex(
      (button) => button === document.activeElement,
    );

    switch (event.key) {
      case "ArrowRight": {
        event.preventDefault();
        buttons[(currentIndex + 1) % buttons.length]?.focus();
        break;
      }
      case "ArrowLeft": {
        event.preventDefault();
        buttons[currentIndex === 0 ? buttons.length - 1 : currentIndex - 1]?.focus();
        break;
      }
      case "Home":
        event.preventDefault();
        buttons[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        buttons[buttons.length - 1]?.focus();
        break;
      case "Escape": {
        const target = event.target as HTMLElement | null;
        const active = document.activeElement as HTMLElement | null;
        const inDropdown =
          target?.closest('[data-slot="dropdown-menu-trigger"]') ||
          target?.closest('[data-slot="dropdown-menu-content"]') ||
          active?.closest('[data-slot="dropdown-menu-trigger"]') ||
          active?.closest('[data-slot="dropdown-menu-content"]');

        if (inDropdown) return;

        event.preventDefault();
        table.resetRowSelection();
        break;
      }
    }
  };

  if (selectedCount === 0) return null;

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only" role="status">
        {announcement}
      </div>

      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label={`Bulk actions for ${selectedCount} selected ${entityName}${selectedCount > 1 ? "s" : ""}`}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 focus-visible:outline-none"
      >
        <div
          className={cn(
            "flex items-center gap-x-2 rounded-xl border bg-background/95 p-2 shadow-xl backdrop-blur-lg",
            "supports-backdrop-filter:bg-background/60",
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => table.resetRowSelection()}
                className="size-6 rounded-full"
                aria-label="Clear selection"
              >
                <X />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Clear selection (Escape)</p>
            </TooltipContent>
          </Tooltip>

          <Separator className="h-5" orientation="vertical" aria-hidden="true" />

          <div className="flex items-center gap-x-1 text-sm">
            <Badge variant="default" className="min-w-8 rounded-lg">
              {selectedCount}
            </Badge>
            <span className="hidden sm:inline">
              {entityName}
              {selectedCount > 1 ? "s" : ""}
            </span>
            selected
          </div>

          <Separator className="h-5" orientation="vertical" aria-hidden="true" />

          {children}
        </div>
      </div>
    </>
  );
}
