import { ChevronLeft, Loader, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { BlockTitle } from "./BlockTitle.tsx";

import type { SurveyRun } from "../../lib/repositories/satelliteSurveys.ts";
import { SurveyStatusChip } from "../../components/surveys/SurveyStatusChip.tsx";
import { coordText } from "../../lib/surveys/labels.ts";
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
  inputs: string;
  basis: string;
}

interface ContentsPanelProps {
  layers: { aoi: boolean; candidates: boolean };
  onLayer: (id: "aoi" | "candidates", value: boolean) => void;
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
}

/** What is on the map, what it is drawn over, and which survey the numbers came from.
 *
 * The engine's contents column, kept item for item. The one addition is the workspace's
 * own survey list: the sandbox only ever held the last survey its process had run, while
 * here every survey the platform has finished is one click away, so the column needs to
 * say which one is on screen.
 */
export default function ContentsPanel({
  layers,
  onLayer,
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
}: ContentsPanelProps) {
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

      <div className="sw-panel__body flex-1">
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
                  style={{ background: CATEGORY_COLORS.water }}
                  aria-hidden="true"
                />
                Candidate sites
              </label>
            </li>
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
            {DOSSIER_ORDER.map((category) => (
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
        </section>

        <section className="sw-block px-3.5 py-3">
          <BlockTitle>Survey snapshot</BlockTitle>
          <dl className="sw-kv mt-1.5 grid gap-1.5">
            <SnapshotRow label="Target" value={snapshot.target} />
            <SnapshotRow label="CRS" value={snapshot.crs} />
            <SnapshotRow label="Grid" value={snapshot.grid} />
            <SnapshotRow label="Source" value={snapshot.source} />
            <SnapshotRow label="Inputs" value={snapshot.inputs} title="Coverages the scores were computed from" />
            <SnapshotRow label="Basis" value={snapshot.basis} />
          </dl>
        </section>

        <section className="sw-block px-3.5 py-3">
          <BlockTitle count={runs.length}>Surveys here</BlockTitle>
          {loading ? (
            <div className="mt-2 space-y-1.5">
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ) : runs.length === 0 ? (
            <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">
              No survey has run in this workspace yet. Anything queued from this screen
              lands here and stays readable after the tab closes.
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
                      <span className="block truncate text-[12px] font-medium">{run.clientName}</span>
                      <span className="sw-mono block truncate text-[10.5px] text-muted-foreground">
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
      </div>
    </div>
  );
}

function SnapshotRow({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="grid grid-cols-[62px_minmax(0,1fr)] items-baseline gap-2">
      <dt className="text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">{label}</dt>
      <dd className="sw-mono truncate text-[11px]" title={title ?? value}>
        {value}
      </dd>
    </div>
  );
}
