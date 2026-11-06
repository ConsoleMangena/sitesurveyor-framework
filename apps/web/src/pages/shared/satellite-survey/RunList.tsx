import { ClipboardList } from "lucide-react";

import { DashboardCard } from "@/components/dashboard/DashboardCard.tsx";
import { PanelMeta } from "@/components/dashboard/DashboardShell.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils";

import type { SurveyRun } from "../../../lib/repositories/satelliteSurveys.ts";
import { coordText } from "../../../lib/surveys/labels.ts";
import { SurveyStatusChip } from "../../../components/surveys/SurveyStatusChip.tsx";

interface RunListProps {
  runs: SurveyRun[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (runId: string) => void;
}

/** The workspace's surveys, newest first.
 *
 * This is what makes the queue shared rather than per-tab: a survey another member
 * started appears here on the next poll, at the same percent they see.
 */
export default function RunList({
  runs,
  selectedId,
  loading,
  onSelect,
}: RunListProps) {
  return (
    <DashboardCard
      title="This workspace"
      icon={<ClipboardList />}
      titleAction={<PanelMeta>{runs.length}</PanelMeta>}
      contentClassName="flex flex-col gap-1"
    >
      {loading ? (
        <>
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </>
      ) : runs.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          No survey has run here yet. The queue and every finished result live in this
          workspace, so they outlive the tab that started them.
        </p>
      ) : (
        runs.map((run) => (
          <button
            key={run.id}
            type="button"
            onClick={() => onSelect(run.id)}
            aria-current={run.id === selectedId ? "true" : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
              "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              run.id === selectedId && "bg-accent/70",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{run.clientName}</span>
              <span className="block truncate font-mono text-xs tabular-nums text-muted-foreground">
                {coordText(run.latitude)}, {coordText(run.longitude)} ·{" "}
                {run.categories.length} categories
              </span>
            </span>
            <SurveyStatusChip status={run.status} />
          </button>
        ))
      )}
    </DashboardCard>
  );
}
