import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface DashboardSkeletonProps {
  /** Number of hero KPI tiles to reserve. */
  kpis?: number;
  /** Number of compact rail tiles to reserve. */
  rail?: number;
  className?: string;
}

function KpiSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-sm">
      <Skeleton className="size-7 rounded-lg" />
      <div className="mt-3 flex flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

function PanelSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      </div>
      <Skeleton className="h-44 w-full rounded-lg sm:h-56" />
    </div>
  );
}

export function DashboardSkeleton({
  kpis = 4,
  rail = 0,
  className,
}: DashboardSkeletonProps) {
  return (
    <div
      className={cn("flex flex-col gap-4", className)}
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: kpis }).map((_, index) => (
          <KpiSkeleton key={`kpi-${index}`} />
        ))}
      </div>

      {rail > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: rail }).map((_, index) => (
            <div
              key={`rail-${index}`}
              className="rounded-xl border bg-card px-4 py-3 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="size-6 rounded-md" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-4 w-12" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <PanelSkeleton className="col-span-1 lg:col-span-4" />
        <PanelSkeleton className="col-span-1 lg:col-span-3" />
      </div>
    </div>
  );
}
