import { useCallback, useEffect, useMemo, useState } from "react";
import { Briefcase, ChevronLeft } from "lucide-react";

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
import { StatusStrip, WorkbenchBar } from "@/components/surveys/WorkbenchBar.tsx";

import {
  InsufficientCreditsError,
  cancelSurveyRun,
  deliverableUrl,
  startSurvey,
  type SurveyProvenance,
} from "../../../lib/repositories/satelliteSurveys.ts";
import { listJobs, deleteJob, type JobWithProject } from "../../../lib/repositories/jobs.ts";
import { useSurveyDetail, useSurveyRuns } from "../../../lib/hooks/useSatelliteSurveys.ts";
import {
  CATEGORY_EXPORTS,
  outsideCoverage,
  parseCoordinate,
  getJobCategory,
  toDossierCategory,
} from "../../../lib/surveys/labels.ts";
import {
  aoiBounds,
  basisText,
  candidateRows,
  dmsText,
  elapsedText,
  gridText,
  jobText,
  mapCandidates,
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
import ClassifiedVectorViewer from "@/components/surveys/ClassifiedVectorViewer.tsx";
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
}: SatelliteSurveyPageProps) {
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
  const [vectorViewerOpen, setVectorViewerOpen] = useState(false);

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
    } catch (err) {
      console.error("Failed to delete job:", err);
    }
  }, [openedJob, fetchJobs]);

  function applyAndOpenJob(job: JobWithProject) {
    const cat = getJobCategory(job);
    const patchValues: Partial<SurveyFormValues> = {
      jobId: job.id,
      clientName: job.title,
      address: job.location ?? "",
      categories: [cat],
    };

    setValues((prev) => ({ ...prev, ...patchValues }));
    setOpenedJob(job);
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

  const [layers, setLayers] = useState({ aoi: true, candidates: true, classifiedImage: true });
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

  const jobCategory = openedJob ? getJobCategory(openedJob) : (values.categories[0] ?? "water");
  const jobDossierCategory = toDossierCategory(jobCategory);

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

  const mapDeliverable = useMemo(() => {
    const kinds = CATEGORY_EXPORTS[jobDossierCategory];
    return (detail?.deliverables ?? []).find((d) => d.kind === kinds.map) ?? null;
  }, [detail?.deliverables, jobDossierCategory]);

  const [classifiedImageUrl, setClassifiedImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!mapDeliverable) {
      setClassifiedImageUrl(null);
      return;
    }
    let cancelled = false;
    void deliverableUrl(mapDeliverable).then((url) => {
      if (!cancelled) setClassifiedImageUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [mapDeliverable]);

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

  function moveTarget(latitude: number, longitude: number) {
    patch({ latitude: latitude.toFixed(5), longitude: longitude.toFixed(5) });
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

  function selectRun(runId: string) {
    setSelectedId(runId);
    setFocusedKey(null);
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
      setValues({
        ...initialForm(),
        jobId: openedJob.id,
        clientName: openedJob.title,
        address: openedJob.location ?? "",
      });
    } else {
      setValues(initialForm());
    }
    setFitToken((token) => token + 1);
  }

  async function submit() {
    const checked = validateForm(values);
    setProblems(checked.problems);
    if (!checked.draft) return;

    setQueueing(true);
    setRefused(null);
    try {
      const outcome = await startSurvey({ ...checked.draft, workspaceId });
      adopt(outcome.run);
      selectRun(outcome.run.id);
      setQueuedThisSession(outcome.run.id);
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
      <DashboardShell>
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
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <DashboardHeader
        title="Earth Observation"
        description="Screen a coordinate for groundwater, minerals, soil capability and site safety using multi-spectral Earth Observation."
        meta={openedJob ? `Job: ${openedJob.title}${openedJob.location ? ` · ${openedJob.location}` : ""}` : undefined}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-medium"
            onClick={() => {
              setOpenedJob(null);
              patch({ jobId: "", clientName: "", address: "" });
            }}
          >
            <Briefcase className="size-3.5 text-primary" />
            Recent Jobs / Switch Job
          </Button>
        }
      />

      <WorkbenchBar
        onRun={() => void submit()}
        running={queueing || running !== null}
        onResetView={() => setFitToken((token) => token + 1)}
        onReload={() => void refresh()}
        onClear={clearBoard}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => togglePanel("left")}
        onToggleRight={() => togglePanel("right")}
        pill={pill}
        onOpenVectorViewer={() => setVectorViewerOpen(true)}
        hasResults={candidates.length > 0}
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

      <div
        className="sw-workspace gap-3"
        data-left={leftOpen ? undefined : "collapsed"}
        data-right={rightOpen ? undefined : "collapsed"}
      >
        <ContentsPanel
          layers={layers}
          onLayer={(id, value) => setLayers((current) => ({ ...current, [id]: value }))}
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
          onOpenJobSetup={() => {
            setOpenedJob(null);
            patch({ jobId: "", clientName: "", address: "" });
          }}
          onDeleteJob={handleDeleteJob}
          activeDossierCategory={jobDossierCategory}
          hasProcessedImage={Boolean(classifiedImageUrl)}
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
            layers={layers}
            basemap={basemap}
            outside={outside}
            showHint={running === null}
            crs={detail?.run.result?.target?.crs ?? null}
            imagery={imagery}
            fitToken={fitToken}
            resizeToken={resizeToken}
            focus={focus}
            onMoveTarget={moveTarget}
            onView={setView}
            onOpenVectorViewer={() => setVectorViewerOpen(true)}
            classifiedImageUrl={classifiedImageUrl}
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
              onOpenSetup={() => {
                setOpenedJob(null);
                patch({ jobId: "", clientName: "", address: "" });
              }}
              queueing={queueing}
              busy={running !== null}
              stage={running?.stage ?? null}
              progress={running ? running.progress : null}
              elapsed={elapsed}
              problems={problems}
              refused={!outOfCredits ? refused : null}
              onSubmit={() => void submit()}
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
              deliverables={detail?.deliverables ?? []}
              surveyed={selected !== null && !selected.active}
              activeDossierCategory={jobDossierCategory}
              onOpenVectorViewer={() => setVectorViewerOpen(true)}
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

      <ClassifiedVectorViewer
        isOpen={vectorViewerOpen}
        onClose={() => setVectorViewerOpen(false)}
        target={target}
        halfDeg={values.halfDeg}
        candidates={candidates}
        activeDossierCategory={jobDossierCategory}
        clientName={openedJob?.title ?? values.clientName}
        crs={detail?.run.result?.target?.crs ?? "WGS 84 / EPSG:4326"}
        deliverables={detail?.deliverables ?? []}
        classifiedImageUrl={classifiedImageUrl}
        onDownloadKmz={kmzDeliverable ? () => void handleDownloadKmz() : undefined}
      />
    </DashboardShell>
  );
}
