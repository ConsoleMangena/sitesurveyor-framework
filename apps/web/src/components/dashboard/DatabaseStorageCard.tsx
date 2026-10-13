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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getProgressColor(percent: number): string {
  if (percent >= 90) return "bg-red-500";
  if (percent >= 70) return "bg-amber-500";
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

  const usedMb = usage?.used_mb ?? 0;
  const limitMb = usage?.limit_mb ?? 500;
  const percent = usage?.percent ?? 0;
  const fileCount = usage?.file_count ?? 0;

  return (
    <DashboardCard
      title="Database Storage"
      icon={<Database size={16} />}
      footer={
        percent >= 80 ? (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => onNavigate?.("billing")}
          >
            <Crown size={14} />
            Upgrade Storage
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <div className="flex flex-col gap-3">
          <div className="h-3 w-full animate-pulse rounded-full bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                getProgressColor(percent),
              )}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive size={14} className="text-muted-foreground" />
              <span className="text-sm font-medium tabular-nums text-foreground">
                {usedMb} MB
              </span>
              <span className="text-xs text-muted-foreground">
                of {limitMb} MB
              </span>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {percent}%
            </span>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {fileCount} file{fileCount === 1 ? "" : "s"} stored
            </span>
            <span>{formatBytes(usage?.used_bytes ?? 0)} used</span>
          </div>

          {percent >= 90 && (
            <p className="text-xs text-red-500">
              Storage almost full. Upgrade your plan to add more space.
            </p>
          )}
          {percent >= 70 && percent < 90 && (
            <p className="text-xs text-amber-500">
              Storage usage is getting high. Consider upgrading soon.
            </p>
          )}
        </div>
      )}
    </DashboardCard>
  );
}
