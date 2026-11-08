import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, ChevronLeft, Coins, Maximize2, Minimize2, LogOut } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import type { Map as LeafletMap } from "leaflet";

import { Button } from "@/components/ui/button.tsx";
import {
  DashboardHeader,
  DashboardShell,
} from "@/components/dashboard/DashboardShell.tsx";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";

import CandidateTable from "@/components/surveys/CandidateTable.tsx";
import ContentsPanel, { type SurveySnapshot } from "@/components/surveys/ContentsPanel.tsx";
import ExportsPanel from "@/components/surveys/ExportsPanel.tsx";
import IndicatorsPanel from "@/components/surveys/IndicatorsPanel.tsx";
import SurveyMap, { type MapViewInfo } from "@/components/surveys/SurveyMap.tsx";
import MapExportModal from "@/components/surveys/MapExportModal.tsx";
import { StatusStrip, WorkbenchBar } from "@/components/surveys/WorkbenchBar.tsx";

import {
  InsufficientCreditsError,
  cancelSurveyRun,
  deliverableUrl,
  startSurvey,
  type SurveyProvenance,
} from "../../../lib/repositories/satelliteSurveys.ts";
import { getAiCreditBalance } from "../../../lib/repositories/pesepay.ts";
import {
  listJobs,
  deleteJob,
  updateJob,
  type JobWithProject,
} from "../../../lib/repositories/jobs.ts";
import { useSurveyDetail, useSurveyRuns } from "../../../lib/hooks/useSatelliteSurveys.ts";
import { useSurveyQuote } from "../../../lib/hooks/useSurveyQuote.ts";
import {
  CATEGORY_EXPORTS,
  CATEGORY_RASTER_PALETTE,
  CATEGORY_ZONE_LABELS,
  outsideCoverage,
  parseCoordinate,
  getJobCategory,
  toDossierCategory,
} from "../../../lib/surveys/labels.ts";
import { canAfford } from "../../../lib/surveys/pricing.ts";
import {
  jobSpecFrom,
  parseJobSpec,
  serializeJobSpec,
} from "../../../lib/surveys/jobSpec.ts";
import {
  aoiBounds,
  basemapById,
  basisText,
  candidateRows,
  dmsText,
  elapsedText,
  gridText,
  jobText,
  mapCandidates,
  metricRange,
  stationDepthLabel,
  type MapCandidate,
} from "../../../lib/surveys/workbench.ts";
import {
  DEFAULT_COMPOSITE,
  coverageLabel,
  imageryChip,
  inputsText,
} from "../../../lib/surveys/sources.ts";
import TargetForm from "./TargetForm.tsx";
import EarthObservationSetupForm from "./EarthObservationSetupForm.tsx";
import {
  initialForm,
  pinTarget,
  resultsNote,
  sourceText,
  validateForm,
  type SurveyFormValues,
} from "./model.ts";

interface SatelliteSurveyPageProps {
  workspaceId: string;
  onNavigate?: (view: string) => void;
  onEnterFullscreen?: () => void;
  onExitFullscreen?: () => void;
  isFullscreen?: boolean;
}

/**
 * The engine's survey workbench, running on this platform's own tables.
 *
 * Three regions, one screen: Contents says what is drawn, the map is where the target is
 * placed, and Analysis holds the parameters, the four scores, the ranked candidates and
 * the files. All of them read `survey_runs`, `survey_targets` and `survey_deliverables` —
 * the same rows the platform's worker claims and publishes — so a survey queued here is
 * the survey a teammate sees moving, and closing the tab costs a reader nothing but the
 * waiting.
 */
