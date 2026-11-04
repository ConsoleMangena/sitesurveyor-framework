import { Skeleton } from "@/components/ui/skeleton";
import { KpiCardSkeleton, KpiGrid } from "@/components/dashboard/KpiCard.tsx";
import { cn } from "@/lib/utils";

interface DashboardSkeletonProps {
  /** Number of KPI tiles to reserve. */
  kpis?: number;
  className?: string;
}

function PanelSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Skeleton className="size-3.5 rounded-sm" />
        <Skeleton className="h-3.5 w-28" />
      </div>
      <Skeleton className="h-44 w-full rounded-lg sm:h-56" />
    </div>
  );
}

export function DashboardSkeleton({
  kpis = 4,
  className,
}: DashboardSkeletonProps) {
  return (
    <div
      className={cn("flex flex-col gap-4", className)}
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <KpiGrid>
        {Array.from({ length: kpis }).map((_, index) => (
          <KpiCardSkeleton key={`kpi-${index}`} />
        ))}
      </KpiGrid>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <PanelSkeleton className="lg:col-span-4" />
        <PanelSkeleton className="lg:col-span-3" />
      </div>
    </div>
  );
}
