import { cn } from "@/lib/utils";

import type { SurveyStatus } from "../../lib/repositories/satelliteSurveys.ts";

const STATUS_TEXT: Record<SurveyStatus, string> = {
  queued: "Queued",
  acquiring: "Starting",
  surveying: "Running",
  publishing: "Publishing",
  succeeded: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
};

const TONE: Record<SurveyStatus, "live" | "done" | "bad"> = {
  queued: "live",
  acquiring: "live",
  surveying: "live",
  publishing: "live",
  succeeded: "done",
  failed: "bad",
  cancelled: "bad",
};

const TONE_CLASS = {
  live: "border-primary/30 bg-primary/10 text-primary",
  done: "border-success/30 bg-success/10 text-success",
  bad: "border-destructive/30 bg-destructive/10 text-destructive",
};

/** Where one survey stands, straight off its row. */
export function SurveyStatusChip({
  status,
  className,
}: {
  status: SurveyStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TONE_CLASS[TONE[status]],
        className,
      )}
    >
      {TONE[status] === "live" ? (
        <span
          aria-hidden
          className="size-1.5 animate-pulse rounded-full bg-current"
        />
      ) : null}
      {STATUS_TEXT[status]}
    </span>
  );
}
