import { useEffect, useState } from "react";
import { Briefcase, ChevronRight, Satellite } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { DashboardCard } from "@/components/dashboard/DashboardCard.tsx";
import { PanelMeta } from "@/components/dashboard/DashboardShell.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { listJobs, type JobWithProject } from "@/lib/repositories/jobs.ts";

interface SatelliteSurveyCardProps {
  workspaceId: string;
  onNavigate?: (view: string) => void;
}

/**
 * Dashboard presence for Earth Observation: shows recent jobs available for
 * multi-spectral satellite screening.
 */
export default function SatelliteSurveyCard({
  workspaceId,
  onNavigate,
}: SatelliteSurveyCardProps) {
  const [jobs, setJobs] = useState<JobWithProject[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const rows = await listJobs(workspaceId);
        if (active) setJobs(rows);
      } catch {
        // Soft fail
      } finally {
        if (active) setLoaded(true);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const loading = !loaded;

  function handleOpenJob(job: JobWithProject) {
    sessionStorage.setItem("sitesurveyor:selected_job_id", job.id);
    sessionStorage.setItem("sitesurveyor:selected_job_name", job.title);
    onNavigate?.("satellite");
  }

  return (
    <DashboardCard
      title="Earth Observation"
      icon={<Satellite />}
      titleAction={
        <PanelMeta>
          {loading ? "…" : `${jobs.length} recent job${jobs.length === 1 ? "" : "s"}`}
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
          Open Earth Observation
        </Button>
      }
      contentClassName="flex flex-col gap-1"
    >
      {loading ? (
        <>
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </>
      ) : jobs.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          No jobs in this workspace yet. Create a job to run Earth Observation screening.
        </p>
      ) : (
        jobs.slice(0, 4).map((job) => (
          <button
            key={job.id}
            type="button"
            onClick={() => handleOpenJob(job)}
            className={
              "group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors " +
              "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            }
            aria-label={`Open job ${job.title} in Earth Observation`}
          >
            <Briefcase className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{job.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {job.location ?? "No location"} {job.job_type ? `· ${job.job_type}` : ""}
              </span>
            </span>
            <Badge variant="outline" className="text-[10px] uppercase shrink-0">
              {job.status}
            </Badge>
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
