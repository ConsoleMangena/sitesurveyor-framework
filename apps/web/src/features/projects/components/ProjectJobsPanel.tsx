import { useCallback, useState } from "react";
import {
  CalendarDays,
  ClipboardList,
  Link2,
  Loader2,
  MapPin,
  Plus,
  Satellite,
} from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import {
  createJob,
  listJobs,
  updateJob,
  type JobWithProject,
} from "@/lib/repositories/jobs";
import { parseJobSpec } from "@/lib/surveys/jobSpec";

const fieldClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-[2px] focus-visible:ring-ring/60";

const statusVariant: Record<string, BadgeProps["variant"]> = {
  planned: "secondary",
  scheduled: "default",
  in_progress: "warning",
  completed: "success",
  cancelled: "destructive",
};

const statusLabel: Record<string, string> = {
  planned: "Planned",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const FIELD_JOB_TYPES = [
  "Topographical",
  "Cadastral",
  "Engineering",
  "Mining",
  "Monitoring",
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function scheduleText(job: JobWithProject): string | null {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (job.scheduled_start && job.scheduled_end) {
    return `${fmt(job.scheduled_start)} – ${fmt(job.scheduled_end)}`;
  }
  return job.scheduled_start ? fmt(job.scheduled_start) : null;
}

interface ProjectJobsPanelProps {
  workspaceId: string;
  projectId: string;
  onNavigate?: (view: string) => void;
}

/**
 * The jobs carried out under one project — its sub-projects. Both field jobs and
 * Earth Observation jobs live here; an EO job is recognised by the survey
 * specification JSON in its description and hands off to the EO workbench.
 */
export function ProjectJobsPanel({ workspaceId, projectId, onNavigate }: ProjectJobsPanelProps) {
  const [allJobs, setAllJobs] = useState<JobWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailJob, setDetailJob] = useState<JobWithProject | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState(FIELD_JOB_TYPES[0]);
  const [newLocation, setNewLocation] = useState("");
  const [newStart, setNewStart] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = await listJobs(workspaceId);
    setAllJobs(rows);
  }, [workspaceId]);

  useAsyncAction(async () => {
    try {
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the jobs in this project.");
    } finally {
      setLoading(false);
    }
  }, [load]);

  const jobs = allJobs.filter((job) => job.project_id === projectId);
  const attachable = allJobs.filter((job) => !job.project_id && !job.archived_at);

  const openInEarthObservation = (job: JobWithProject) => {
    // Same handoff the job board uses: the satellite view picks the job up on mount.
    sessionStorage.setItem("sitesurveyor:selected_job_id", job.id);
    sessionStorage.setItem("sitesurveyor:selected_job_name", job.title);
    onNavigate?.("satellite");
  };

  const newEarthObservation = () => {
    // The EO setup screen creates the job; this context makes it join this project.
    sessionStorage.setItem("sitesurveyor:selected_job_project_id", projectId);
    onNavigate?.("satellite");
  };

  const handleAttach = async (job: JobWithProject) => {
    setAttachingId(job.id);
    setError(null);
    try {
      await updateJob(job.id, { project_id: projectId });
      setAttachOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to attach that job.");
    } finally {
      setAttachingId(null);
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) {
      setFormError("A job title is required.");
      return;
    }
    setFormError(null);
    setCreating(true);
    try {
      await createJob(workspaceId, {
        title: newTitle.trim(),
        job_type: newType,
        location: newLocation.trim() || undefined,
        project_id: projectId,
        scheduled_start: newStart || undefined,
        status: "planned",
      });
      setCreateOpen(false);
      setNewTitle("");
      setNewType(FIELD_JOB_TYPES[0]);
      setNewLocation("");
      setNewStart("");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to create that job.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-4">
        <div className="min-w-0">
          <CardTitle className="text-base">Jobs</CardTitle>
          <CardDescription>
            The field jobs and Earth Observation surveys carried out under this project.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAttachOpen(true)}>
            <Link2 className="size-3.5" />
            Attach job
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={newEarthObservation}>
            <Satellite className="size-3.5" />
            New Earth Observation
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" />
            New job
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <div className="space-y-2 py-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <Empty className="gap-4 border border-dashed p-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClipboardList />
              </EmptyMedia>
              <EmptyTitle className="text-base">No jobs in this project yet</EmptyTitle>
              <EmptyDescription>
                Every survey and field job carried out under this project will be listed
                here, with Earth Observation work opening straight into its workbench.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAttachOpen(true)}>
                  <Link2 className="size-3.5" />
                  Attach a job
                </Button>
                <Button size="sm" className="gap-1.5" onClick={newEarthObservation}>
                  <Satellite className="size-3.5" />
                  New Earth Observation
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-3.5" />
                  New job
                </Button>
              </div>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="divide-y divide-border">
            {jobs.map((job) => {
              const isEo = parseJobSpec(job.description) !== null;
              const when = scheduleText(job);
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setDetailJob(job)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-3 text-left transition-colors first:pt-1 last:pb-1 hover:bg-accent/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 truncate text-sm font-medium" title={job.title}>
                        {job.title}
                      </p>
                      {isEo ? (
                        <Badge variant="outline" className="shrink-0 gap-1 text-[11px]">
                          <Satellite className="size-3" aria-hidden="true" />
                          EO
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      {job.job_type ? <span>{job.job_type}</span> : null}
                      {when ? <span>· {when}</span> : null}
                      {job.location ? (
                        <span className="inline-flex items-center gap-1">
                          · <MapPin className="size-3 shrink-0" aria-hidden="true" />
                          <span className="min-w-0 truncate">{job.location}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Badge variant={statusVariant[job.status] ?? "secondary"} className="shrink-0">
                    {statusLabel[job.status] ?? job.status}
                  </Badge>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog
        open={detailJob !== null}
        onOpenChange={(open) => {
          if (!open) setDetailJob(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {detailJob ? (
            <>
              <DialogHeader>
                <DialogTitle className="min-w-0 truncate pr-6">{detailJob.title}</DialogTitle>
                <DialogDescription>Created {formatDate(detailJob.created_at)}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariant[detailJob.status] ?? "secondary"}>
                    {statusLabel[detailJob.status] ?? detailJob.status}
                  </Badge>
                  {detailJob.job_type ? (
                    <Badge variant="outline">{detailJob.job_type}</Badge>
                  ) : null}
                  {parseJobSpec(detailJob.description) ? (
                    <Badge variant="outline" className="gap-1">
                      <Satellite className="size-3" aria-hidden="true" />
                      Earth Observation
                    </Badge>
                  ) : null}
                </div>
                {(() => {
                  const spec = parseJobSpec(detailJob.description);
                  if (!spec) return null;
                  return (
                    <div className="rounded-md border border-border bg-muted/40 p-3 font-mono text-xs tabular-nums text-muted-foreground">
                      <p className="font-semibold text-foreground">Survey ground</p>
                      <p className="mt-1">
                        {spec.latitude.toFixed(5)}, {spec.longitude.toFixed(5)} · ±{spec.halfDeg}°
                      </p>
                    </div>
                  );
                })()}
                <dl className="space-y-2">
                  {detailJob.location ? (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Location</dt>
                      <dd className="min-w-0 truncate font-medium" title={detailJob.location}>
                        {detailJob.location}
                      </dd>
                    </div>
                  ) : null}
                  {scheduleText(detailJob) ? (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="flex items-center gap-1.5 text-muted-foreground">
                        <CalendarDays className="size-3.5" aria-hidden="true" />
                        Schedule
                      </dt>
                      <dd className="font-medium">{scheduleText(detailJob)}</dd>
                    </div>
                  ) : null}
                </dl>
                {detailJob.description ? (
                  <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
                    {detailJob.description}
                  </p>
                ) : null}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailJob(null)}>
                  Close
                </Button>
                {parseJobSpec(detailJob.description) ? (
                  <Button
                    className="gap-1.5"
                    onClick={() => {
                      openInEarthObservation(detailJob);
                      setDetailJob(null);
                    }}
                  >
                    <Satellite className="size-4" aria-hidden="true" />
                    Open in Earth Observation
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Attach a job to this project</DialogTitle>
            <DialogDescription>
              Pick a workspace job that does not belong to a project yet.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {attachable.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Every workspace job already belongs to a project.
              </p>
            ) : (
              attachable.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  disabled={attachingId !== null}
                  onClick={() => void handleAttach(job)}
                  className="flex w-full items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5 text-left transition-colors hover:bg-accent/60 disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium" title={job.title}>
                      {job.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {job.job_type ?? "Job"} · created {formatDate(job.created_at)}
                    </span>
                  </span>
                  {attachingId === job.id ? (
                    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New job in this project</DialogTitle>
            <DialogDescription>
              The job starts as planned and can be scheduled once the crew is set.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="project-job-title">Title</Label>
              <Input
                id="project-job-title"
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="e.g. Boundary survey — Phase 2"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="project-job-type">Type</Label>
                <select
                  id="project-job-type"
                  value={newType}
                  onChange={(event) => setNewType(event.target.value)}
                  className={`${fieldClass} w-full`}
                >
                  {FIELD_JOB_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-job-start">Start date</Label>
                <Input
                  id="project-job-start"
                  type="date"
                  value={newStart}
                  onChange={(event) => setNewStart(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-job-location">Location</Label>
              <Input
                id="project-job-location"
                value={newLocation}
                onChange={(event) => setNewLocation(event.target.value)}
                placeholder="Site or area (optional)"
              />
            </div>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={creating || !newTitle.trim()} onClick={() => void handleCreate()}>
              {creating ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Create job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
