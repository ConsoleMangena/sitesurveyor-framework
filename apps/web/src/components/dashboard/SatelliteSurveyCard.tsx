import { ChevronRight, Satellite } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { DashboardCard } from "@/components/dashboard/DashboardCard.tsx";
import { PanelMeta } from "@/components/dashboard/DashboardShell.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SurveyStatusChip } from "@/components/surveys/SurveyStatusChip.tsx";
import { coordText } from "@/lib/surveys/labels.ts";
import { useSurveyRuns } from "@/lib/hooks/useSatelliteSurveys.ts";

interface SatelliteSurveyCardProps {
  workspaceId: string;
  onNavigate?: (view: string) => void;
}

/**
 * Dashboard presence for satellite surveying: what is running now, and what the
 * workspace has already asked the satellites about.
 *
 * Both come off the run rows, so a survey another member queued shows here at the same
 * percent it shows on their screen -- and a card that says "running" is one the worker
 * really has claimed.
 */
export default function SatelliteSurveyCard({
  workspaceId,
  onNavigate,
}: SatelliteSurveyCardProps) {
  const { runs, loaded } = useSurveyRuns(workspaceId);
  const inFlight = runs.filter((run) => run.active).length;
  const loading = !loaded;

  return (
    <DashboardCard
      title="Satellite Survey"
      icon={<Satellite />}
      titleAction={
        <PanelMeta>
          {loading ? "…" : inFlight ? `${inFlight} running` : `${runs.length} run`}
        </PanelMeta>
      }
      footer={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onNavigate?.("satellite")}
        >
          Open Satellite Survey
        </Button>
      }
      contentClassName="flex flex-col gap-1"
    >
      {loading ? (
        <>
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </>
      ) : runs.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          Nothing has been surveyed from this workspace yet. Queue a coordinate and its
          progress shows up here while the worker is out reading the coverages.
        </p>
      ) : (
        runs.slice(0, 4).map((run) => (
          <button
            key={run.id}
            type="button"
            onClick={() => onNavigate?.("satellite")}
            className={
              "group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors " +
              "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            }
            aria-label={`Survey of ${run.clientName}: ${run.status}`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{run.clientName}</span>
              <span className="block truncate font-mono text-xs tabular-nums text-muted-foreground">
                {coordText(run.latitude)}, {coordText(run.longitude)}
              </span>
            </span>
            <SurveyStatusChip status={run.status} />
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>
        ))
      )}
    </DashboardCard>
  );
}
