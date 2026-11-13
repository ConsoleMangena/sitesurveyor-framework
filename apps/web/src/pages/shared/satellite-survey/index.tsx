import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useProjects } from "../../../lib/hooks/useProjects.ts";
import { ChevronLeft, Coins } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import type { Map as LeafletMap } from "leaflet";

import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  DashboardHeader,
  DashboardShell,
} from "@/components/dashboard/DashboardShell.tsx";
import ErrorNotice from "@/components/errors/ErrorNotice.tsx";

import CandidateTable from "@/components/surveys/CandidateTable.tsx";
import ContentsPanel, { type SurveySnapshot } from "@/components/surveys/ContentsPanel.tsx";
import IndicatorsPanel from "@/components/surveys/IndicatorsPanel.tsx";
import MineralsPanel from "@/components/surveys/MineralsPanel.tsx";
import SurveyMap, { type MapViewInfo } from "@/components/surveys/SurveyMap.tsx";
import MapExportModal from "@/components/surveys/MapExportModal.tsx";
import {
  StatusStrip,
  WorkbenchBar,
  type ContentsTab,
  type MapTool,
  type PublishItem,
  type RibbonTab,
} from "@/components/surveys/WorkbenchBar.tsx";

import {
  InsufficientCreditsError,
  cancelSurveyRun,
  deliverableUrl,
  getSurveyRunDetail,
  startSurvey,
  surveyTilesSource,
  type SurveyDeliverable,
  type SurveyProvenance,
  type SurveyTilesSource,
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
  CATEGORY_LABELS,
  CATEGORY_LEGEND_CODES,
  CATEGORY_LEGEND_TITLES,
  CATEGORY_RASTER_PALETTE,
  CATEGORY_TRANSPARENT_CODES,
  CATEGORY_ZONE_LABELS,
  GRAVITY_EXPORTS,
  SHARED_EXPORTS,
  fromDossierCategory,
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
} from "../../../lib/surveys/sources.ts";
import TargetForm from "./TargetForm.tsx";
import EarthObservationSetupForm from "./EarthObservationSetupForm.tsx";
import { writeAiSurveyContext } from "@/features/ai/surveyHandover.ts";
import {
  initialForm,
  pinTarget,
  fieldTargetText,
  resultsNote,
  sheetSummaryRows,
  sheetSystemTable,
  sourceText,
  validateForm,
  type SurveyFormValues,
} from "./model.ts";

