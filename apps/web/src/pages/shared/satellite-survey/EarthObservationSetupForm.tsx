import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Loader,
  MapPin,
  Plus,
  Satellite,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";

import type { SurveyCategory } from "../../../lib/repositories/satelliteSurveys.ts";
import {
  createJob,
  deleteJob,
  type JobWithProject,
} from "../../../lib/repositories/jobs.ts";
import {
  AOI_CHOICES,
  CATEGORY_LABELS,
  SURVEY_CATEGORY_OPTIONS,
  coverageNoteFor,
  parseCoordinate,
  getJobCategory,
} from "../../../lib/surveys/labels.ts";
import {
  DATA_SOURCES,
  DEFAULT_COMPOSITE,
  FIXED_SOURCES,
  OPTICAL_PRODUCTS,
  productById,
  windowOptions,
  yearOptions,
} from "../../../lib/surveys/sources.ts";
import { areaText, type SurveyQuote } from "../../../lib/surveys/pricing.ts";
import { useSurveyQuote } from "../../../lib/hooks/useSurveyQuote.ts";
import {
  jobSpecFrom,
  jobSpecProblems,
  serializeJobSpec,
} from "../../../lib/surveys/jobSpec.ts";
import CreditCostPanel from "../../../components/surveys/CreditCostPanel.tsx";
import { validateForm, DEFAULT_HALF_DEG, DEFAULT_TARGET, type SurveyFormValues } from "./model.ts";

const fieldClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-[2px] focus-visible:ring-ring/60";
const monoClass = `${fieldClass} font-mono tabular-nums`;
const labelClass =
  "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

interface EarthObservationSetupFormProps {
  workspaceId: string;
  values: SurveyFormValues;
  onChange: (patch: Partial<SurveyFormValues>) => void;
  jobs: JobWithProject[];
  jobsLoading: boolean;
  openedJob: JobWithProject | null;
  onSelectJob: (job: JobWithProject) => void;
  onClearJob?: () => void;
  onProceedToWorkbench: (job: JobWithProject) => void;
  projects?: { id: string; name: string }[];
  onProjectChange?: (projectId: string | null) => void;
  onRefreshJobs?: () => Promise<JobWithProject[]>;
  /** Set when the operator came from a project, so newly created jobs join that project. */
  projectContextId?: string | null;
  busy: boolean;
  queueing: boolean;
  /** What the platform prices this job at, from its survey type and its ground. */
  quote: SurveyQuote | null;
  quoteLoading: boolean;
  /** The workspace's credit balance, or null when it has not been reported. */
  balance: number | null;
  onNavigateBilling?: () => void;
  onNavigate?: (view: string, context?: Record<string, string>) => void;
}

