import { Loader } from "lucide-react";

import { DashboardCard } from "@/components/dashboard/DashboardCard.tsx";
import { PanelMeta } from "@/components/dashboard/DashboardShell.tsx";

interface ProgressPanelProps {
  submitting: boolean;
  stage: string;
  progress: number;
  /** The engine's own estimate for this AOI, in minutes. */
  estimatedMinutes: number | null;
}

/** What the engine said it is doing, at the percent it said it was at. */
export default function ProgressPanel({
  submitting,
  stage,
  progress,
  estimatedMinutes,
}: ProgressPanelProps) {
  const percent = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <DashboardCard
      title={submitting ? "Submitting survey" : "Engine at work"}
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
        <p className="text-sm font-medium">{stage || "Queued"}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {estimatedMinutes
            ? `The engine estimated about ${estimatedMinutes} minute${estimatedMinutes === 1 ? "" : "s"} for this AOI. `
            : ""}
          Each category downloads its coverages, then scores a 30 m grid across the
          whole area, so this page holds open and refreshes itself. Leaving the tab
          does not cancel the job — the engine keeps running it either way.
        </p>
      </div>
    </DashboardCard>
  );
}