interface SatelliteSurveyPageProps {
  workspaceId: string;
  onNavigate?: (view: string, context?: Record<string, string>) => void;
  onExitFullscreen?: () => void;
  /** Take the app chrome away so the workbench can fill the window, the way a
   *  desktop GIS does. Called once a survey is open on the canvas. */
  onEnterFullscreen?: () => void;
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
export default function SatelliteSurveyPage(props: SatelliteSurveyPageProps) {
  const [params] = useSearchParams();
  return <SurveyWorkbench key={`${props.workspaceId}:${params.get("projectId") ?? ""}:${params.get("jobId") ?? ""}`} {...props} />;
}

function SurveyWorkbench({
  workspaceId,
  onNavigate,
  onExitFullscreen,
  onEnterFullscreen,
  isFullscreen = false,
}: SatelliteSurveyPageProps) {
  const [resizeToken, setResizeToken] = useState(0);

  const [params, setParams] = useSearchParams();
  const jobProjectContext = params.get("projectId");
  const routeJobId = params.get("jobId");
  const selectedId = params.get("runId");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const { runs: workspaceRuns, error: listError, loaded, refresh, adopt } = useSurveyRuns(workspaceId);
  const { projects: workspaceProjects, loading: projectsLoading, error: projectsError, refresh: refreshProjects } = useProjects(workspaceId);
  // Memoized: the project list feeds option lists and the launcher, and the
  // compiler has to preserve the component's manual memoization around it.
  const projects = useMemo(
    () => workspaceProjects.filter((item) => !item.archived_at),
    [workspaceProjects],
  );
  const project = projects.find((item) => item.id === jobProjectContext);
  const [jobs, setJobs] = useState<JobWithProject[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [runLinkError, setRunLinkError] = useState<string | null>(null);
  const [resolvedRunId, setResolvedRunId] = useState<string | null>(null);
  const [openedJob, setOpenedJob] = useState<JobWithProject | null>(null);
  const [values, setValues] = useState<SurveyFormValues>(initialForm);
  const [boardCleared, setBoardCleared] = useState(false);
  /** An unassigned job a deep link or selection asked to open. Attach-first:
   *  it may not enter the workbench until it belongs to a project. */
  const [needsAttachment, setNeedsAttachment] = useState<JobWithProject | null>(null);
  const [attachProjectId, setAttachProjectId] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const scopedJobs = jobs.filter((job) => !job.archived_at && (!jobProjectContext || job.project_id === jobProjectContext));

  function returnToProject() {
    onExitFullscreen?.();
    if (onNavigate && jobProjectContext) {
      onNavigate("projects", { projectId: jobProjectContext, tab: "earthObservation" });
    } else {
      setParams({ view: "projects", ...(jobProjectContext ? { projectId: jobProjectContext } : {}) });
    }
  }

  /** Attach-first for legacy unassigned jobs: file the job under a project,
   *  then open it with full context. The params change re-resolves the job
   *  through fetchJobs, which restores the workbench. */
  const attachAndOpen = useCallback(async () => {
    const job = needsAttachment;
    const projectId = attachProjectId;
    if (!job || !projectId) return;
    setAttaching(true);
    setAttachError(null);
    try {
      await updateJob(job.id, { project_id: projectId });
      setParams({
        view: "satellite",
        projectId,
        jobId: job.id,
        ...(selectedId ? { runId: selectedId } : {}),
      });
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "Could not attach the job to a project.");
    } finally {
      setAttaching(false);
    }
  }, [needsAttachment, attachProjectId, selectedId, setParams]);
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

  function restoreJob(job: JobWithProject) {
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
    // A job that opened clears any attachment prompt from an earlier deep link.
    setNeedsAttachment(null);
    // The new job may classify a different category, and the drape follows the category.
    setRasterOverride(null);
  }

  const fetchJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const rows = await listJobs(workspaceId);
      if (mounted.current) {
        setJobs(rows);
        setJobsError(null);
        const matched = rows.find((job) => job.id === routeJobId && !job.archived_at);
        if (matched && (!jobProjectContext || matched.project_id === jobProjectContext)) {
          if (!matched.project_id) {
            // Attach-first: an unassigned job may not enter the workbench; the
            // deep link lands on the attach prompt instead.
            setNeedsAttachment(matched);
          } else if (!jobProjectContext) {
            setParams((current) => {
              const next = new URLSearchParams(current);
              next.set("projectId", matched.project_id!);
              return next;
            }, { replace: true });
          } else {
            restoreJob(matched);
          }
        } else if (!matched) {
          // The route no longer names a job (or it vanished) — drop any stale
          // attachment prompt.
          setNeedsAttachment(null);
        }
      }
      return rows;
    } catch (err) {
      if (mounted.current) setJobsError(err instanceof Error ? err.message : "Jobs could not be loaded.");
      return [];
    } finally {
      if (mounted.current) setJobsLoading(false);
    }
  }, [workspaceId, routeJobId, jobProjectContext, setParams]);

  const handleDeleteJob = useCallback(async (jobId: string) => {
    try {
      await deleteJob(jobId);
      if (openedJob?.id === jobId) {
        onExitFullscreen?.();
        setParams({ view: "satellite", ...(jobProjectContext ? { projectId: jobProjectContext } : {}) });
      }
      await fetchJobs();
      void refresh();
    } catch (err) {
      console.error("Failed to delete job:", err);
    }
  }, [openedJob, fetchJobs, refresh, onExitFullscreen, setParams, jobProjectContext]);

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
    setParams({ view: "satellite", jobId: job.id, ...(job.project_id ? { projectId: job.project_id } : {}) });
  }

  useEffect(() => {
    // Deferred to a microtask: fetchJobs flags loading synchronously, and
    // doing it inside the effect body would cascade a render mid-commit.
    void Promise.resolve().then(fetchJobs);
  }, [fetchJobs]);

  // The console wants the whole window once a survey is on the canvas; the
  // setup form and the attach prompt stay inside the app's normal frame.
  const consoleOpen = Boolean(openedJob) && !needsAttachment;
  const consoleWasOpen = useRef(consoleOpen);
  useEffect(() => {
    if (consoleWasOpen.current === consoleOpen) return;
    consoleWasOpen.current = consoleOpen;
    if (consoleOpen) onEnterFullscreen?.();
    else onExitFullscreen?.();
  }, [consoleOpen, onEnterFullscreen, onExitFullscreen]);

  useEffect(() => {
    if (!selectedId || jobsLoading || jobsError) return;
    let active = true;
    void getSurveyRunDetail(selectedId).then((detail) => {
      if (!active) return;
      if (!detail) throw new Error("Run unavailable");
      const { run } = detail;
      const job = jobs.find((item) => item.id === run.jobId && !item.archived_at);
      if (run.workspaceId !== workspaceId || !job ||
          (routeJobId && job.id !== routeJobId) ||
          (jobProjectContext && job.project_id !== jobProjectContext)) {
        setRunLinkError("This run does not belong to the selected job and project, or is no longer available.");
        return;
      }
      adopt(run);
      setRunLinkError(null);
      setResolvedRunId(selectedId);
      if (!routeJobId) {
        setParams({ view: "satellite", jobId: job.id, runId: selectedId,
          ...(job.project_id ? { projectId: job.project_id } : {}) }, { replace: true });
      }
    }).catch(() => {
      if (active) setRunLinkError("This survey run could not be opened. It may have been removed or you may not have access.");
    });
    return () => { active = false; };
  }, [selectedId, workspaceId, jobs, jobsLoading, jobsError, routeJobId, jobProjectContext, adopt, setParams]);

  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [mapViewInfo, setMapViewInfo] = useState<MapViewInfo>({ zoom: 13, scale: "—", coords: "—" });
  const [basemap, setBasemap] = useState("satellite");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [view, setView] = useState<MapViewInfo | null>(null);
  const [fitToken, setFitToken] = useState(0);
  const [focus, setFocus] = useState<{
    latitude: number;
    longitude: number;
    token: number;
  } | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [ribbonTab, setRibbonTab] = useState<RibbonTab>("home");
  const [contentsTab, setContentsTab] = useState<ContentsTab>("layers");
  const [mapTool, setMapTool] = useState<MapTool>("pan");
  const [tableOpen, setTableOpen] = useState(false);
  const [measureText, setMeasureText] = useState<string | null>(null);

  const runs = workspaceRuns.filter((run) => run.workspaceId === workspaceId && run.jobId === openedJob?.id);
  const selected = selectedId
    ? runs.find((run) => run.id === selectedId) ?? null
    : boardCleared ? null : runs[0] ?? null;
  const running = runs.find((run) => run.active) ?? null;
  const { detail, error: detailError } = useSurveyDetail(selected);

  /** Hand the survey on screen to the assistant, which forwards the run id to
   *  the agent so "this survey" answers from this run's dossier. */
  function handleAskAi() {
    if (!selected || !onNavigate) return;
    writeAiSurveyContext(sessionStorage, {
      runId: selected.id,
      label: selected.clientName || "Satellite survey",
    });
    onNavigate("assistant");
  }

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

  const overlayDeliverable = useMemo(() => {
    const kinds = CATEGORY_EXPORTS[jobDossierCategory];
    return (detail?.deliverables ?? []).find((d) => d.kind === kinds.overlay) ?? null;
  }, [detail?.deliverables, jobDossierCategory]);

  const tifDeliverable = useMemo(() => {
    const kinds = CATEGORY_EXPORTS[jobDossierCategory];
    return (detail?.deliverables ?? []).find((d) => d.kind === kinds.tif) ?? null;
  }, [detail?.deliverables, jobDossierCategory]);

  const webTiffDeliverable = useMemo(() => {
    const kinds = CATEGORY_EXPORTS[jobDossierCategory];
    return (detail?.deliverables ?? []).find((d) => d.kind === kinds.webtif) ?? null;
  }, [detail?.deliverables, jobDossierCategory]);

  const tilesDeliverable = useMemo(() => {
    const kinds = CATEGORY_EXPORTS[jobDossierCategory];
    return (detail?.deliverables ?? []).find((d) => d.kind === kinds.tiles) ?? null;
  }, [detail?.deliverables, jobDossierCategory]);

  // The tile archive is not fetched through a signed URL: the PMTiles reader
  // pulls byte slices through the deliverable-range edge function, which
  // re-proves this session's workspace ownership on every request.
  const tilesSource = useMemo(
    () => (tilesDeliverable ? surveyTilesSource(tilesDeliverable) : null),
    [tilesDeliverable],
  );

  // Whether the tile archive worked on-screen. The PDF export drops its own
  // classified-tiles pull when it did not, counting on the same image-drape
  // fallback the live map fell back to.
  const [unavailableTilesSource, setUnavailableTilesSource] = useState<SurveyTilesSource | null>(null);
  const tilesUnavailable = unavailableTilesSource !== null && unavailableTilesSource === tilesSource;
  const handleTilesUnavailable = useCallback(() => setUnavailableTilesSource(tilesSource), [tilesSource]);

  // One stable loader per deliverable: the sheet export caches the archive
  // bytes by this function's identity, so the live preview's repeated builds
  // read the same copy instead of re-minting a link and re-fetching the file.
  const loadTilesArchive = useCallback(async () => {
    if (!tilesDeliverable) {
      throw new Error("This run did not publish a tile archive.");
    }
    const url = await deliverableUrl(tilesDeliverable);
    if (!url) {
      throw new Error("The tile archive link could not be minted.");
    }
    const res = await fetch(url, {
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(30000)
          : undefined,
    });
    if (!res.ok) {
      throw new Error(`The tile archive answered ${res.status}.`);
    }
    return await res.arrayBuffer();
  }, [tilesDeliverable]);

  // Signed deliverable URLs are keyed by the deliverable they were resolved
  // from, so a changed or removed deliverable reads as null without any
  // synchronous state reset in an effect.
  const [rasterUrlEntry, setRasterUrlEntry] = useState<{ deliverable: SurveyDeliverable; url: string | null } | null>(null);
  const rasterUrl = rasterUrlEntry?.deliverable === overlayDeliverable ? rasterUrlEntry.url : null;

  useEffect(() => {
    if (!overlayDeliverable) return;
    let active = true;
    void deliverableUrl(overlayDeliverable).then((url) => {
      if (active) setRasterUrlEntry({ deliverable: overlayDeliverable, url });
    });
    return () => {
      active = false;
    };
  }, [overlayDeliverable]);

  // The worker's north-up copy carries the same colour table on EPSG:4326, so
  // the drape decodes onto its exact lat/lon rectangle when it exists; the
  // UTM-zone original is the fallback for runs published before this change.
  const decodeTiffDeliverable = webTiffDeliverable ?? tifDeliverable;

  const [geoTiffUrlEntry, setGeoTiffUrlEntry] = useState<{ deliverable: SurveyDeliverable; url: string | null } | null>(null);
  const geoTiffUrl = geoTiffUrlEntry?.deliverable === decodeTiffDeliverable ? geoTiffUrlEntry.url : null;

  useEffect(() => {
    if (!decodeTiffDeliverable) return;
    let active = true;
    void deliverableUrl(decodeTiffDeliverable).then((url) => {
      if (active) setGeoTiffUrlEntry({ deliverable: decodeTiffDeliverable, url });
    });
    return () => {
      active = false;
    };
  }, [decodeTiffDeliverable]);

  const hasRaster = Boolean(overlayDeliverable || tifDeliverable);
  const rasterOn = rasterOverride ?? hasRaster;

  // One stable AOI rectangle for the session: SurveyMap re-renders on every map
  // move, and a fresh bounds array would reposition the classified drape and
  // churn the map children each time.
  const surveyBounds = useMemo(
    () => aoiBounds(target.latitude, target.longitude, values.halfDeg),
    [target.latitude, target.longitude, values.halfDeg],
  );

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
            kind: row.kind,
            rank: row.rank,
            readout: row.readout ?? undefined,
            distanceKm: row.distanceKm,
            score: row.score,
          }))
        : [],
    [layers.candidates, rows],
  );

  const targetDepth = detail?.run.result?.waterDepth ?? null;
  const exportTargetDepthLabel = targetDepth
    ? `Water table ~${metricRange(targetDepth.wetM, targetDepth.dryM) ?? targetDepth.read ?? "?"}`
    : undefined;

  const exportSystemTable = useMemo(
    () => sheetSystemTable(detail?.run.result ?? null),
    [detail],
  );

  const exportSummaryRows = useMemo(
    () => sheetSummaryRows(jobDossierCategory, detail?.run.result ?? null, rows),
    [jobDossierCategory, detail?.run.result, rows],
  );

  // The worker's own line for the best target: a drilling depth, a cover thickness or
  // the hazard class. Water states its water table instead, which the reticle carries.
  const exportFieldTargetLabel = useMemo(() => {
    if (jobDossierCategory === "water") return undefined;
    return fieldTargetText(rows) || undefined;
  }, [jobDossierCategory, rows]);

  const exportLegendItems = useMemo(
    () => [
      ...(rasterOn
        ? CATEGORY_LEGEND_CODES[jobDossierCategory].map((code) => {
            const label =
              CATEGORY_ZONE_LABELS[jobDossierCategory][code] ?? `Zone ${code}`;
            return {
              kind: "zone" as const,
              color: CATEGORY_RASTER_PALETTE[jobDossierCategory][code],
              label,
            };
          })
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
  const exportLegendTitle = rasterOn ? CATEGORY_LEGEND_TITLES[jobDossierCategory] : "Map Symbols";
  const exportBasemap = basemapById(basemap);

  /** The files a survey of this category publishes. A disabled button says the run did
   *  not write that one; a button that is simply absent says nothing at all. */
  const downloads = useMemo<PublishItem[]>(() => {
    const kinds = CATEGORY_EXPORTS[jobDossierCategory];
    const available = new Set((detail?.deliverables ?? []).map((file) => file.kind));
    const files = [
      { kind: kinds.kmz, label: "KMZ" },
      { kind: kinds.geojson, label: "GeoJSON" },
      { kind: kinds.tif, label: "GeoTIFF" },
      { kind: SHARED_EXPORTS.dossier, label: "Dossier JSON" },
      ...(jobDossierCategory === "minerals"
        ? [
            { kind: SHARED_EXPORTS.commoditiesCsv, label: "Commodity CSV" },
            { kind: GRAVITY_EXPORTS.zonesTif, label: "Gravity Zones GeoTIFF" },
            { kind: GRAVITY_EXPORTS.residualTif, label: "Gravity Residual GeoTIFF" },
          ]
        : []),
    ];
    return files.map((file) => ({ ...file, available: available.has(file.kind) }));
  }, [detail?.deliverables, jobDossierCategory]);

  const handleDownload = useCallback(
    async (kind: string) => {
      const file = (detail?.deliverables ?? []).find((entry) => entry.kind === kind);
      if (!file) return;
      const url = await deliverableUrl(file);
      if (url) window.open(url, "_blank", "noreferrer");
    },
    [detail?.deliverables],
  );

  const snapshot: SurveySnapshot = {
    target: dmsText(target.latitude, target.longitude),
    crs: detail?.run.result?.target?.crs ?? "—",
    grid: gridText(detail?.run.result?.target?.cellM),
    source: sourceText(selected, queuedThisSession),
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

  /** The ribbon can send the reader to a pane tab; a folded pane has to unfold to show it. */
  const openContents = useCallback(
    (next: ContentsTab) => {
      setContentsTab(next);
      if (!leftOpen) {
        setLeftOpen(true);
        setResizeToken((token) => token + 1);
      }
    },
    [leftOpen],
  );

  function toggleTable() {
    setTableOpen((open) => !open);
    // The dock takes a row off the canvas, so Leaflet has to measure itself again.
    setResizeToken((token) => token + 1);
  }

  /** Placing the pin writes the same fields the form does, to the same five decimals. */
  const handleMoveTarget = useCallback((latitude: number, longitude: number) => {
    setValues((current) => ({
      ...current,
      latitude: latitude.toFixed(5),
      longitude: longitude.toFixed(5),
    }));
  }, []);

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
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("runId", runId);
      return next;
    });
    setBoardCleared(false);
    setFocusedKey(null);
    // Another survey decides for itself whether it needs the drape.
    setRasterOverride(null);
    setFitToken((token) => token + 1);
  }

  /** Take this survey off the workbench. The workspace keeps every run it has made. */
  function clearBoard() {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("runId");
      return next;
    });
    setBoardCleared(true);
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
    if (!openedJob || openedJob.id !== routeJobId || queueing || running) return;
    const checked = validateForm(values);
    setProblems(checked.problems);
    if (!checked.draft) return;

    // The platform refuses a survey the workspace cannot pay for, but a refusal after
    // the click is a worse experience than saying so before it. The balance on screen
    // may be stale, so this is a courtesy, not the rule -- the platform is the rule.
    if (quote && !canAfford(quote, balance)) {
      setRefused(
        `This workspace has ${balance?.toLocaleString()} SiteSurveyor credits and this survey costs ` +
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
        jobId: openedJob.id,
        projectId: openedJob.project_id,
      });
      if (!mounted.current) return;
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

  // Any refusal that mentions credits is a credits refusal, whatever wording
  // the server or database used for the pool's name.
  const outOfCredits = refused !== null && /credits/i.test(refused);

  const contextError = jobsError || projectsError ||
    (!projectsLoading && jobProjectContext && !project ? "This project is unavailable in this workspace." : null) ||
    (!jobsLoading && routeJobId && !jobs.some((job) => job.id === routeJobId && !job.archived_at &&
      (!jobProjectContext || job.project_id === jobProjectContext)) ? "This survey is unavailable in the selected project or workspace." : null) ||
    (selectedId ? runLinkError : null);

  if (contextError) {
    return (
      <DashboardShell>
        <DashboardHeader title="Earth Observation" />
        <ErrorNotice title="Unable to open Earth Observation" tone="danger" action={
          <Button variant="outline" onClick={() => { void fetchJobs(); void refreshProjects(); }}>Retry</Button>
        }>{contextError}</ErrorNotice>
        <Button variant="outline" onClick={returnToProject}>Back to project surveys</Button>
        <Button variant="ghost" onClick={() => {
          if (onNavigate) onNavigate("projects");
          else setParams({ view: "projects" });
        }}>Projects</Button>
      </DashboardShell>
    );
  }

  if (jobsLoading || projectsLoading || (routeJobId && !openedJob && !needsAttachment) ||
      (selectedId && resolvedRunId !== selectedId)) {
    return <DashboardShell><p role="status">Opening Earth Observation…</p></DashboardShell>;
  }

  if (needsAttachment && !openedJob) {
    return (
      <DashboardShell className="w-full max-w-2xl">
        <DashboardHeader title="Earth Observation" />
        <ErrorNotice title="Attach this survey to a project" tone="warning">
          "{needsAttachment.title}" is not attached to a project. Earth Observation surveys live
          inside projects — choose one and the survey and its runs move there.
        </ErrorNotice>
        {projects.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="eo-attach-project">Project</Label>
            <select
              id="eo-attach-project"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
              value={attachProjectId}
              disabled={attaching}
              onChange={(event) => setAttachProjectId(event.target.value)}
            >
              <option value="">Choose a project…</option>
              {projects.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            {attachError ? <p className="text-xs text-destructive">{attachError}</p> : null}
            <Button
              className="gap-1.5"
              disabled={!attachProjectId || attaching}
              onClick={() => void attachAndOpen()}
            >
              {attaching ? "Attaching…" : "Attach & open"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">This workspace has no projects yet — create one first.</p>
        )}
        <Button variant="ghost" onClick={() => {
          setNeedsAttachment(null);
          setAttachError(null);
          setParams({ view: "satellite" });
        }}>
          Back to Projects
        </Button>
      </DashboardShell>
    );
  }

  if (!openedJob) {
    return (
      <DashboardShell className="w-full max-w-none">
        <EarthObservationSetupForm
          workspaceId={workspaceId}
          values={values}
          onChange={patch}
          projectName={project?.name}
          onCreateSurvey={applyAndOpenJob}
          projectContextId={jobProjectContext}
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
        "w-full",
        isFullscreen
          ? "max-w-none h-full min-h-0 gap-0 overflow-hidden p-0"
          : "max-w-[1780px] gap-0"
      )}
    >
      <div className={cn("sw-console", !isFullscreen && "sw-console--inset")}>
      <WorkbenchBar
        tab={ribbonTab}
        onTab={setRibbonTab}
        pill={pill}
        onRun={() => void submit()}
        running={queueing || running !== null}
        onReload={() => void refresh()}
        onClear={clearBoard}
        onAskAi={selected && onNavigate ? handleAskAi : undefined}
        process={toDossierCategory(values.categories[0] ?? "water")}
        onProcess={(category) => patch({ categories: [fromDossierCategory(category)] })}
        onOpenContents={openContents}
        onResetView={() => setFitToken((token) => token + 1)}
        mapTool={mapTool}
        onMapTool={setMapTool}
        tableOpen={tableOpen}
        onToggleTable={toggleTable}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => togglePanel("left")}
        onToggleRight={() => togglePanel("right")}
        published={selected !== null && !selected.active}
        onExportPdf={() => setExportModalOpen(true)}
        downloads={downloads}
        onDownload={(kind) => void handleDownload(kind)}
        projectName={project?.name}
        surveyName={openedJob.title}
        onBack={returnToProject}
      />

      {listError || refused || charged ? (
        <div className="flex flex-col gap-1.5 border-b border-border bg-background px-3 py-2">
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
        </div>
      ) : null}

      <div
        className="sw-workspace"
        data-left={leftOpen ? undefined : "collapsed"}
        data-right={rightOpen ? undefined : "collapsed"}
        data-table={tableOpen ? "open" : undefined}
      >
        <ContentsPanel
          tab={contentsTab}
          onTab={setContentsTab}
          provenance={provenance}
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
          jobs={scopedJobs}
          currentJob={openedJob}
          onSelectJob={(job) => applyAndOpenJob(job)}
          onOpenJobSetup={returnToProject}
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
            bounds={surveyBounds}
            candidates={candidates}
            layers={{ ...layers, raster: rasterOn }}
            classifiedImageUrl={rasterUrl}
            classifiedTiffUrl={geoTiffUrl}
            classifiedTilesSource={tilesSource}
            onTilesUnavailable={handleTilesUnavailable}
            rasterPalette={CATEGORY_RASTER_PALETTE[jobDossierCategory]}
            rasterTransparentCodes={CATEGORY_TRANSPARENT_CODES[jobDossierCategory]}
            classifiedOpacity={rasterOpacity}
            basemap={basemap}
            outside={outside}
            crs={detail?.run.result?.target?.crs ?? null}
            imagery={imagery}
            fitToken={fitToken}
            resizeToken={resizeToken}
            focus={focus}
            tool={mapTool}
            onMeasureText={setMeasureText}
            onMoveTarget={handleMoveTarget}
            onView={(info) => {
              setView(info);
              setMapViewInfo(info);
            }}
            onMapReady={setMapInstance}
            onOpenExportView={() => setExportModalOpen(true)}
          />
        </section>

        {tableOpen ? (
          <div className="sw-dock sw-panel" aria-label="Attribute table">
            <CandidateTable
              rows={rows}
              selectedKey={focusedKey}
              onFocus={focusCandidate}
              activeDossierCategory={jobDossierCategory}
              onClose={toggleTable}
            />
          </div>
        ) : null}

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
              currentJob={openedJob}
              values={values}
              onChange={patch}
              onOpenSetup={returnToProject}
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
            <MineralsPanel
              commodities={detail?.run.result?.commodities ?? []}
              unscreenable={detail?.run.result?.unscreenableCommodities ?? []}
            />
            {tableOpen ? null : (
              <CandidateTable
                rows={rows}
                selectedKey={focusedKey}
                onFocus={focusCandidate}
                activeDossierCategory={jobDossierCategory}
              />
            )}
          </div>
        </div>
      </div>

      <StatusStrip
        view={view}
        crs={detail?.run.result?.target?.crs ?? "No survey scored yet"}
        job={jobText(running ?? selected, queueing)}
        basis={snapshot.basis}
        measure={measureText}
      />
      </div>

      <MapExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        map={mapInstance}
        target={target}
        viewInfo={mapViewInfo}
        classifiedTiles={
          tilesDeliverable && rasterOn && !tilesUnavailable
            ? {
                opacity: rasterOpacity,
                // The sheet reads every tile from one copy of the archive: a
                // short-lived link is minted as the export starts, the file is
                // fetched once, and nothing is ranged per tile through the
                // delivery proxy.
                loadArchive: loadTilesArchive,
              }
            : null
        }
        categoryName={CATEGORY_LABELS[jobDossierCategory].sheet}
        clientName={values.clientName}
        projectName={project?.name ?? openedJob?.project_name ?? undefined}
        aoiBounds={surveyBounds}
        candidates={exportCandidates}
        targetDepthLabel={exportTargetDepthLabel}
        fieldTargetLabel={exportFieldTargetLabel}
        summaryRows={exportSummaryRows}
        table={exportSystemTable ?? undefined}
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