export default function EarthObservationSetupForm({
  workspaceId,
  values,
  onChange,
  jobs,
  jobsLoading,
  openedJob,
  onSelectJob,
  onClearJob,
  onProceedToWorkbench,
  onRefreshJobs,
  projectContextId,
  projects = [],
  onProjectChange,
  busy,
  queueing,
  quote,
  quoteLoading,
  balance,
  onNavigateBilling,
  onNavigate,
}: EarthObservationSetupFormProps) {
  // Job creation state
  const [creatingJob, setCreatingJob] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobProjectId, setNewJobProjectId] = useState(projectContextId ?? "");
  const [newJobLocation, setNewJobLocation] = useState("");
  const [newJobCategory, setNewJobCategory] = useState<SurveyCategory>("water");
  /**
   * The ground the new job covers.
   *
   * These are part of the job, not part of the form that follows it: the survey type
   * and the ground are what the job costs, so a job cannot be created without them.
   */
  const [newJobLatitude, setNewJobLatitude] = useState(DEFAULT_TARGET.latitude.toFixed(5));
  const [newJobLongitude, setNewJobLongitude] = useState(DEFAULT_TARGET.longitude.toFixed(5));
  const [newJobHalfDeg, setNewJobHalfDeg] = useState(DEFAULT_HALF_DEG);
  const [newJobProblems, setNewJobProblems] = useState<string[]>([]);
  const [savingJob, setSavingJob] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);

  // Search filter for recent jobs
  const [filterQuery, setFilterQuery] = useState("");
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);

  async function handleDeleteJob(e: React.MouseEvent, job: JobWithProject) {
    e.stopPropagation();
    if (!window.confirm(`Permanently delete job "${job.title}" and all its Earth Observation data? This cannot be undone.`)) {
      return;
    }
    setDeletingJobId(job.id);
    try {
      await deleteJob(job.id);
      if (currentJob?.id === job.id || openedJob?.id === job.id) {
        onClearJob?.();
        onChange({ jobId: "", clientName: "", address: "" });
      }
      await onRefreshJobs?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete job.");
    } finally {
      setDeletingJobId(null);
    }
  }

  // Sources accordion state
  const [sourcesOpen, setSourcesOpen] = useState(false);

  // Form validation feedback
  const [validationProblems, setValidationProblems] = useState<string[]>([]);

  const filteredJobs = useMemo(() => {
    if (!filterQuery.trim()) return jobs;
    const query = filterQuery.toLowerCase();
    return jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(query) ||
        (j.location ?? "").toLowerCase().includes(query) ||
        (j.job_type ?? "").toLowerCase().includes(query),
    );
  }, [jobs, filterQuery]);

  const currentJob = openedJob ?? jobs.find((j) => j.id === values.jobId) ?? null;

  /** The ground the new job would cover, and what that costs. */
  const draftLatitude = parseCoordinate(newJobLatitude);
  const draftLongitude = parseCoordinate(newJobLongitude);
  const draftQuote = useSurveyQuote(
    draftLatitude === null
      ? null
      : { categories: [newJobCategory], halfDeg: newJobHalfDeg, latitude: draftLatitude },
  );
  const draftNote =
    draftLatitude !== null && draftLongitude !== null
      ? coverageNoteFor(draftLatitude, draftLongitude)
      : "";

  async function handleCreateJob() {
    const problems = jobSpecProblems({
      title: newJobTitle,
      category: newJobCategory,
      latitude: newJobLatitude,
      longitude: newJobLongitude,
      halfDeg: newJobHalfDeg,
    });
    if (problems.length > 0) {
      setNewJobProblems(problems);
      setJobError(null);
      return;
    }

    const spec = jobSpecFrom({
      category: newJobCategory,
      latitude: newJobLatitude,
      longitude: newJobLongitude,
      halfDeg: newJobHalfDeg,
    });
    if (!spec) {
      setNewJobProblems(["The area to be analysed could not be read."]);
      return;
    }

    setNewJobProblems([]);
    setJobError(null);
    setSavingJob(true);
    try {
      const typeLabel =
        newJobCategory === "water"
          ? "Groundwater & Boreholes"
          : newJobCategory === "minerals"
            ? "Mineral Exploration & Prospectivity"
            : newJobCategory === "soil"
              ? "Soil & Land Capability"
              : "Multi-Hazard & Safety";

      const created = await createJob(workspaceId, {
        title: newJobTitle.trim(),
        location: newJobLocation.trim() || undefined,
        job_type: typeLabel,
        description: serializeJobSpec(spec),
        project_id: projectContextId || newJobProjectId || undefined,
        status: "planned",
      });
      const asProjectJob: JobWithProject = { ...created, project_name: null };
      setCreatingJob(false);
      setNewJobTitle("");
      setNewJobLocation("");
      await onRefreshJobs?.();
      onSelectJob(asProjectJob);
    } catch (err) {
      setJobError(err instanceof Error ? err.message : "Failed to create job.");
    } finally {
      setSavingJob(false);
    }
  }

  const latitude = parseCoordinate(values.latitude);
  const longitude = parseCoordinate(values.longitude);
  const typedBoth = latitude !== null && longitude !== null;
  const note = typedBoth ? coverageNoteFor(latitude, longitude) : "";

  const optical = values.dataSources?.optical ?? OPTICAL_PRODUCTS[0].id;
  const product = productById(optical);
  const windows = windowOptions(optical);
  const composite = values.composite ?? DEFAULT_COMPOSITE;
  const deadWindow = windows.find((window) => !window.available);
  const windowId =
    composite.window === deadWindow?.id ? "annual" : composite.window;
  const years = yearOptions(optical);
  const year = years.includes(composite.year) ? composite.year : DEFAULT_COMPOSITE.year;

  const chosen = values.dataSources ?? {};

  function setSource(id: string, value: string) {
    onChange({ dataSources: { ...chosen, [id]: value } });
  }

  const activeCategory = values.categories[0] ?? "water";

  function handleProceed() {
    if (!currentJob) {
      setValidationProblems(["A job must be opened before entering the Earth Observation UI."]);
      return;
    }
    const check = validateForm(values);
    if (!check.draft) {
      setValidationProblems(check.problems);
      return;
    }
    setValidationProblems([]);
    onProceedToWorkbench(currentJob);
  }

  return (
    <div className="mx-auto max-w-4xl py-6 px-4 space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/60">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Satellite className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Earth Observation
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onNavigate ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium"
              onClick={() => onNavigate("projects", projectContextId ? { projectId: projectContextId, tab: "jobs" } : undefined)}
              title={projectContextId ? "Back to project" : "Return to Projects"}
            >
              <ArrowLeft className="size-3.5" />
              <span>{projectContextId ? "Back to project" : "Projects"}</span>
            </Button>
          ) : null}

          {!creatingJob ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium"
              onClick={() => setCreatingJob(true)}
              disabled={busy}
            >
              <Plus className="size-3.5" />
              Create New Job
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium"
              onClick={() => {
                setCreatingJob(false);
                setJobError(null);
              }}
            >
              <X className="size-3.5" />
              Cancel New Job
            </Button>
          )}
        </div>
      </div>

      {onProjectChange ? (
        <div className="space-y-2">
          <Label htmlFor="eo-project-filter">Project</Label>
          <select id="eo-project-filter" className={`w-full ${fieldClass}`} value={projectContextId ?? ""}
            onChange={(event) => onProjectChange(event.target.value || null)}>
            <option value="">All projects and unassigned jobs</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <p className="text-sm text-muted-foreground">Choose a project, then open a job. Survey runs and results stay with that job.</p>
        </div>
      ) : null}

      {validationProblems.length > 0 ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3.5 text-xs text-destructive">
          <ul className="list-disc space-y-0.5 pl-4">
            {validationProblems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── Inline Job Creation Form ────────────────────────────────────── */}
      {creatingJob ? (
        <Card className="border-primary/40 bg-primary/5 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="size-4 text-primary" />
              Create New Job for Earth Observation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="space-y-1.5">
              <Label htmlFor="eo-new-project">Project for this job</Label>
              <select id="eo-new-project" className={`w-full ${fieldClass}`}
                value={projectContextId ?? newJobProjectId} disabled={savingJob || Boolean(projectContextId)}
                onChange={(event) => setNewJobProjectId(event.target.value)}>
                <option value="">Unassigned — no project</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              {!projectContextId && !newJobProjectId ? <p className="text-xs text-muted-foreground">This job will be unassigned. You can attach it from a project's Jobs tab later.</p> : null}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="eo-create-title" className={labelClass}>
                  Job Title *
                </Label>
                <Input
                  id="eo-create-title"
                  className={fieldClass}
                  placeholder="e.g. Masvingo Groundwater Siting"
                  value={newJobTitle}
                  disabled={savingJob}
                  onChange={(e) => setNewJobTitle(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eo-create-loc" className={labelClass}>
                  Site Location / Address
                </Label>
                <Input
                  id="eo-create-loc"
                  className={fieldClass}
                  placeholder="e.g. Plot 14, Masvingo North"
                  value={newJobLocation}
                  disabled={savingJob}
                  onChange={(e) => setNewJobLocation(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className={labelClass}>Primary Survey Domain</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SURVEY_CATEGORY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setNewJobCategory(opt.id)}
                    className={`rounded-md border p-2 text-left text-xs font-medium transition-all ${
                      newJobCategory === opt.id
                        ? "border-primary bg-primary/15 text-primary shadow-xs ring-1 ring-primary/40"
                        : "border-border/70 hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    {CATEGORY_LABELS[opt.dossier].short}
                  </button>
                ))}
              </div>
            </div>

            {/* ── The ground this job covers ─────────────────────────────── */}
            <div className="space-y-3 rounded-lg border border-border/70 bg-background/60 p-3">
              <p className="text-xs font-semibold text-foreground">Area to be analysed</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="eo-new-lat" className={labelClass}>
                    Latitude *
                  </Label>
                  <Input
                    id="eo-new-lat"
                    className={monoClass}
                    type="number"
                    step="0.00001"
                    min={-90}
                    max={90}
                    inputMode="decimal"
                    value={newJobLatitude}
                    disabled={savingJob}
                    onChange={(e) => setNewJobLatitude(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="eo-new-lon" className={labelClass}>
                    Longitude *
                  </Label>
                  <Input
                    id="eo-new-lon"
                    className={monoClass}
                    type="number"
                    step="0.00001"
                    min={-180}
                    max={180}
                    inputMode="decimal"
                    value={newJobLongitude}
                    disabled={savingJob}
                    onChange={(e) => setNewJobLongitude(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="eo-new-extent" className={labelClass}>
                  Observation extent (AOI) *
                </Label>
                <select
                  id="eo-new-extent"
                  className={`w-full ${fieldClass}`}
                  value={newJobHalfDeg}
                  disabled={savingJob}
                  onChange={(e) => setNewJobHalfDeg(Number(e.target.value))}
                >
                  {AOI_CHOICES.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
                {draftQuote.quote ? (
                  <p className="text-[11px] text-muted-foreground">
                    Ground covered:{" "}
                    <span className="font-medium text-foreground">
                      {areaText(draftQuote.quote)}
                    </span>
                  </p>
                ) : null}
              </div>

              {draftNote ? (
                <p
                  role="status"
                  className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs leading-snug text-amber-700 dark:text-amber-400"
                >
                  {draftNote}
                </p>
              ) : null}

              <CreditCostPanel
                quote={draftQuote.quote}
                loading={draftQuote.loading}
                balance={balance}
                onNavigateBilling={onNavigateBilling}
              />
            </div>

            {newJobProblems.length > 0 ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
              >
                <p className="font-semibold mb-1">This job cannot be priced yet:</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {newJobProblems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {jobError ? (
              <p className="text-xs text-destructive">{jobError}</p>
            ) : null}

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 text-xs font-semibold"
                disabled={savingJob || !newJobTitle.trim()}
                onClick={() => void handleCreateJob()}
              >
                {savingJob ? <Loader className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                {savingJob
                  ? "Creating Job…"
                  : draftQuote.quote
                    ? `Save & Open · ${draftQuote.quote.credits} credit${draftQuote.quote.credits === 1 ? "" : "s"}`
                    : "Save & Open"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setCreatingJob(false);
                  setJobError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ── RECENT JOBS SECTION ─────────────────────────────────────────── */}
      <Card className="border-border/70 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Briefcase className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{projectContextId ? "Project Jobs" : "Recent Jobs"}</CardTitle>
                  <Badge variant="secondary" className="text-[11px] font-mono px-1.5 py-0">
                    {jobs.length}
                  </Badge>
                </div>
              </div>
            </div>

            {jobs.length > 3 ? (
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  className="h-8 pl-8 text-xs bg-muted/40"
                  placeholder="Filter recent jobs…"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                />
              </div>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="pt-0 space-y-2">
          {jobsLoading ? (
            <div className="space-y-2 py-4 text-center text-xs text-muted-foreground">
              <Loader className="size-4 animate-spin mx-auto text-primary" />
              <p>Loading recent workspace jobs…</p>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/80 py-8 text-center space-y-2">
              <Briefcase className="size-8 mx-auto text-muted-foreground/60" />
              <p className="text-xs font-medium text-foreground">
                {filterQuery.trim() ? "No jobs match your filter." : projectContextId ? "No jobs found in this project yet." : "No jobs found in this workspace yet."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 text-xs gap-1.5"
                onClick={() => setCreatingJob(true)}
              >
                <Plus className="size-3.5" />
                Create First Job
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {filteredJobs.map((job) => {
                const isSelected = currentJob?.id === job.id;
                return (
                  <div
                    key={job.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-3.5 transition-all ${
                      isSelected
                        ? "border-primary/70 bg-primary/10 ring-1 ring-primary/40 shadow-xs"
                        : "border-border/70 bg-card hover:border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground truncate">
                          {job.title}
                        </span>
                        {isSelected ? (
                          <Badge variant="default" className="text-[10px] uppercase font-semibold h-4 px-1.5">
                            Selected
                          </Badge>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{job.project_name ?? projects.find((project) => project.id === job.project_id)?.name ?? (job.project_id ? "Project job" : "Unassigned")}</span>
                        {job.location ? (
                          <span className="flex items-center gap-1 truncate">
                            <MapPin className="size-3 text-muted-foreground/80 shrink-0" />
                            {job.location}
                          </span>
                        ) : null}
                        {job.job_type ? (
                          <span className="font-medium text-primary">
                            {job.job_type}
                          </span>
                        ) : null}
                        {job.created_at ? (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
                            <Calendar className="size-3" />
                            {new Date(job.created_at).toLocaleDateString()}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-end gap-2 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40 shrink-0">
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider shrink-0">
                        {job.status}
                      </Badge>
                      <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                        <Button
                          type="button"
                          size="sm"
                          variant={isSelected ? "default" : "outline"}
                          className="h-8 gap-1.5 text-xs font-semibold"
                          onClick={() => {
                            onSelectJob(job);
                          }}
                        >
                          <span>{isSelected ? "Open in EO UI" : "Select Job"}</span>
                          <ArrowRight className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                          title="Delete job"
                          disabled={deletingJobId === job.id}
                          onClick={(e) => void handleDeleteJob(e, job)}
                        >
                          {deletingJobId === job.id ? (
                            <Loader className="size-3.5 animate-spin text-destructive" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── SELECTED JOB CONFIGURATION & PARAMETERS ─────────────────────── */}
      {/* Hidden while a job is being created: the new-job card carries its own
          coordinate and extent inputs, and showing both put two editors for the
          same AOI on screen at once, each with its own state. */}
      {currentJob && !creatingJob ? (
        <div className="space-y-6 pt-2">
          {/* Active Job Summary Banner */}
          <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 p-3 text-xs">
            <div className="flex items-center gap-2">
              <Briefcase className="size-4 text-primary shrink-0" />
              <span>
                Configuring Earth Observation for: <strong className="text-foreground">{currentJob.title}</strong>
                {currentJob.location ? ` (${currentJob.location})` : ""}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-primary"
              onClick={() => {
                onChange({ jobId: "", clientName: "", address: "" });
              }}
            >
              Switch Job
            </Button>
          </div>

          {/* ── Survey Type / Domain ──────────────────────────────────────── */}
          <Card className="border-border/70 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  1
                </span>
                <div>
                  <CardTitle className="text-base">Survey Type</CardTitle>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <div
                className="grid grid-cols-1 gap-3"
                role="region"
                aria-label="Earth Observation Survey Category"
              >
                {SURVEY_CATEGORY_OPTIONS.filter((option) => option.id === (currentJob ? getJobCategory(currentJob) : activeCategory)).map((option) => {
                  const meta = CATEGORY_LABELS[option.dossier];
                  return (
                    <div
                      key={option.id}
                      className="col-span-full flex items-start gap-3.5 rounded-lg border border-primary/60 bg-primary/10 p-4 text-left shadow-xs ring-1 ring-primary/40"
                    >
                      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3 stroke-[3]" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {meta.short}
                          </span>
                          <Badge variant="default" className="text-[10px] uppercase font-bold tracking-wider">
                            {option.id}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {meta.name}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* ── Earth Observation Data Inputs ───────────────────────────── */}
          <Card className="border-border/70 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                    2
                  </span>
                  <div>
                    <CardTitle className="text-base">Earth Observation Data Inputs</CardTitle>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-primary"
                  onClick={() => setSourcesOpen((prev) => !prev)}
                >
                  {sourcesOpen ? (
                    <>
                      <span>Collapse</span>
                      <ChevronUp className="size-3.5 ml-1" />
                    </>
                  ) : (
                    <>
                      <span>Customize Feeds</span>
                      <ChevronDown className="size-3.5 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-lg border border-border/60">
                <span className="font-semibold text-foreground">Active Feeds:</span>
                <span className="rounded bg-background px-2 py-0.5 border text-foreground font-medium">
                  {product.label} ({year}, {composite.window})
                </span>
                <span className="rounded bg-background px-2 py-0.5 border text-foreground font-medium">
                  NASADEM 30m Elevation
                </span>
                <span className="rounded bg-background px-2 py-0.5 border text-foreground font-medium">
                  Sentinel-1 SAR Radar
                </span>
              </div>

              {sourcesOpen ? (
                <div className="space-y-4 pt-2 border-t border-border/60">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="eo-optical-source" className={labelClass}>
                        Optical Imagery Product
                      </Label>
                      <select
                        id="eo-optical-source"
                        className={`w-full ${fieldClass}`}
                        value={optical}
                        disabled={busy}
                        onChange={(e) => setSource("optical", e.target.value)}
                      >
                        {OPTICAL_PRODUCTS.map((prod) => (
                          <option key={prod.id} value={prod.id}>
                            {prod.label} ({prod.family})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="eo-comp-year" className={labelClass}>
                          Archive Year
                        </Label>
                        <select
                          id="eo-comp-year"
                          className={`w-full ${fieldClass}`}
                          value={year}
                          disabled={busy}
                          onChange={(e) =>
                            onChange({
                              composite: { ...composite, year: Number(e.target.value), window: windowId },
                            })
                          }
                        >
                          {years.map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="eo-comp-window" className={labelClass}>
                          Seasonal Window
                        </Label>
                        <select
                          id="eo-comp-window"
                          className={`w-full ${fieldClass}`}
                          value={windowId}
                          disabled={busy}
                          onChange={(e) =>
                            onChange({
                              composite: { ...composite, year, window: e.target.value },
                            })
                          }
                        >
                          {windows.map((win) => (
                            <option key={win.id} value={win.id} disabled={!win.available}>
                              {win.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {DATA_SOURCES.filter((s) => s.id !== "optical").map((group) => {
                      const selected = chosen[group.id] ?? group.options[0].value;
                      return (
                        <div key={group.id} className="space-y-1.5">
                          <Label htmlFor={`eo-src-${group.id}`} className={labelClass}>
                            {group.label}
                          </Label>
                          <select
                            id={`eo-src-${group.id}`}
                            className={`w-full ${fieldClass}`}
                            value={selected}
                            disabled={busy}
                            onChange={(e) => setSource(group.id, e.target.value)}
                          >
                            {group.options.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>

                  <details className="text-xs">
                    <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                      Fixed Pre-Calibrated Models
                    </summary>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted-foreground">
                      {FIXED_SOURCES.map((source) => (
                        <li key={source}>{source}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* ── Site Coordinates & Extent ─────────────────────────────────── */}
          <Card className="border-border/70 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  3
                </span>
                <div>
                  <CardTitle className="text-base">Site Coordinates & Extent</CardTitle>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3.5 pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="eo-lat" className={labelClass}>
                    Latitude (Decimal Degrees)
                  </Label>
                  <Input
                    id="eo-lat"
                    className={monoClass}
                    type="number"
                    step="0.00001"
                    min={-90}
                    max={90}
                    inputMode="decimal"
                    value={values.latitude}
                    disabled={busy}
                    onChange={(e) => onChange({ latitude: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="eo-lon" className={labelClass}>
                    Longitude (Decimal Degrees)
                  </Label>
                  <Input
                    id="eo-lon"
                    className={monoClass}
                    type="number"
                    step="0.00001"
                    min={-180}
                    max={180}
                    inputMode="decimal"
                    value={values.longitude}
                    disabled={busy}
                    onChange={(e) => onChange({ longitude: e.target.value })}
                  />
                </div>
              </div>

              {note ? (
                <p
                  role="status"
                  className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs leading-snug text-amber-700 dark:text-amber-400"
                >
                  {note}
                </p>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="eo-extent" className={labelClass}>
                  Observation Extent (AOI)
                </Label>
                <select
                  id="eo-extent"
                  className={`w-full ${fieldClass}`}
                  value={values.halfDeg}
                  disabled={busy}
                  onChange={(e) => onChange({ halfDeg: Number(e.target.value) })}
                >
                  {AOI_CHOICES.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
                {quote ? (
                  <p className="text-[11px] text-muted-foreground">
                    Ground covered:{" "}
                    <span className="font-medium text-foreground">{areaText(quote)}</span>
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* ── Credit cost ───────────────────────────────────────────────── */}
          <Card className="border-border/70 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  4
                </span>
                <div>
                  <CardTitle className="text-base">Credit cost</CardTitle>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <CreditCostPanel
                quote={quote}
                loading={quoteLoading}
                balance={balance}
                onNavigateBilling={onNavigateBilling}
              />
            </CardContent>
          </Card>

          {/* ── Footer Actions ────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border/60">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span>Opened Job: <strong className="text-foreground">{currentJob.title}</strong></span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs text-muted-foreground hover:text-destructive gap-1"
                onClick={() => onChange({ jobId: "", clientName: "", address: "" })}
                title="Deselect this job"
              >
                <X className="size-3" />
                <span>Exit Selection</span>
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                className="flex-1 sm:flex-initial h-10 gap-2 text-xs font-semibold justify-center"
                disabled={busy || queueing}
                onClick={handleProceed}
              >
                <span>Open Workbench</span>
                <ArrowRight className="size-4 shrink-0" />
              </Button>

            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
          No job selected.
        </div>
      )}
    </div>
  );
}
