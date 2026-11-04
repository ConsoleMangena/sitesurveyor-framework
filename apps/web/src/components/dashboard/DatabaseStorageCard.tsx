import { useEffect, useState } from "react";
import { Database, HardDrive, Crown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/dashboard/DashboardCard.tsx";
import {
  getWorkspaceStorageUsage,
  type StorageUsage,
} from "@/lib/repositories/attachments.ts";
import { cn } from "@/lib/utils";

interface DatabaseStorageCardProps {
  workspaceId: string;
  onNavigate?: (view: string) => void;
}

function getProgressColor(percent: number): string {
  if (percent >= 90) return "bg-destructive";
  if (percent >= 70) return "bg-warning";
  return "bg-primary";
}

export function DatabaseStorageCard({
  workspaceId,
  onNavigate,
}: DatabaseStorageCardProps) {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;

    getWorkspaceStorageUsage(workspaceId)
      .then((data) => {
        if (!cancelled) setUsage(data);
      })
      .catch(() => {
        if (!cancelled) setUsage(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Gates the upgrade CTA only; the meter itself renders real figures or none.
  const percent = usage?.percent ?? 0;

  return (
    <DashboardCard
      title="Database storage"
      icon={<Database />}
      className="h-full"
      contentClassName="flex flex-col justify-center gap-3"
      footer={
        percent >= 80 ? (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => onNavigate?.("billing")}
          >
            <Crown size={14} />
            Upgrade storage
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <>
          <div className="h-1.5 w-full animate-pulse rounded-full bg-muted" />
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        </>
      ) : !usage ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Storage usage could not be loaded.
        </p>
      ) : (
        <>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                getProgressColor(percent),
              )}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <HardDrive size={14} className="shrink-0 text-muted-foreground" />
              <span className="truncate text-sm font-medium tabular-nums text-foreground">
                {usage.used_mb} MB
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                of {usage.limit_mb} MB
              </span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {percent}%
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            {usage.file_count} file{usage.file_count === 1 ? "" : "s"} stored
          </p>

          {percent >= 90 ? (
            <p className="text-xs text-destructive">
              Storage almost full. Upgrade your plan to add more space.
            </p>
          ) : percent >= 70 ? (
            <p className="text-xs text-warning">
              Storage usage is getting high. Consider upgrading soon.
            </p>
          ) : null}
        </>
      )}
    </DashboardCard>
  );
}
