import { Loader, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { DashboardCard } from "@/components/dashboard/DashboardCard.tsx";
import { PanelMeta } from "@/components/dashboard/DashboardShell.tsx";

import type { SurveyRun } from "../../../lib/repositories/satelliteSurveys.ts";

interface ProgressPanelProps {
  run: SurveyRun;
  /** Withdrawing is only possible while the survey is still queued. */
  onCancel: (runId: string) => void;
  cancelling: boolean;
}

const STAGE_LABELS: Record<string, string> = {
  queued: "Waiting for a survey worker",
  acquiring: "Claimed by a survey worker",
  surveying: "Reading the satellite coverages",
  publishing: "Publishing maps, targets and files",
};

/** What the worker recorded, at the percent it recorded.
 *
 * Every number here comes from the run's own row, so a reload, a second tab or a
 * different machine all show the same survey in the same state.
 */
export default function ProgressPanel({
  run,
  onCancel,
  cancelling,
}: ProgressPanelProps) {
  const percent = Math.max(0, Math.min(100, Math.round(run.progress)));

  return (
    <DashboardCard
      title={STAGE_LABELS[run.status] ?? "Survey running"}
      icon={<Loader className="animate-spin" />}
      titleAction={<PanelMeta>{percent}%</PanelMeta>}
    >
      <div className="flex flex-col gap-3">
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Survey progress"
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-sm font-medium">{run.stage || STAGE_LABELS[run.status] || "Queued"}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {run.estimatedMinutes
            ? `About ${run.estimatedMinutes} minute${run.estimatedMinutes === 1 ? "" : "s"} for this study area. `
            : ""}
          The worker downloads each category&apos;s coverages, then scores a 30 m grid
          across the whole area. Closing this tab does not stop the survey — it is a row
          in the database, and the worker finishes it whether you are watching or not.
        </p>
        {run.status === "queued" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit gap-2"
            disabled={cancelling}
            onClick={() => onCancel(run.id)}
          >
            <XCircle className="size-4" aria-hidden="true" />
            {cancelling ? "Cancelling" : "Cancel and refund"}
          </Button>
        ) : null}
      </div>
    </DashboardCard>
  );
}
