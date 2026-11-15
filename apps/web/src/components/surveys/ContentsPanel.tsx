import { useState } from "react";
import { Briefcase, ChevronLeft, Loader, LogOut, Pencil, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { BlockTitle } from "./BlockTitle.tsx";

import type { SurveyProvenance, SurveyRun } from "../../lib/repositories/satelliteSurveys.ts";
import type { JobWithProject } from "../../lib/repositories/jobs.ts";
import type { ContentsTab } from "./WorkbenchBar.tsx";
import { SurveyStatusChip } from "../../components/surveys/SurveyStatusChip.tsx";
import { coordText, type DossierCategory, CATEGORY_LEGEND_CODES, CATEGORY_RASTER_PALETTE, CATEGORY_ZONE_LABELS } from "../../lib/surveys/labels.ts";
import { coverageRows, type CoverageRow } from "../../lib/surveys/sources.ts";
import {
  BAND_RANGES,
  BASEMAPS,
  CATEGORY_COLORS,
  CATEGORY_MARKS,
  DOSSIER_ORDER,
} from "../../lib/surveys/workbench.ts";

export interface SurveySnapshot {
  target: string;
  crs: string;
  grid: string;
  /** Which survey the numbers on this screen came from, in the reader's terms. */
  source: string;
  basis: string;
}

const PANE_TABS: { id: ContentsTab; label: string }[] = [
  { id: "layers", label: "Layers" },
  { id: "data", label: "Data" },
  { id: "surveys", label: "Surveys" },
];

interface ContentsPanelProps {
  tab: ContentsTab;
  onTab: (tab: ContentsTab) => void;
  /** What the run recorded it read. Null until a survey has published a result. */
  provenance: SurveyProvenance | null;
  layers: { aoi: boolean; candidates: boolean; raster?: boolean };
  onLayer: (id: "aoi" | "candidates" | "raster", value: boolean) => void;
  rasterOpacity?: number;
  onRasterOpacityChange?: (opacity: number) => void;
  hasRaster?: boolean;
  basemap: string;
  onBasemap: (id: string) => void;
  snapshot: SurveySnapshot;
  runs: SurveyRun[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (runId: string) => void;
  /** The id whose withdraw call is in flight, so one click cannot queue a refund twice. */
  cancelling: string | null;
  onCancel: (runId: string) => void;
  onCollapse: () => void;
  // Recent jobs support
  jobs?: JobWithProject[];
  currentJob?: JobWithProject | null;
  onSelectJob?: (job: JobWithProject) => void;
  onOpenJobSetup?: () => void;
  onDeleteJob?: (jobId: string) => Promise<void>;
  onRenameJob?: (jobId: string, title: string) => Promise<void>;
  activeDossierCategory?: DossierCategory;
}

/** What is on the map, what it is drawn over, and which survey the numbers came from. */
export default function ContentsPanel({
  tab,
  onTab,
  provenance,
  layers,
  onLayer,
  rasterOpacity,
  onRasterOpacityChange,
  hasRaster,
  basemap,
  onBasemap,
  snapshot,
  runs,
  selectedId,
  loading,
  onSelect,
  cancelling,
  onCancel,
  onCollapse,
  jobs,
  currentJob,
  onSelectJob,
  onOpenJobSetup,
  onDeleteJob,
  onRenameJob,
  activeDossierCategory,
}: ContentsPanelProps) {
  const legendCategories = activeDossierCategory ? [activeDossierCategory] : DOSSIER_ORDER;
  const rasterCategory = activeDossierCategory ?? "water";
  const rasterPalette = CATEGORY_RASTER_PALETTE[rasterCategory];
  const rasterLegend = CATEGORY_LEGEND_CODES[rasterCategory].map((code) => ({
    code,
    label: CATEGORY_ZONE_LABELS[rasterCategory][code],
  }));

  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  function commitRename() {
    const jobId = editingJobId;
    setEditingJobId(null);
    if (!jobId || !onRenameJob) return;
    const title = draftTitle.trim();
    if (!title) return;
    void onRenameJob(jobId, title);
  }

  return (
    <div className="sw-panel sw-panel--left" aria-label="Map contents">
      <div className="sw-panel__header">
        <span className="sw-panel__title">Contents</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-7"
          aria-expanded="true"
          onClick={onCollapse}
          title="Collapse contents"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          <span className="sr-only">Collapse contents</span>
        </Button>
      </div>

      <div className="sw-pane-tabs" role="tablist" aria-label="Contents sections">
        {PANE_TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => onTab(entry.id)}
            className="sw-pane-tab"
            data-active={tab === entry.id}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="sw-panel__body flex-1">
        {tab === "layers" ? (
          <>
        <section className="sw-block px-3.5 py-3">
          <BlockTitle>Layers</BlockTitle>
          <ul className="mt-1 list-none p-0">
            <li>
              <label className="sw-layer">
                <input
                  type="checkbox"
                  checked={layers.aoi}
                  onChange={(event) => onLayer("aoi", event.target.checked)}
                />
                <span className="sw-swatch sw-swatch--aoi" aria-hidden="true" />
                Survey extent (AOI)
              </label>
            </li>
            <li>
              <label className="sw-layer">
                <input
                  type="checkbox"
                  checked={layers.candidates}
                  onChange={(event) => onLayer("candidates", event.target.checked)}
                />
                <span
                  className="sw-swatch"
                  style={{ background: CATEGORY_COLORS[activeDossierCategory ?? "water"] }}
                  aria-hidden="true"
                />
                Candidate sites
              </label>
            </li>
            {hasRaster ? (
              <li>
                <label className="sw-layer">
                  <input
                    type="checkbox"
                    checked={layers.raster !== false}
                    onChange={(event) => onLayer("raster", event.target.checked)}
                  />
                  <span
                    className="sw-swatch"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(45deg, #6b7280 0 4px, #9ca3af 4px 8px)",
                    }}
                    aria-hidden="true"
                  />
                  Classified raster (drape)
                </label>
              </li>
            ) : null}
            {layers.raster !== false && onRasterOpacityChange ? (
              <li>
                <div className="ml-6 flex items-center gap-2 pr-2 pt-1.5">
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={rasterOpacity ?? 0.65}
                    onChange={(e) => onRasterOpacityChange(parseFloat(e.target.value))}
                    className="h-1.5 w-full accent-primary cursor-pointer"
                    title="Adjust classification transparency"
                  />
                  <span className="font-mono text-[11px] sm:text-[10px] text-muted-foreground w-7 shrink-0 text-right">
                    {Math.round((rasterOpacity ?? 0.65) * 100)}%
                  </span>
                </div>
              </li>
            ) : null}
          </ul>
        </section>

        <section className="sw-block px-3.5 py-3">
          <BlockTitle>Basemap</BlockTitle>
          <ul className="mt-1 list-none p-0">
            {BASEMAPS.map((base) => (
              <li key={base.id}>
                <label className="sw-layer">
                  <input
                    type="radio"
                    name="survey-basemap"
                    checked={basemap === base.id}
                    onChange={() => onBasemap(base.id)}
                  />
                  <span className="sw-swatch" style={{ background: base.swatch }} aria-hidden="true" />
                  {base.label}
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="sw-block px-3.5 py-3">
          <BlockTitle>Legend</BlockTitle>
          <ul className="mt-1 list-none p-0">
            {legendCategories.map((category) => (
              <li key={category}>
                <span className="sw-layer">
                  <span
                    className="sw-swatch !rounded-full"
                    style={{ background: CATEGORY_COLORS[category] }}
                    aria-hidden="true"
                  />
                  {CATEGORY_MARKS[category].legend}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {BAND_RANGES.map((entry) => (
              <span key={entry.band} className={`sw-legend-band sw-band--${entry.band}`}>
                {entry.text}
              </span>
            ))}
          </div>

          {hasRaster && layers.raster !== false ? (
            <div className="mt-3 border-t border-border pt-2">
              <span className="text-[11px] sm:text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground block mb-1.5">
                {rasterCategory === "hazard_safety"
                  ? "Classified Risk"
                  : rasterCategory === "minerals"
                    ? "Dominant mineral system"
                    : "Classified Potential"}
              </span>
              <div className="space-y-1 text-[12px] sm:text-[11px]">
                {rasterLegend.map((entry) => (
                  <div key={entry.code} className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full shrink-0"
                      style={{ background: rasterPalette[entry.code] }}
                    />
                    <span>{entry.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="sw-block px-3.5 py-3">
          <BlockTitle>Survey snapshot</BlockTitle>
          <dl className="sw-kv mt-1.5 grid gap-1.5">
            <SnapshotRow label="Target" value={snapshot.target} />
            <SnapshotRow label="CRS" value={snapshot.crs} />
            <SnapshotRow label="Grid" value={snapshot.grid} />
            <SnapshotRow label="Source" value={snapshot.source} />
            <SnapshotRow label="Basis" value={snapshot.basis} />
          </dl>
        </section>
          </>
        ) : null}

        {tab === "data" ? <DataBrowser provenance={provenance} /> : null}

        {tab === "surveys" ? (
        <section className="sw-block px-3.5 py-3">
          <div className="flex items-center justify-between">
            <BlockTitle count={jobs ? jobs.length : runs.length}>
              {jobs ? "Surveys in this project" : "Surveys here"}
            </BlockTitle>
            {onOpenJobSetup ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 sm:h-6 px-1.5 text-[12px] sm:text-[11px] text-muted-foreground hover:text-destructive gap-1"
                onClick={onOpenJobSetup}
                title="Back to this project's Earth Observation"
              >
                <LogOut className="size-3 shrink-0" />
                <span>Back to project</span>
              </Button>
            ) : null}
          </div>

          {jobs ? (
            jobs.length === 0 ? (
              <p className="mt-1.5 text-[12.5px] sm:text-[11.5px] leading-snug text-muted-foreground">
                No survey has run in this project yet.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {jobs.map((job) => {
                  const isCurrent = job.id === currentJob?.id;
                  const isEditing = editingJobId === job.id;
                  return (
                    <li key={job.id} className="flex items-center gap-1 group">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") setEditingJobId(null);
                          }}
                          aria-label="Survey name"
                          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-[13px] sm:text-[12px] font-medium text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectJob?.(job)}
                          aria-current={isCurrent ? "true" : undefined}
                          className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            isCurrent ? "bg-accent/80 font-medium ring-1 ring-primary/40" : ""
                          }`}
                        >
                          <Briefcase className="size-3.5 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] sm:text-[12px] font-medium text-foreground">
                              {job.title}
                            </span>
                            <span className="sw-mono block truncate text-[11.5px] sm:text-[10.5px] text-muted-foreground">
                              {job.location ?? "No location specified"}
                            </span>
                          </span>
                          <span className="text-[11px] sm:text-[10px] uppercase font-semibold text-muted-foreground shrink-0">
                            {job.status}
                          </span>
                        </button>
                      )}
                      {isEditing ? null : (
                        <>
                          {onRenameJob ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7 sm:size-6 shrink-0 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                              title="Rename survey"
                              onClick={() => {
                                setEditingJobId(job.id);
                                setDraftTitle(job.title);
                              }}
                            >
                              <Pencil className="size-3" />
                            </Button>
                          ) : null}
                          {onDeleteJob ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-7 sm:size-6 shrink-0 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-opacity"
                              title="Delete survey"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`Delete survey "${job.title}"?`)) {
                                  void onDeleteJob(job.id);
                                }
                              }}
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          ) : null}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )
          ) : loading ? (
            <div className="mt-2 space-y-1.5">
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ) : runs.length === 0 ? (
            <p className="mt-1.5 text-[12.5px] sm:text-[11.5px] leading-snug text-muted-foreground">
              No survey has run in this workspace yet.
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {runs.map((run) => (
                <li key={run.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSelect(run.id)}
                    aria-current={run.id === selectedId ? "true" : undefined}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      run.id === selectedId ? "bg-accent/70" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] sm:text-[12px] font-medium">{run.clientName}</span>
                      <span className="sw-mono block truncate text-[11.5px] sm:text-[10.5px] text-muted-foreground">
                        {coordText(run.latitude)}, {coordText(run.longitude)}
                      </span>
                    </span>
                    <SurveyStatusChip status={run.status} />
                  </button>
                  {run.status === "queued" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      disabled={cancelling !== null}
                      onClick={() => onCancel(run.id)}
                      title="Withdraw this survey before a worker starts"
                    >
                      {cancelling === run.id ? (
                        <Loader className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Undo2 className="size-3.5" aria-hidden="true" />
                      )}
                      <span className="sr-only">Withdraw {run.clientName}</span>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        ) : null}
      </div>
    </div>
  );
}

/** The data browser: the coverages this run read, as it recorded them. */
function DataBrowser({ provenance }: { provenance: SurveyProvenance | null }) {
  const rows = coverageRows(provenance);

  if (rows.length === 0) {
    return (
      <section className="sw-block px-3.5 py-3">
        <BlockTitle>EO coverages</BlockTitle>
        <p className="mt-1.5 text-[12.5px] sm:text-[11.5px] leading-snug text-muted-foreground">
          No survey has recorded its inputs yet. Run one and every coverage it read appears
          here, named by the worker rather than by the form.
        </p>
      </section>
    );
  }

  return (
    <>
      <CoverageGroup title="Chosen for this run" rows={rows.filter((row) => row.chosen)} />
      <CoverageGroup title="Pinned by the engine" rows={rows.filter((row) => !row.chosen)} />
    </>
  );
}

function CoverageGroup({ title, rows }: { title: string; rows: CoverageRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="sw-block px-3.5 py-3">
      <BlockTitle count={rows.length}>{title}</BlockTitle>
      <ul className="mt-1.5 list-none space-y-1.5 p-0">
        {rows.map((row) => (
          <li key={row.key} className="border-b border-border/50 pb-1.5 last:border-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12.5px] sm:text-[11.5px] font-medium text-foreground">{row.name}</span>
              {row.coverage ? (
                <span className="sw-mono truncate text-[11px] sm:text-[10px] text-muted-foreground" title={row.coverage}>
                  {row.coverage}
                </span>
              ) : null}
            </div>
            {/* Wrapped, not truncated: a provenance record is the one string on this pane
                a reader must be able to finish reading. */}
            <p className="sw-mono mt-0.5 break-words text-[11.5px] sm:text-[10.5px] leading-snug text-muted-foreground">
              {row.label}
            </p>
            {row.credit ? (
              <p className="mt-0.5 text-[11px] sm:text-[10px] text-muted-foreground/80">{row.credit}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SnapshotRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[62px_minmax(0,1fr)] items-baseline gap-2">
      <dt className="text-[11.5px] sm:text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">{label}</dt>
      <dd className="sw-mono truncate text-[12px] sm:text-[11px]" title={value}>
        {value}
      </dd>
    </div>
  );
}
