import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Phone record layout: below `sm` each row becomes a labelled record
 * instead of a sideways table. Cells need `data-label` to read well.
 */
const RECORD_LAYOUT = cn(
  "[&_thead]:hidden",
  "max-sm:[&_tbody_tr]:block",
  "max-sm:[&_tbody_tr]:py-3",
  "max-sm:[&_tbody_td:not(.hidden)]:grid",
  "max-sm:[&_tbody_td:not(.hidden)]:grid-cols-[92px_minmax(0,1fr)]",
  "max-sm:[&_tbody_td:not(.hidden)]:items-baseline",
  "max-sm:[&_tbody_td:not(.hidden)]:gap-3",
  "max-sm:[&_tbody_td:not(.hidden)]:border-0",
  "max-sm:[&_tbody_td:not(.hidden)]:p-0.5",
  "max-sm:[&_tbody_td:not(.hidden)]:whitespace-normal",
  "max-sm:[&_tbody_td:not(.hidden)]:text-left",
  "max-sm:[&_tbody_td]:before:content-[attr(data-label)]",
  "max-sm:[&_tbody_td]:before:text-[10px]",
  "max-sm:[&_tbody_td]:before:font-bold",
  "max-sm:[&_tbody_td]:before:tracking-[0.11em]",
  "max-sm:[&_tbody_td]:before:text-muted-foreground",
  "max-sm:[&_tbody_td:first-child]:block",
  "max-sm:[&_tbody_td:first-child]:pb-2",
  "max-sm:[&_tbody_td:first-child]:font-semibold",
  "max-sm:[&_tbody_td:first-child]:before:hidden",
);

interface ResponsiveTableProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** Stacks each row as a labelled record on phones. */
  records?: boolean;
}

export function ResponsiveTable({
  children,
  className,
  records = false,
  ...props
}: ResponsiveTableProps) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto overscroll-x-contain",
        records && RECORD_LAYOUT,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