export default function SatelliteSurveyPage({
  workspaceId,
  onNavigate,
  onEnterFullscreen,
  onExitFullscreen,
  isFullscreen: externalIsFullscreen,
}: SatelliteSurveyPageProps) {
  const [localFullscreen, setLocalFullscreen] = useState(false);
  const isFullscreen = externalIsFullscreen ?? localFullscreen;

  const toggleFullscreen = useCallback(() => {
    const next = !isFullscreen;
    if (next) {
      onEnterFullscreen?.();
    } else {
      onExitFullscreen?.();
    }
    setLocalFullscreen(next);
    setTimeout(() => {
      setResizeToken((token) => token + 1);
    }, 200);
  }, [isFullscreen, onEnterFullscreen, onExitFullscreen]);

  const handleExitProject = useCallback(() => {
    if (isFullscreen) {
      onExitFullscreen?.();
      setLocalFullscreen(false);
    }
    setOpenedJob(null);
    patch({ jobId: "", clientName: "", address: "" });
    sessionStorage.removeItem("sitesurveyor:selected_job_id");
    sessionStorage.removeItem("sitesurveyor:selected_job_name");
    setTimeout(() => {
      setResizeToken((token) => token + 1);
    }, 200);
  }, [isFullscreen, onExitFullscreen, patch]);
  const { runs, error: listError, loaded, refresh, adopt } = useSurveyRuns(workspaceId);

  const [jobs, setJobs] = useState<JobWithProject[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [openedJob, setOpenedJob] = useState<JobWithProject | null>(null);

  const [values, setValues] = useState<SurveyFormValues>(initialForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [queuedThisSession, setQueuedThisSession] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [refused, setRefused] = useState<string | null>(null);
  const [layers, setLayers] = useState({ aoi: true, candidates: true, raster: true });
  /**
   * Whether the reader asked for the drape on or off. Left null, the classified raster
   * is the map layer whenever the survey published one.
   */
  const [rasterOverride, setRasterOverride] = useState<boolean | null>(null);
  const [rasterOpacity, setRasterOpacity] = useState(0.65);

  /**
   * The price of the job as it stands, and the balance it would be taken from.
   *
   * The quote is keyed by what it was priced for, so changing the extent or the survey
   * type cannot leave the previous price on screen for a frame -- and a quote that
   * failed to load is not shown as a price of zero.
   */
  const [balance, setBalance] = useState<number | null>(null);
  /** What the last queued survey was charged, and what was left afterwards. */
  const [charged, setCharged] = useState<{ credits: number; remaining: number | null } | null>(null);

  const fetchJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const rows = await listJobs(workspaceId);
      setJobs(rows);
      return rows;
    } catch {
      return [];
    } finally {
      setJobsLoading(false);
    }
  }, [workspaceId]);

  const handleDeleteJob = useCallback(async (jobId: string) => {
    try {
      await deleteJob(jobId);
      if (openedJob?.id === jobId) {
        setOpenedJob(null);
        setValues((prev) => ({ ...prev, jobId: "", clientName: "", address: "" }));
      }
      await fetchJobs();
      setSelectedId(null);
      void refresh();
    } catch (err) {
      console.error("Failed to delete job:", err);
    }
  }, [openedJob, fetchJobs, refresh]);

  const handleRenameJob = useCallback(
    async (jobId: string, title: string) => {
      try {
        await updateJob(jobId, { title });
        if (openedJob?.id === jobId) {
          setOpenedJob((prev) => (prev ? { ...prev, title } : prev));
          setValues((prev) => (prev.jobId === jobId ? { ...prev, clientName: title } : prev));
        }
        await fetchJobs();
      } catch (err) {
        console.error("Failed to rename job:", err);
      }
    },
    [openedJob, fetchJobs],
  );

  function applyAndOpenJob(job: JobWithProject) {
    const spec = parseJobSpec(job.description);
    const cat = spec?.category ?? getJobCategory(job);
    const patchValues: Partial<SurveyFormValues> = {
      jobId: job.id,
      clientName: job.title,
      address: job.location ?? "",
      categories: [cat],
    };

    // The job holds the ground it covers, so opening a job restores the coordinate and
    // the extent it was created for rather than starting from the defaults.
    if (spec?.hasGround) {
      patchValues.latitude = spec.latitude.toFixed(5);
      patchValues.longitude = spec.longitude.toFixed(5);
      patchValues.halfDeg = spec.halfDeg;
    }

    setValues((prev) => ({ ...prev, ...patchValues }));
    setOpenedJob(job);
    // The new job may classify a different category, and the drape follows the category.
    setRasterOverride(null);
  }

  useEffect(() => {
    void fetchJobs().then((rows) => {
      const storedJobId = sessionStorage.getItem("sitesurveyor:selected_job_id");
      if (storedJobId) {
        sessionStorage.removeItem("sitesurveyor:selected_job_id");
        sessionStorage.removeItem("sitesurveyor:selected_job_name");
        const matched = rows.find((j) => j.id === storedJobId);
        if (matched) {
          applyAndOpenJob(matched);
        }
      }
    });
  }, [fetchJobs]);

  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [mapViewInfo, setMapViewInfo] = useState<MapViewInfo>({ zoom: 13, scale: "—", coords: "—" });
  const [basemap, setBasemap] = useState("satellite");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [view, setView] = useState<MapViewInfo | null>(null);
  const [fitToken, setFitToken] = useState(0);
  const [resizeToken, setResizeToken] = useState(0);
  const [focus, setFocus] = useState<{
    latitude: number;
    longitude: number;
    token: number;
  } | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);

  const selected = runs.find((run) => run.id === selectedId) ?? runs[0] ?? null;
  const running = runs.find((run) => run.active) ?? null;
  const { detail, error: detailError } = useSurveyDetail(selected);

  // Elapsed time is a timer, not `Date.now()` in render: reading the wall clock while
  // rendering would make the number jump on any unrelated re-render of the page.
  const [lastTickMs, setLastTickMs] = useState<number | null>(null);
  const runningId = running?.id ?? null;

  useEffect(() => {
    if (!runningId) return;
    const timer = window.setInterval(() => setLastTickMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [runningId]);

  // A run opened straight after a page load can be younger than the last tick; the
  // elapsed helper clamps that to 0s rather than inventing a negative clock.
  const elapsed =
    running && running.status !== "queued" && lastTickMs !== null
      ? elapsedText(lastTickMs - new Date(running.createdAt).getTime())
      : null;

  const target = pinTarget(values, selected);
  const typedLat = parseCoordinate(values.latitude);
  const typedLon = parseCoordinate(values.longitude);
  const outside =
    typedLat !== null && typedLon !== null && outsideCoverage(typedLat, typedLon);

  const provenance: SurveyProvenance | null = detail?.run.result?.dataSources ?? null;
  const imagery =
    coverageLabel(provenance, "optical") ??
    (running ? imageryChip(values.dataSources ?? {}, values.composite ?? DEFAULT_COMPOSITE) : null);
  const opticalSource = provenance?.selectable.optical
    ? (provenance.selectable.optical.credit ?? provenance.selectable.optical.label)
    : null;

  const jobCategory = openedJob ? getJobCategory(openedJob) : (values.categories[0] ?? "water");
  const jobDossierCategory = toDossierCategory(jobCategory);

  /**
   * The price of the job the form currently describes.
   *
   * Asked of the platform rather than worked out here: the platform is what charges, so
   * the number on screen and the number on the ledger are the same computation.
   */
  const { quote, loading: quoteLoading } = useSurveyQuote(
    typedLat !== null && values.categories.length
      ? { categories: values.categories, halfDeg: values.halfDeg, latitude: typedLat }
      : null,
  );

  useEffect(() => {
    let active = true;
    void getAiCreditBalance(workspaceId)
      .then((next) => {
        if (active) setBalance(next);
      })
      .catch(() => {
        // An unreadable balance is not a balance of zero: the form then says it does
        // not know the balance rather than refusing a survey the workspace can afford.
        if (active) setBalance(null);
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const candidates = useMemo(
    () => mapCandidates(detail?.targets ?? [], undefined, [jobDossierCategory]),
    [detail?.targets, jobDossierCategory],
  );
  const rows = useMemo(
    () => candidateRows(detail?.targets ?? [], [jobDossierCategory]),
    [detail?.targets, jobDossierCategory],
  );

  const kmzDeliverable = useMemo(() => {
    const kinds = CATEGORY_EXPORTS[jobDossierCategory];
    return (detail?.deliverables ?? []).find((d) => d.kind === kinds.kmz) ?? null;
  }, [detail?.deliverables, jobDossierCategory]);

  const overlayDeliverable = useMemo(() => {
    const kinds = CATEGORY_EXPORTS[jobDossierCategory];
    return (detail?.deliverables ?? []).find((d) => d.kind === kinds.overlay) ?? null;
  }, [detail?.deliverables, jobDossierCategory]);

  const tifDeliverable = useMemo(() => {
    const kinds = CATEGORY_EXPORTS[jobDossierCategory];
    return (detail?.deliverables ?? []).find((d) => d.kind === kinds.tif) ?? null;
  }, [detail?.deliverables, jobDossierCategory]);

  const [rasterUrl, setRasterUrl] = useState<string | null>(null);
  const [geoTiffUrl, setGeoTiffUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setRasterUrl(null);
    if (!overlayDeliverable) return;
    void deliverableUrl(overlayDeliverable).then((url) => {
      if (active) setRasterUrl(url);
    });
    return () => {
      active = false;
    };
  }, [overlayDeliverable]);

  useEffect(() => {
    let active = true;
    setGeoTiffUrl(null);
    if (!tifDeliverable) return;
    void deliverableUrl(tifDeliverable).then((url) => {
      if (active) setGeoTiffUrl(url);
    });
    return () => {
      active = false;
    };
  }, [tifDeliverable]);

  const hasRaster = Boolean(overlayDeliverable || tifDeliverable);
  const rasterOn = rasterOverride ?? hasRaster;

  // Same entries, order and heading the on-screen legend shows, so the printed
  // sheet reads identically to the workbench. Zone classes first, then every other
  // symbol the sheet draws.
  const exportCandidates = useMemo(
    () =>
      layers.candidates
        ? rows.map((row) => ({
            latitude: row.latitude,
            longitude: row.longitude,
            color: row.color,
            label: stationDepthLabel(row.category, row.payload) ?? undefined,
          }))
        : [],
    [layers.candidates, rows],
  );

  const targetDepth = detail?.run.result?.waterDepth ?? null;
  const exportTargetDepthLabel = targetDepth
    ? `Water table ~${metricRange(targetDepth.wetM, targetDepth.dryM) ?? targetDepth.read ?? "?"}`
    : undefined;

  const exportLegendItems = useMemo(
    () => [
      ...(rasterOn
        ? [5, 4, 3, 2, 1].map((code) => ({
            kind: "zone" as const,
            color: CATEGORY_RASTER_PALETTE[jobDossierCategory][code],
            label: CATEGORY_ZONE_LABELS[jobDossierCategory][code] ?? `Zone ${code}`,
          }))
        : []),
      ...(layers.candidates && rows.length > 0
        ? [
            {
              kind: "station" as const,
              color: rows[0].color,
              label: "Recommended station (depth beside each)",
            },
          ]
        : []),
      ...(layers.aoi
        ? [{ kind: "aoi" as const, label: "Survey area (AOI) boundary" }]
        : []),
      { kind: "target" as const, label: "Survey centre" },
      { kind: "imagery" as const, label: "Satellite imagery base" },
    ],
    [rasterOn, jobDossierCategory, layers.candidates, layers.aoi, rows],
  );
  const exportLegendTitle = rasterOn
    ? jobDossierCategory === "hazard_safety"
      ? "Classified Risk"
      : "Classified Potential"
    : "Map Symbols";
  const exportBasemap = basemapById(basemap);

  const handleDownloadKmz = useCallback(async () => {
    if (!kmzDeliverable) return;
    const url = await deliverableUrl(kmzDeliverable);
    if (url) window.open(url, "_blank", "noreferrer");
  }, [kmzDeliverable]);

  const snapshot: SurveySnapshot = {
    target: dmsText(target.latitude, target.longitude),
    crs: detail?.run.result?.target?.crs ?? "—",
    grid: gridText(detail?.run.result?.target?.cellM),
    source: sourceText(selected, queuedThisSession),
    inputs: inputsText(provenance),
    basis: basisText(detail?.run.result?.scoreBasis ?? null),
  };

  const pill = listError
    ? { state: "error" as const, text: "Queue unreadable" }
    : running
      ? { state: "running" as const, text: "Survey running" }
      : { state: "ready" as const, text: "Worker ready" };

  function patch(next: Partial<SurveyFormValues>) {
    setValues((current) => ({ ...current, ...next }));
  }

  function focusCandidate(candidate: MapCandidate) {
    setFocusedKey(candidate.key);
    setFocus({
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      token: Date.now(),
    });
  }

  function togglePanel(side: "left" | "right") {
    if (side === "left") setLeftOpen((open) => !open);
    else setRightOpen((open) => !open);
    // Leaflet sizes its canvas once, and the grid columns animate over 220 ms.
    setResizeToken((token) => token + 1);
  }

  /** The drape is the classified map layer, so its switch is remembered separately:
   *  unchecking it once must not uncheck it for every survey. */
  function setLayer(id: "aoi" | "candidates" | "raster", value: boolean) {
    if (id === "raster") {
      setRasterOverride(value);
      return;
    }
    setLayers((current) => ({ ...current, [id]: value }));
  }

  function selectRun(runId: string) {
    setSelectedId(runId);
    setFocusedKey(null);
    // Another survey decides for itself whether it needs the drape.
    setRasterOverride(null);
    setFitToken((token) => token + 1);
  }

  /** Take this survey off the workbench. The workspace keeps every run it has made. */
  function clearBoard() {
    setSelectedId(null);
    setQueuedThisSession(null);
    setFocusedKey(null);
    setFocus(null);
    setProblems([]);
    setRefused(null);
    if (openedJob) {
      const spec = parseJobSpec(openedJob.description);
      setValues({
        ...initialForm(),
        jobId: openedJob.id,
        clientName: openedJob.title,
        address: openedJob.location ?? "",
        categories: [spec?.category ?? getJobCategory(openedJob)],
        ...(spec?.hasGround
          ? {
              latitude: spec.latitude.toFixed(5),
              longitude: spec.longitude.toFixed(5),
              halfDeg: spec.halfDeg,
            }
          : {}),
      });
    } else {
      setValues(initialForm());
    }
    setFitToken((token) => token + 1);
  }

  /**
   * Keep the job's own record of what it covers in step with what is being run.
   *
   * The specification is what the job is priced by, so a job whose record still held
   * the old ground would say one thing and cost another.
   */
  async function recordJobSpecification(): Promise<void> {
    const jobId = values.jobId || openedJob?.id || null;
    if (!jobId) return;

    const spec = jobSpecFrom({
      category: values.categories[0] ?? "water",
      latitude: values.latitude,
      longitude: values.longitude,
      halfDeg: values.halfDeg,
    });
    if (!spec) return;

    const description = serializeJobSpec(spec);
    if (openedJob?.description === description) return;

    try {
      await updateJob(jobId, { description });
      setOpenedJob((prev) => (prev ? { ...prev, description } : prev));
    } catch (err) {
      console.warn("Could not record the job's survey specification:", err);
    }
  }

  async function submit() {
    const checked = validateForm(values);
    setProblems(checked.problems);
    if (!checked.draft) return;

    // The platform refuses a survey the workspace cannot pay for, but a refusal after
    // the click is a worse experience than saying so before it. The balance on screen
    // may be stale, so this is a courtesy, not the rule -- the platform is the rule.
    if (quote && !canAfford(quote, balance)) {
      setRefused(
        `This workspace has ${balance?.toLocaleString()} AI credits and this survey costs ` +
          `${quote.credits}. Buy more credits before running it.`,
      );
      return;
    }

    setQueueing(true);
    setRefused(null);
    try {
      await recordJobSpecification();
      const outcome = await startSurvey({
        ...checked.draft,
        workspaceId,
        jobId: values.jobId || openedJob?.id || null,
        projectId: values.jobId || openedJob?.id || null,
      });
      adopt(outcome.run);
      selectRun(outcome.run.id);
      setQueuedThisSession(outcome.run.id);
      setCharged({ credits: outcome.creditsCharged, remaining: outcome.remainingBalance });
      if (outcome.remainingBalance !== null) setBalance(outcome.remainingBalance);
    } catch (err) {
      setRefused(
        err instanceof InsufficientCreditsError
          ? err.message
          : err instanceof Error
            ? err.message
            : "The platform refused the survey.",
      );
    } finally {
      setQueueing(false);
      void refresh();
    }
  }

  async function cancel(runId: string) {
    setCancelling(runId);
    setRefused(null);
    try {
      await cancelSurveyRun(runId);
    } catch (err) {
      setRefused(
        err instanceof Error
          ? `${err.message} A worker may already have picked the survey up.`
          : "The survey could not be cancelled.",
      );
    } finally {
      setCancelling(null);
      void refresh();
    }
  }

  const outOfCredits = refused !== null && refused.includes("AI credits");

  // The EO UI must NEVER open unless a job is opened!
  const isJobOpened = Boolean(openedJob && values.jobId);

  if (!isJobOpened && !running) {
    return (
      <DashboardShell className="w-full max-w-none">
        <EarthObservationSetupForm
          workspaceId={workspaceId}
          values={values}
          onChange={patch}
          jobs={jobs}
          jobsLoading={jobsLoading}
          openedJob={openedJob}
          onSelectJob={(job) => {
            applyAndOpenJob(job);
          }}
          onProceedToWorkbench={(job) => {
            applyAndOpenJob(job);
          }}
          onLaunchSurvey={(job) => {
            applyAndOpenJob(job);
            void submit();
          }}
          onRefreshJobs={fetchJobs}
          busy={running !== null}
          queueing={queueing}
          quote={quote}
          quoteLoading={quoteLoading}
          balance={balance}
          onNavigateBilling={() => onNavigate?.("billing")}
          onNavigate={onNavigate}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      className={cn(
        "w-full transition-all duration-200",
        isFullscreen
          ? "max-w-none h-full min-h-0 gap-1.5 sm:gap-2 overflow-hidden p-2 sm:p-3"
          : "max-w-[1780px] gap-4 sm:gap-5"
      )}
    >
      <DashboardHeader
        title="Earth Observation"
        description={
          isFullscreen
            ? undefined
            : "Screen a coordinate for groundwater, minerals, soil capability and site safety using multi-spectral Earth Observation."
        }
        meta={
          openedJob
            ? `Job: ${openedJob.title}${openedJob.location ? ` · ${openedJob.location}` : ""}`
            : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-1.5 text-xs font-medium transition-colors",
                isFullscreen && "bg-primary/10 border-primary/40 text-primary"
              )}
              onClick={toggleFullscreen}
              title={
                isFullscreen
                  ? "Exit Fill Dashboard (show sidebar and navigation)"
                  : "Fill dashboard with Earth Observation UI"
              }
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>Exit Full View</span>
                </>
              ) : (
                <>
                  <Maximize2 className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>Fill Dashboard</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
              onClick={handleExitProject}
              title="Exit current project and return to job selection"
            >
              <LogOut className="size-3.5 shrink-0" aria-hidden="true" />
              <span>Exit Project</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium"
              onClick={handleExitProject}
              title="Switch to another job"
            >
              <Briefcase className="size-3.5 text-primary" aria-hidden="true" />
              <span className="hidden sm:inline">Switch Job</span>
            </Button>
          </div>
        }
      />

      <WorkbenchBar
        onRun={() => void submit()}
        running={queueing || running !== null}
        onResetView={() => setFitToken((token) => token + 1)}
        onReload={() => void refresh()}
        onClear={clearBoard}
        onExportView={() => setExportModalOpen(true)}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => togglePanel("left")}
        onToggleRight={() => togglePanel("right")}
        pill={pill}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onExitProject={handleExitProject}
      />

      {listError ? (
        <ErrorNotice tone="warning" title="The survey queue could not be read">
          {listError}
        </ErrorNotice>
      ) : null}

      {refused ? (
        <ErrorNotice
          tone={outOfCredits ? "warning" : "danger"}
          title={outOfCredits ? "This workspace is out of credits" : "The survey was refused"}
          action={
            outOfCredits ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onNavigate?.("billing")}
              >
                Open Billing
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRefused(null)}
              >
                Dismiss
              </Button>
            )
          }
        >
          {refused}
        </ErrorNotice>
      ) : null}

      {charged ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/35 bg-primary/8 px-3 py-2 text-xs"
        >
          <Coins className="size-3.5 text-primary" aria-hidden="true" />
          <span className="text-foreground">
            {charged.credits.toLocaleString()} credit{charged.credits === 1 ? "" : "s"} charged
            for this survey
          </span>
          {charged.remaining !== null ? (
            <span className="text-muted-foreground">
              · {charged.remaining.toLocaleString()} remaining
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "sw-workspace gap-3",
          isFullscreen && "sw-workspace--fullscreen flex-1 min-h-0"
        )}
        data-left={leftOpen ? undefined : "collapsed"}
        data-right={rightOpen ? undefined : "collapsed"}
      >
        <ContentsPanel
          layers={{ ...layers, raster: rasterOn }}
          onLayer={setLayer}
          rasterOpacity={rasterOpacity}
          onRasterOpacityChange={setRasterOpacity}
          hasRaster={hasRaster}
          basemap={basemap}
          onBasemap={setBasemap}
          snapshot={snapshot}
          runs={runs}
          selectedId={selected?.id ?? null}
          loading={!loaded}
          onSelect={selectRun}
          cancelling={cancelling}
          onCancel={(runId) => void cancel(runId)}
          onCollapse={() => togglePanel("left")}
          jobs={jobs}
          currentJob={openedJob}
          onSelectJob={(job) => applyAndOpenJob(job)}
          onOpenJobSetup={handleExitProject}
          onDeleteJob={handleDeleteJob}
          onRenameJob={handleRenameJob}
          activeDossierCategory={jobDossierCategory}
        />

        <section className="sw-map-shell sw-map" aria-label="Map canvas">
          {!leftOpen ? (
            <button
              type="button"
              className="sw-tab sw-tab--left"
              onClick={() => togglePanel("left")}
              title="Show Contents"
            >
              <span aria-hidden="true">›</span>
              <span>Contents</span>
            </button>
          ) : null}
          {!rightOpen ? (
            <button
              type="button"
              className="sw-tab sw-tab--right"
              onClick={() => togglePanel("right")}
              title="Show Analysis"
            >
              <span>Analysis</span>
              <span aria-hidden="true">‹</span>
            </button>
          ) : null}

          <SurveyMap
            target={target}
            bounds={aoiBounds(target.latitude, target.longitude, values.halfDeg)}
            candidates={candidates}
            layers={{ ...layers, raster: rasterOn }}
            classifiedImageUrl={rasterUrl}
            classifiedTiffUrl={geoTiffUrl}
            rasterPalette={CATEGORY_RASTER_PALETTE[jobDossierCategory]}
            classifiedOpacity={rasterOpacity}
            basemap={basemap}
            outside={outside}
            showHint={false}
            crs={detail?.run.result?.target?.crs ?? null}
            imagery={imagery}
            fitToken={fitToken}
            resizeToken={resizeToken}
            focus={focus}
            onView={(info) => {
              setView(info);
              setMapViewInfo(info);
            }}
            onMapReady={setMapInstance}
            onOpenExportView={() => setExportModalOpen(true)}
          />
        </section>

        <div className="sw-panel sw-panel--right" aria-label="Analysis">
          <div className="sw-panel__header">
            <span className="sw-panel__title">Analysis</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto size-7"
              aria-expanded="true"
              onClick={() => togglePanel("right")}
              title="Collapse analysis"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              <span className="sr-only">Collapse analysis</span>
            </Button>
          </div>

          <div className="sw-panel__body flex-1">
            <TargetForm
              workspaceId={workspaceId}
              values={values}
              onChange={patch}
              onOpenSetup={handleExitProject}
              queueing={queueing}
              busy={running !== null}
              stage={running?.stage ?? null}
              progress={running ? running.progress : null}
              elapsed={elapsed}
              problems={problems}
              refused={!outOfCredits ? refused : null}
              onSubmit={() => void submit()}
              quote={quote}
              quoteLoading={quoteLoading}
              balance={balance}
              onNavigateBilling={() => onNavigate?.("billing")}
            />

            {detailError ? (
              <ErrorNotice tone="danger" title="This result could not be loaded">
                {detailError}
              </ErrorNotice>
            ) : null}

            <IndicatorsPanel
              scores={detail?.run.result?.scores ?? []}
              note={resultsNote(selected, queuedThisSession)}
              activeDossierCategory={jobDossierCategory}
            />
            <CandidateTable
              rows={rows}
              selectedKey={focusedKey}
              onFocus={focusCandidate}
              activeDossierCategory={jobDossierCategory}
            />
            <ExportsPanel
              surveyed={selected !== null && !selected.active}
              onOpenExportPdf={() => setExportModalOpen(true)}
            />
          </div>
        </div>
      </div>

      <StatusStrip
        view={view}
        crs={detail?.run.result?.target?.crs ?? "No survey scored yet"}
        job={jobText(running ?? selected, queueing)}
        basis={snapshot.basis}
      />

      <MapExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        map={mapInstance}
        target={target}
        viewInfo={mapViewInfo}
        categoryName={jobCategory.toUpperCase()}
        clientName={values.clientName}
        aoiBounds={aoiBounds(target.latitude, target.longitude, values.halfDeg)}
        candidates={exportCandidates}
        targetDepthLabel={exportTargetDepthLabel}
        legendItems={exportLegendItems}
        legendTitle={exportLegendTitle}
        opticalSource={opticalSource ?? undefined}
        basemap={{
          tileUrlTemplate: exportBasemap.url,
          attribution: exportBasemap.attribution,
          maxNativeZoom: exportBasemap.maxNativeZoom ?? 19,
        }}
      />
    </DashboardShell>
  );
}
