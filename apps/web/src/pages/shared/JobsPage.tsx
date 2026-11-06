import { useState, useCallback } from "react";
import {
  Mountain,
  MapPinned,
  HardHat,
  Pickaxe,
  Activity,
  Briefcase,
  Plus,
  Search,
  MapPin,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  PlayCircle,
  Clock,
  Droplets,
  Sprout,
  ShieldAlert,
  Satellite,
  type LucideIcon,
} from "lucide-react";
import {
  archiveJob,
  createJob,
  deleteJob,
  listJobs,
  updateJob,
  type JobWithProject,
} from "../../lib/repositories/jobs.ts";
import { type ProjectWithOrg } from "../../lib/repositories/projects.ts";
import { listAllJobs, listAllProjects } from "../../lib/repositories/adminPlatform.ts";
import { mapStatus } from "../../lib/mappers.ts";
import type { Database } from "../../lib/supabase/types.ts";
import { EntityFilesCard } from "../../components/files/EntityFilesCard";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty.tsx";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Label } from "../../components/ui/label.tsx";
import { Textarea } from "../../components/ui/textarea.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../components/ui/card.tsx";
import { ComboboxField } from "../../components/templates/ComboboxField.tsx";
import { DialogTemplate } from "../../components/templates/DialogTemplate.tsx";
import { PageForm } from "../../components/templates/PageForm.tsx";
import { SuccessDialog } from "../../components/SuccessDialog.tsx";
import { Alert, AlertDescription } from "../../components/ui/alert.tsx";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";
import { Separator } from "../../components/ui/separator.tsx";
import { cn } from "../../lib/utils.ts";

type JobStatus = Database["public"]["Enums"]["job_status"];

