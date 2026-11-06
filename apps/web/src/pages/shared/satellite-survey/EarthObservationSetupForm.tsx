import { useEffect, useState } from "react";
import {
  ArrowRight,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Globe,
  Loader,
  MapPin,
  Plus,
  Satellite,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";

import type { SurveyCategory } from "../../../lib/repositories/satelliteSurveys.ts";
import {
  createJob,
  listJobs,
  type JobWithProject,
} from "../../../lib/repositories/jobs.ts";
import {
  AOI_CHOICES,
  CATEGORY_LABELS,
  SURVEY_CATEGORY_OPTIONS,
  coverageNoteFor,
  parseCoordinate,
} from "../../../lib/surveys/labels.ts";
import {
  DATA_SOURCES,
  DEFAULT_COMPOSITE,
  FIXED_SOURCES,
  OPTICAL_PRODUCTS,
  imageryChip,
  productById,
  windowOptions,
  yearOptions,
} from "../../../lib/surveys/sources.ts";
import { validateForm, type SurveyFormValues } from "./model.ts";

const fieldClass =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-[2px] focus-visible:ring-ring/60";
const monoClass = `${fieldClass} font-mono tabular-nums`;
const labelClass =
  "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

interface EarthObservationSetupFormProps {
  workspaceId: string;
  values: SurveyFormValues;
  onChange: (patch: Partial<SurveyFormValues>) => void;
  onProceedToWorkbench: () => void;
  onLaunchSurvey: () => void;
  onViewPastObservations?: () => void;
  hasExistingRuns: boolean;
  existingRunsCount: number;
  busy: boolean;
  queueing: boolean;
}

export default function EarthObservationSetupForm({
  workspaceId,
  values,
  onChange,
  onProceedToWorkbench,
  onLaunchSurvey,
  onViewPastObservations,
  hasExistingRuns,
  existingRunsCount,
  busy,
  queueing,
}: EarthObservationSetupFormProps) {
  // Jobs state
  const [jobs, setJobs] = useState<JobWithProject[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobLocation, setNewJobLocation] = useState("");
  const [savingJob, setSavingJob] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);

  // Sources accordion state
  const [sourcesOpen, setSourcesOpen] = useState(false);

  // Form validation feedback
  const [validationProblems, setValidationProblems] = useState<string[]>([]);

  // Load workspace jobs and handle sessionStorage pre-selection
  useEffect(() => {
    let active = true;
    async function loadJobs() {
      setJobsLoading(true);
      try {
        const rows = await listJobs(workspaceId);
        if (!active) return;
        setJobs(rows);

        const storedJobId = sessionStorage.getItem("sitesurveyor:selected_job_id");
        if (storedJobId) {
          sessionStorage.removeItem("sitesurveyor:selected_job_id");
          sessionStorage.removeItem("sitesurveyor:selected_job_name");
          const matched = rows.find((j) => j.id === storedJobId);
          if (matched) {
            applyJob(matched);
          }
        }
      } catch {
        // Soft fail
      } finally {
        if (active) setJobsLoading(false);
      }
    }
    void loadJobs();
    return () => {
      active = false;
    };
  }, [workspaceId]);

  function applyJob(job: JobWithProject) {
    const patch: Partial<SurveyFormValues> = {
      jobId: job.id,
      clientName: job.title,
      address: job.location ?? "",
    };

    const jt = (job.job_type ?? "").toLowerCase();
    if (jt.includes("water") || jt.includes("groundwater") || jt.includes("borehole")) {
      patch.categories = ["water"];
    } else if (jt.includes("mineral") || jt.includes("gold") || jt.includes("mining")) {
      patch.categories = ["minerals"];
    } else if (jt.includes("soil") || jt.includes("agriculture")) {
      patch.categories = ["soil"];
    } else if (jt.includes("hazard") || jt.includes("safety") || jt.includes("monitoring")) {
      patch.categories = ["hazard"];
    }

    onChange(patch);
  }

  async function handleCreateJob() {
    if (!newJobTitle.trim()) {
      setJobError("Job title is required.");
      return;
    }
    setJobError(null);
    setSavingJob(true);
    try {
      const created = await createJob(workspaceId, {
        title: newJobTitle.trim(),
        location: newJobLocation.trim() || undefined,
        status: "planned",
      });
      const asProjectJob: JobWithProject = { ...created, project_name: null };
      setJobs((prev) => [asProjectJob, ...prev]);
      applyJob(asProjectJob);
      setCreatingJob(false);
      setNewJobTitle("");
      setNewJobLocation("");
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

  function selectCategory(id: SurveyCategory) {
    onChange({ categories: [id] });
  }

  const currentJob = jobs.find((j) => j.id === values.jobId) ?? null;

  function handleProceed() {
    const check = validateForm(values);
    if (!check.draft) {
      setValidationProblems(check.problems);
      return;
    }
    setValidationProblems([]);
    onProceedToWorkbench();
  }

  function handleLaunch() {
    const check = validateForm(values);
    if (!check.draft) {
      setValidationProblems(check.problems);
      return;
    }
    setValidationProblems([]);
    onLaunchSurvey();
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
                Earth Observation Setup
              </h1>
              <p className="text-xs text-muted-foreground">
                Configure your job, select survey domain, and choose data feeds before entering the observation workbench.
              </p>
            </div>
          </div>
        </div>

        {hasExistingRuns && onViewPastObservations ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onViewPastObservations}
            className="self-start sm:self-auto text-xs gap-1.5"
          >
            <Globe className="size-3.5" />
            View Past Observations ({existingRunsCount})
          </Button>
        ) : null}
      </div>

      {validationProblems.length > 0 ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3.5 text-xs text-destructive">
          <p className="font-semibold mb-1">Please address the following items before proceeding:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {validationProblems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ── STEP 1: Job Selection / Creation ────────────────────────────── */}
      <Card className="border-border/70 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                1
              </span>
              <div>
                <CardTitle className="text-base">Workspace Job</CardTitle>
                <CardDescription className="text-xs">
                  Create a new job record or link an existing job in this workspace.
                </CardDescription>
              </div>
            </div>
            {!creatingJob ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setCreatingJob(true)}
                disabled={busy}
              >
                <Plus className="size-3.5 text-primary" />
                New Job
              </Button>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          {!creatingJob ? (
            <div className="space-y-2">
              <select
                id="eo-job-select"
                className={`w-full ${fieldClass}`}
                value={values.jobId ?? ""}
                disabled={busy || jobsLoading}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) {
                    onChange({ jobId: "", clientName: "", address: "" });
                    return;
                  }
                  const found = jobs.find((j) => j.id === id);
                  if (found) applyJob(found);
                }}
              >
                <option value="">
                  {jobsLoading ? "Loading jobs…" : "— Select an existing job from your workspace —"}
                </option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} {job.location ? `· ${job.location}` : ""} {job.job_type ? `[${job.job_type}]` : ""}
                  </option>
                ))}
              </select>

              {currentJob ? (
                <div className="flex items-center justify-between rounded-lg border border-primary/25 bg-primary/5 p-3 text-xs">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <Briefcase className="size-4 text-primary shrink-0" />
                      <span className="truncate text-sm font-semibold">{currentJob.title}</span>
                    </div>
                    {currentJob.location ? (
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="size-3 text-muted-foreground/80 shrink-0" />
                        <span className="truncate">{currentJob.location}</span>
                      </p>
                    ) : null}
                  </div>
                  <Badge variant="outline" className="uppercase text-[10px]">
                    {currentJob.status}
                  </Badge>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  Create New Job for Earth Observation
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    setCreatingJob(false);
                    setJobError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="eo-new-title" className={labelClass}>
                    Job Title *
                  </Label>
                  <Input
                    id="eo-new-title"
                    className={fieldClass}
                    placeholder="e.g. Masvingo Groundwater Assessment"
                    value={newJobTitle}
                    disabled={savingJob}
                    onChange={(e) => setNewJobTitle(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="eo-new-location" className={labelClass}>
                    Location / Address
                  </Label>
                  <Input
                    id="eo-new-location"
                    className={fieldClass}
                    placeholder="e.g. Plot 14, Masvingo North"
                    value={newJobLocation}
                    disabled={savingJob}
                    onChange={(e) => setNewJobLocation(e.target.value)}
                  />
                </div>
              </div>

              {jobError ? (
                <p className="text-xs text-destructive">{jobError}</p>
              ) : null}

              <Button
                type="button"
                size="sm"
                className="h-8 gap-1.5 text-xs font-medium"
                disabled={savingJob || !newJobTitle.trim()}
                onClick={() => void handleCreateJob()}
              >
                {savingJob ? <Loader className="size-3.5 animate-spin" /> : null}
                {savingJob ? "Creating Job…" : "Save & Select Job"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── STEP 2: Survey Type / Domain ────────────────────────────────── */}
      <Card className="border-border/70 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
              2
            </span>
            <div>
              <CardTitle className="text-base">Survey Type (Select One)</CardTitle>
              <CardDescription className="text-xs">
                Choose the domain of interest to calibrate observation models and analytical indicators.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
            role="radiogroup"
            aria-label="Earth Observation Survey Category"
          >
            {SURVEY_CATEGORY_OPTIONS.map((option) => {
              const active = activeCategory === option.id;
              const meta = CATEGORY_LABELS[option.dossier];
              return (
                <label
                  key={option.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 text-left transition-all ${
                    active
                      ? "border-primary/60 bg-primary/10 shadow-xs ring-1 ring-primary/40"
                      : "border-border/70 hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="eo-setup-category"
                    className="mt-1"
                    checked={active}
                    disabled={busy}
                    onChange={() => selectCategory(option.id)}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground">
                        {meta.name}
                      </span>
                      <Badge variant={active ? "default" : "outline"} className="text-[10px] uppercase">
                        {option.id}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">
                      Identifies and scores {meta.noun} across the target extent.
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── STEP 3: Earth Observation Data Inputs ───────────────────────── */}
      <Card className="border-border/70 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                3
              </span>
              <div>
                <CardTitle className="text-base">Earth Observation Data Inputs</CardTitle>
                <CardDescription className="text-xs">
                  Multispectral optical, elevation DEM, radar SAR and water dynamics feeds.
                </CardDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSourcesOpen((o) => !o)}
              className="text-xs gap-1"
            >
              <span>{sourcesOpen ? "Hide Feeds" : "Customize Feeds"}</span>
              {sourcesOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Badge variant="secondary">
              Optical: {imageryChip(chosen, { year, window: windowId })}
            </Badge>
            <Badge variant="secondary">
              Elevation: {chosen.dem ?? "Copernicus DEM 30m"}
            </Badge>
            <Badge variant="secondary">
              Land Cover: {chosen.landcover ?? "ESA WorldCover 2021"}
            </Badge>
            <Badge variant="outline">ALOS PALSAR Radar SAR</Badge>
            <Badge variant="outline">Landsat WOfS Water History</Badge>
            <Badge variant="outline">CHIRPS Rainfall Climatology</Badge>
          </div>

          {sourcesOpen ? (
            <div className="space-y-3.5 border-t border-border/60 pt-3 mt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DATA_SOURCES.map((field) => (
                  <div key={field.id} className="space-y-1">
                    <Label htmlFor={`setup-src-${field.id}`} className={labelClass}>
                      {field.label}
                    </Label>
                    <select
                      id={`setup-src-${field.id}`}
                      className={`w-full ${fieldClass}`}
                      value={chosen[field.id] ?? field.default}
                      disabled={busy}
                      onChange={(e) => setSource(field.id, e.target.value)}
                    >
                      {field.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}

                <div className="space-y-1">
                  <Label htmlFor="setup-composite-year" className={labelClass}>
                    Composite Year
                  </Label>
                  <select
                    id="setup-composite-year"
                    className={`w-full ${monoClass}`}
                    value={year}
                    disabled={busy}
                    onChange={(e) =>
                      onChange({
                        composite: { year: Number(e.target.value), window: windowId },
                      })
                    }
                  >
                    {years.map((each) => (
                      <option key={each} value={each}>
                        {each}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="setup-composite-window" className={labelClass}>
                    Composite Window
                  </Label>
                  <select
                    id="setup-composite-window"
                    className={`w-full ${fieldClass}`}
                    value={windowId}
                    disabled={busy}
                    onChange={(e) =>
                      onChange({ composite: { year, window: e.target.value } })
                    }
                  >
                    {windows.map((w) => (
                      <option
                        key={w.id}
                        value={w.id}
                        disabled={!w.available}
                        title={w.reason}
                      >
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {deadWindow ? (
                <p className="text-xs text-muted-foreground">{deadWindow.reason}</p>
              ) : null}

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

      {/* ── STEP 4: Site Coordinates & Extent ───────────────────────────── */}
      <Card className="border-border/70 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
              4
            </span>
            <div>
              <CardTitle className="text-base">Site Coordinates & Observation Extent</CardTitle>
              <CardDescription className="text-xs">
                Specify the decimal degree target pin and study area radius.
              </CardDescription>
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
          </div>
        </CardContent>
      </Card>

      {/* ── Footer Actions ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border/60">
        <div className="text-xs text-muted-foreground">
          {currentJob ? (
            <span>Linked to job: <strong className="text-foreground">{currentJob.title}</strong></span>
          ) : (
            <span>No job linked yet (optional)</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            className="flex-1 sm:flex-initial h-10 gap-2 text-xs font-semibold"
            disabled={busy || queueing}
            onClick={handleProceed}
          >
            <span>Proceed to Workbench</span>
            <ArrowRight className="size-4" />
          </Button>

          <Button
            type="button"
            variant="default"
            className="flex-1 sm:flex-initial h-10 gap-2 text-xs font-semibold"
            disabled={busy || queueing}
            onClick={handleLaunch}
          >
            {queueing || busy ? <Loader className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {busy ? "Screening in progress…" : "Launch & Run Screening"}
          </Button>
        </div>
      </div>
    </div>
  );
}
