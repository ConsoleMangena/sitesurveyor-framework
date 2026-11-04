import * as React from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DashboardCardProps {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  titleAction?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

/** The panel half of the dashboard tile system: KpiCard is the compact stat,
 *  this is everything else. Same 10px radius, same heading scale, same 16px gutters. */
export function DashboardCard({
  title,
  icon,
  titleAction,
  children,
  footer,
  className,
  contentClassName,
}: DashboardCardProps) {
  const hasHeader = Boolean(title || titleAction || icon);

  return (
    <Card className={cn("min-w-0 gap-0 p-4 sm:p-5", className)}>
      {hasHeader && (
        <CardHeader className="flex items-center justify-between gap-3 px-0 pb-0">
          <div className="flex min-w-0 items-center gap-2">
            {icon && (
              <span
                aria-hidden
                className="flex size-3.5 shrink-0 items-center text-muted-foreground [&>svg]:size-3.5"
              >
                {icon}
              </span>
            )}
            {title && (
              <CardTitle className="truncate text-sm font-semibold tracking-tight">
                {title}
              </CardTitle>
            )}
          </div>
          {titleAction && <div className="shrink-0">{titleAction}</div>}
        </CardHeader>
      )}
      <CardContent className={cn(hasHeader ? "mt-3" : "", "flex-1 px-0", contentClassName)}>
        {children}
      </CardContent>
      {footer && <CardFooter className="mt-3 gap-2 px-0">{footer}</CardFooter>}
    </Card>
  );
}
