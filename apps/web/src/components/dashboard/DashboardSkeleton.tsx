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
    <div className="kpi-tile rounded-xl border p-3.5 sm:p-4">
      <Skeleton className="size-7 rounded-lg" />
      <div className="mt-3 flex flex-col gap-2">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-2.5 w-28" />
      </div>
    </div>
  );
}

function PanelSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "dash-card flex flex-col gap-4 rounded-xl border p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      </div>
      <Skeleton className="h-40 w-full rounded-lg sm:h-52" />
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
      className={cn("dash-skeleton", className)}
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: kpis }).map((_, index) => (
          <KpiSkeleton key={`kpi-${index}`} />
        ))}
      </div>

      {rail > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
          {Array.from({ length: rail }).map((_, index) => (
            <div
              key={`rail-${index}`}
              className="kpi-tile rounded-xl border px-3 py-2.5"
            >
              <div className="flex items-center gap-2.5">
                <Skeleton className="size-6 rounded-md" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-2 w-12" />
                  <Skeleton className="h-3.5 w-10" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-12">
        <PanelSkeleton className="md:col-span-12 xl:col-span-7" />
        <PanelSkeleton className="md:col-span-12 xl:col-span-5" />
        <PanelSkeleton className="md:col-span-6 xl:col-span-4" />
        <PanelSkeleton className="md:col-span-6 xl:col-span-4" />
        <PanelSkeleton className="md:col-span-12 xl:col-span-4" />
      </div>
    </div>
  );
}
