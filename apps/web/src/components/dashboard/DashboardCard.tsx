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

export function DashboardCard({
  title,
  icon,
  titleAction,
  children,
  footer,
  className,
  contentClassName,
}: DashboardCardProps) {
  return (
    <Card className={cn("flex flex-col", className)}>
      {(title || titleAction || icon) && (
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/70 text-muted-foreground">
                {icon}
              </span>
            )}
            {title && (
              <CardTitle className="text-base font-semibold leading-tight">
                {title}
              </CardTitle>
            )}
          </div>
          {titleAction && <div className="shrink-0">{titleAction}</div>}
        </CardHeader>
      )}
      <CardContent className={cn("flex-1", contentClassName)}>
        {children}
      </CardContent>
      {footer && <CardFooter className="pt-0 gap-2">{footer}</CardFooter>}
    </Card>
  );
}
