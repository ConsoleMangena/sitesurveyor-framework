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
  accent?: boolean;
  className?: string;
  contentClassName?: string;
}

export function DashboardCard({
  title,
  icon,
  titleAction,
  children,
  footer,
  accent = false,
  className,
  contentClassName,
}: DashboardCardProps) {
  return (
    <Card
      className={cn(
        "border-border/60 bg-card flex flex-col shadow-sm transition-shadow",
        accent && "border-l-4 border-l-primary",
        className,
      )}
    >
      {(title || titleAction || icon) && (
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                  accent
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {icon}
              </span>
            )}
            {title && (
              <CardTitle
                className={cn(
                  "text-base font-semibold leading-tight",
                  accent && "text-primary",
                )}
              >
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
