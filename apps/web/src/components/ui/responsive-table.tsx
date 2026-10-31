import * as React from "react";
import { cn } from "@/lib/utils";
import "@/styles/console.css";

interface ResponsiveTableProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /**
   * Stacks each row as a labelled record on phones. The table needs a
   * `console-table` class and `data-label` on its cells for this to read well.
   */
  records?: boolean;
}

export function ResponsiveTable({
  children,
  className,
  records = false,
  ...props
}: ResponsiveTableProps) {
  return (
    <div className={cn(records ? "console-table-wrap" : "overflow-x-auto", className)} {...props}>
      {children}
    </div>
  );
}
