import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DocumentHeaderProps {
  title: React.ReactNode;
  status?: string;
  subtitle?: React.ReactNode;
  statusVariant?: "default" | "secondary" | "destructive" | "outline" | "purple" | "warning" | "success";
  actions?: React.ReactNode;
  className?: string;
}

export function DocumentHeader({
  title,
  status,
  subtitle,
  statusVariant = "secondary",
  actions,
  className,
}: DocumentHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-sm text-muted-foreground">
          {status && <Badge variant={statusVariant}>{status}</Badge>}
          {subtitle && <span className="truncate">{subtitle}</span>}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
}