interface JobsPageProps {
  workspaceId: string;
  isPlatformAdmin?: boolean;
  onNavigate?: (view: string) => void;
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

type JobFilter =
  | "all"
  | "Groundwater"
  | "Minerals"
  | "Soil"
  | "Hazard"
  | "Topographical"
  | "Cadastral"
  | "Engineering"
  | "Mining"
  | "Monitoring";

const jobTypeIcons: Record<string, LucideIcon> = {
  Groundwater: Droplets,
  Minerals: Pickaxe,
  Soil: Sprout,
  Hazard: ShieldAlert,
  Topographical: Mountain,
  Cadastral: MapPinned,
  Engineering: HardHat,
  Mining: Pickaxe,
  Monitoring: Activity,
};

const JOB_TYPE_OPTIONS = [
  { value: "Groundwater", label: "Groundwater & Boreholes (Earth Observation)" },
  { value: "Minerals", label: "Mineral Prospectivity & Gold (Earth Observation)" },
  { value: "Soil", label: "Soil & Land Capability (Earth Observation)" },
  { value: "Hazard", label: "Multi-Hazard & Site Safety (Earth Observation)" },
  { value: "Topographical", label: "Topographical Survey" },
  { value: "Cadastral", label: "Cadastral & Boundary" },
  { value: "Engineering", label: "Engineering & Construction" },
  { value: "Mining", label: "Mining Operations" },
  { value: "Monitoring", label: "Structural & Geotechnical Monitoring" },
];

const jobTypeColors: Record<string, string> = {
  Groundwater: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
  Minerals: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  Soil: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  Hazard: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  Topographical: "bg-primary/10 text-primary",
  Cadastral: "bg-success/15 text-success",
  Engineering: "bg-warning/15 text-warning",
  Mining: "bg-accent-purple/15 text-accent-purple",
  Monitoring: "bg-muted text-foreground",
};

function JobTypeIcon({ type }: { type: string | null }) {
  const Icon = jobTypeIcons[type ?? ""] ?? Briefcase;
  return <Icon className="h-6 w-6" aria-hidden="true" />;
}

const statusVariant = (status: string): "default" | "secondary" | "outline" | "destructive" => {
  switch (mapStatus(status)) {
    case "Planned":
    case "Scheduled":
      return "default";
    case "In Progress":
      return "secondary";
    case "Completed":
    case "Cancelled":
      return "outline";
    default:
      return "outline";
  }
};

export default function JobsPage({
  workspaceId,
  isPlatformAdmin = false,
  onNavigate,
}: JobsPageProps) {
  const [jobs, setJobs] = useState<JobWithProject[]>([]);
  const [projects, setProjects] = useState<ProjectWithOrg[]>([]);
  const projectOptions = projects.map((p) => ({
    id: p.id,
    name: p.name || "Untitled project",
  }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobEditorOpen, setJobEditorOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [savingJob, setSavingJob] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [jobType, setJobType] = useState("");
  const [jobLocation, setJobLocation] = useState("");
  const [jobStatus, setJobStatus] = useState<JobStatus>("planned");
  const [jobProjectId, setJobProjectId] = useState("");
  const [jobScheduledStart, setJobScheduledStart] = useState("");
  const [jobScheduledEnd, setJobScheduledEnd] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<JobFilter>("all");
  const [selectedJob, setSelectedJob] = useState<JobWithProject | null>(null);
  const [page, setPage] = useState(1);

  const fetchJobs = useCallback(async () => {
    try {
      setError(null);
      const data = isPlatformAdmin
        ? await listAllJobs()
        : await listJobs(workspaceId);
      setJobs(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [isPlatformAdmin, workspaceId]);

  useAsyncAction(fetchJobs, [fetchJobs]);

  const fetchProjects = useCallback(async () => {
    if (!isPlatformAdmin) return;
    try {
      const data = await listAllProjects();
      setProjects(data);
    } catch {
      setProjects([]);
    }
  }, [isPlatformAdmin]);

  useAsyncAction(fetchProjects, [fetchProjects]);

  const openCreateEditor = () => {
    setEditingJobId(null);
    setJobTitle("");
    setJobDescription("");
    setJobType("");
    setJobLocation("");
    setJobStatus("planned");
    setJobProjectId("");
    setJobScheduledStart("");
    setJobScheduledEnd("");
    setJobEditorOpen(true);
  };

  const openEditEditor = (job: JobWithProject) => {
    setEditingJobId(job.id);
    setJobTitle(job.title);
    setJobDescription(job.description ?? "");
    setJobType(job.job_type ?? "");
    setJobLocation(job.location ?? "");
    setJobStatus(job.status);
    setJobProjectId(job.project_id ?? "");
    setJobScheduledStart(toDatetimeLocal(job.scheduled_start));
    setJobScheduledEnd(toDatetimeLocal(job.scheduled_end));
    setJobEditorOpen(true);
    setSelectedJob(null);
  };

  const saveJobEditor = async () => {
    if (!jobTitle.trim()) {
      setError("Job title is required.");
      return;
    }
    setError(null);
    setSavingJob(true);
    try {
      const base = {
        title: jobTitle.trim(),
        description: jobDescription.trim() || null,
        job_type: jobType.trim() || null,
        location: jobLocation.trim() || null,
        status: jobStatus,
        project_id: jobProjectId || null,
        scheduled_start: fromDatetimeLocal(jobScheduledStart),
        scheduled_end: fromDatetimeLocal(jobScheduledEnd),
      };
      if (editingJobId) {
        await updateJob(editingJobId, base);
      } else {
        await createJob(workspaceId, base);
      }
      setJobEditorOpen(false);
      await fetchJobs();
      setSuccessMessage(editingJobId ? "Job updated successfully." : "Job created successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save job.");
    } finally {
      setSavingJob(false);
    }
  };

  const handleArchiveJob = async (id: string) => {
    if (!window.confirm("Archive this job? It will be hidden from the list.")) return;
    setError(null);
    try {
      await archiveJob(id);
      setSelectedJob(null);
      await fetchJobs();
      setSuccessMessage("Job archived successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to archive job.");
    }
  };

  const handleDeleteJob = async (id: string) => {
    if (!window.confirm("Permanently delete this job? This action cannot be undone.")) return;
    setError(null);
    try {
      await deleteJob(id);
      setSelectedJob(null);
      await fetchJobs();
      setSuccessMessage("Job deleted successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete job.");
    }
  };

  const filtered = jobs.filter((job) => {
    if (
      typeFilter !== "all" &&
      (job.job_type ?? "").toLowerCase() !== typeFilter.toLowerCase()
    )
      return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return [job.title, job.project_name ?? "", job.location ?? "", job.description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    }
    return true;
  });

  const jobStats = {
    total: jobs.length,
    planned: jobs.filter((j) => j.status === "planned").length,
    inProgress: jobs.filter((j) => j.status === "in_progress").length,
    completed: jobs.filter((j) => j.status === "completed").length,
  };

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const effectivePage = Math.min(page, totalPages);
  const paginated = filtered.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const filterTabs: { label: string; value: JobFilter }[] = [
    { label: "All", value: "all" },
    { label: "Groundwater", value: "Groundwater" },
    { label: "Minerals", value: "Minerals" },
    { label: "Soil", value: "Soil" },
    { label: "Hazard", value: "Hazard" },
    { label: "Topographical", value: "Topographical" },
    { label: "Cadastral", value: "Cadastral" },
    { label: "Engineering", value: "Engineering" },
    { label: "Mining", value: "Mining" },
    { label: "Monitoring", value: "Monitoring" },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (jobEditorOpen) {
    return (
      <PageForm
        title={editingJobId ? "Edit job" : "Add job"}
        description="Fill in the job details below."
        onBack={() => setJobEditorOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setJobEditorOpen(false)} disabled={savingJob}>
              Cancel
            </Button>
            <Button onClick={() => void saveJobEditor()} disabled={savingJob}>
              {savingJob ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="mx-auto w-full max-w-6xl">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-6">
              {/* ── Job Details ──────────────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-primary/10 text-primary">
                      <Briefcase size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">Job details</CardTitle>
                      <CardDescription>
                        Basic information about the work to be done.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="job-editor-title">
                        Title <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="job-editor-title"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        placeholder="e.g. Site Boundary Survey"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="job-editor-desc">Description</Label>
                      <Textarea
                        id="job-editor-desc"
                        rows={3}
                        value={jobDescription}
                        onChange={(e) => setJobDescription(e.target.value)}
                        placeholder="Briefly describe the scope of work"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <ComboboxField
                        label="Job type"
                        value={jobType}
                        onChange={(v) => setJobType(v)}
                        options={JOB_TYPE_OPTIONS}
                        placeholder="Select type"
                        emptyText="No types found."
                        optional
                        optionalLabel="No type"
                      />
                      <ComboboxField
                        label="Project"
                        value={jobProjectId}
                        onChange={(v) => setJobProjectId(v)}
                        options={projectOptions.map((p) => ({
                          value: p.id,
                          label: p.name || "Untitled project",
                        }))}
                        placeholder="Select project"
                        emptyText="No projects found."
                        optional
                        optionalLabel="No project"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Status & Location ────────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-primary/10 text-primary">
                      <MapPin size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        Status & Location
                      </CardTitle>
                      <CardDescription>
                        Where this job takes place and its current state.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="job-editor-location">Location</Label>
                      <Input
                        id="job-editor-location"
                        value={jobLocation}
                        onChange={(e) => setJobLocation(e.target.value)}
                        placeholder="e.g. 123 North St"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <Select
                        value={jobStatus}
                        onValueChange={(v) => setJobStatus(v as JobStatus)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planned">Planned</SelectItem>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="in_progress">
                            In progress
                          </SelectItem>
                          <SelectItem value="completed">
                            Completed
                          </SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>


              {/* ── Schedule ─────────────────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-primary/10 text-primary">
                      <CalendarDays size={15} />
                    </div>
                    <div>
                      <CardTitle className="text-base">Schedule</CardTitle>
                      <CardDescription>
                        Planned start and completion times.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="job-editor-start">
                        Scheduled start
                      </Label>
                      <Input
                        id="job-editor-start"
                        type="datetime-local"
                        value={jobScheduledStart}
                        onChange={(e) => setJobScheduledStart(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="job-editor-end">Scheduled end</Label>
                      <Input
                        id="job-editor-end"
                        type="datetime-local"
                        value={jobScheduledEnd}
                        onChange={(e) => setJobScheduledEnd(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Summary ───────────────────────────────────── */}
            <aside className="h-fit space-y-6 lg:sticky lg:top-0">
              <Card className="gap-4">
                <CardHeader>
                  <CardTitle className="text-base">Job details</CardTitle>
                  <CardDescription>Summary at a glance.</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Type</dt>
                      <dd className="truncate font-medium capitalize">
                        {jobType || "—"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Status</dt>
                      <dd className="font-medium">{mapStatus(jobStatus)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Project</dt>
                      <dd className="truncate font-medium">
                        {projectOptions.find((p) => p.id === jobProjectId)
                          ?.name || "None"}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Location</dt>
                      <dd className="truncate font-medium">
                        {jobLocation || "—"}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </aside>
          </div>
        </div>
      </PageForm>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            Jobs
            <Badge variant="secondary">Field jobs</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            View field jobs, site visits, and survey assignments
          </p>
          <p className="text-xs text-muted-foreground">
            {!isPlatformAdmin
              ? "Maintained by platform administrators"
              : `${jobStats.total} ${jobStats.total === 1 ? "job" : "jobs"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isPlatformAdmin ? (
            <Button onClick={openCreateEditor}>
              <Plus className="h-4 w-4" /> Add job
            </Button>
          ) : undefined}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
            <Briefcase className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{String(jobStats.total)}</div>
            <p className="text-xs text-muted-foreground">All survey jobs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Planned</CardTitle>
            <Clock className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{String(jobStats.planned)}</div>
            <p className="text-xs text-muted-foreground">Yet to start</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <PlayCircle className="h-5 w-5 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{String(jobStats.inProgress)}</div>
            <p className="text-xs text-muted-foreground">Active field work</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle2 className="h-5 w-5 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{String(jobStats.completed)}</div>
            <p className="text-xs text-muted-foreground">Finished jobs</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={typeFilter} onValueChange={(value) => setTypeFilter(value as JobFilter)}>
          <TabsList className="h-auto flex-wrap">
            {filterTabs.map((f) => (
              <TabsTrigger key={f.value} value={f.value} className="text-xs sm:text-sm">
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search jobs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <DialogTemplate
        open={!!selectedJob}
        onOpenChange={() => setSelectedJob(null)}
        title={selectedJob?.title ?? "Job Details"}
        description={selectedJob ? `${selectedJob.project_name ?? "No project"} · ${selectedJob.location ?? "No location"}` : undefined}
        kicker="Field job record"
        size="screen"
        footer={selectedJob ? (
          <>
            <Button
              variant="default"
              className="gap-1.5"
              onClick={() => {
                sessionStorage.setItem("sitesurveyor:selected_job_id", selectedJob.id);
                sessionStorage.setItem("sitesurveyor:selected_job_name", selectedJob.title);
                setSelectedJob(null);
                onNavigate?.("satellite");
              }}
            >
              <Satellite className="size-4" />
              Launch Earth Observation
            </Button>
            <Button variant="outline" onClick={() => setSelectedJob(null)}>
              Close
            </Button>
            <Button variant="outline" onClick={() => openEditEditor(selectedJob)}>
              Edit
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteJob(selectedJob.id)}>
              Delete Job
            </Button>
          </>
        ) : undefined}
      >
        {selectedJob && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
            <div className="min-w-0 space-y-4">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center rounded-none",
                  jobTypeColors[selectedJob.job_type ?? ""] ?? "bg-muted text-primary",
                )}
              >
                <JobTypeIcon type={selectedJob.job_type} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={statusVariant(selectedJob.status)}>
                  {mapStatus(selectedJob.status)}
                </Badge>
                {selectedJob.job_type && <Badge variant="outline">{selectedJob.job_type}</Badge>}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {selectedJob.description ?? "No description provided."}
            </p>
            <Card>
              <CardContent className="space-y-1 py-4 text-sm">
                <div className="flex items-baseline justify-between gap-4 py-1.5">
                  <span className="shrink-0 text-muted-foreground">Scheduled Start</span>
                  <span className="min-w-0 break-words text-right font-medium text-foreground">
                    {formatDate(selectedJob.scheduled_start)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-1.5">
                  <span className="shrink-0 text-muted-foreground">Scheduled End</span>
                  <span className="min-w-0 break-words text-right font-medium text-foreground">
                    {formatDate(selectedJob.scheduled_end)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-1.5">
                  <span className="shrink-0 text-muted-foreground">Project</span>
                  <span className="min-w-0 break-words text-right font-medium text-foreground">
                    {selectedJob.project_name ?? "—"}
                  </span>
                </div>
              </CardContent>
            </Card>
            </div>

            <div className="min-w-0 space-y-4">
            <EntityFilesCard
              workspaceId={workspaceId}
              entityTable="jobs"
              entityId={selectedJob.id}
              title="Job Files"
              description="Drawings, point files, PDFs and reference documents for this job."
            />
            </div>
          </div>
        )}
      </DialogTemplate>

      {filtered.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon" aria-hidden="true">
              <Briefcase className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>No jobs found</EmptyTitle>
            <EmptyDescription>
              {jobs.length === 0
                ? "No jobs available in the system yet."
                : "Try adjusting your search criteria."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paginated.map((job) => {
              const statusLabel = mapStatus(job.status);
              return (
                <Card
                  key={job.id}
                  className="cursor-pointer transition-colors hover:border-primary"
                  onClick={() => setSelectedJob(job)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedJob(job);
                    }
                  }}
                >
                  <CardContent className="flex flex-1 flex-col gap-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-none",
                          jobTypeColors[job.job_type ?? ""] ?? "bg-muted text-primary",
                        )}
                      >
                        <JobTypeIcon type={job.job_type} />
                      </div>
                      <Badge variant={statusVariant(job.status)}>{statusLabel}</Badge>
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-foreground">{job.title}</h3>
                      <p className="truncate text-sm text-muted-foreground">
                        {job.project_name ?? "No project"}
                        {job.job_type && (
                          <>
                            {" "}
                            · <span>{job.job_type}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="mt-auto space-y-1.5 text-xs text-muted-foreground">
                      {job.location && (
                        <span className="flex items-start gap-1.5">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 truncate">{job.location}</span>
                        </span>
                      )}
                      {job.scheduled_start && (
                        <span className="flex items-start gap-1.5">
                          <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" />{" "}
                          <span className="min-w-0 truncate">
                            {formatDate(job.scheduled_start)}
                            {job.scheduled_end ? ` – ${formatDate(job.scheduled_end)}` : ""}
                          </span>
                        </span>
                      )}
                    </div>
                    <Separator />
                    {isPlatformAdmin ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditEditor(job);
                        }}
                      >
                        Edit
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">View details</span>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filtered.length > pageSize && (
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={effectivePage <= 1}
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {effectivePage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={effectivePage >= totalPages}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <SuccessDialog
        open={!!successMessage}
        onOpenChange={() => setSuccessMessage(null)}
        message={successMessage ?? ""}
      />
    </div>
  );
}
