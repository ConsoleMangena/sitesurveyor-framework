import { useState } from "react";
import {
  Briefcase,
  ChevronDown,
  ChevronUp,
  Loader,
  LogOut,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";

import type { JobWithProject } from "../../../lib/repositories/jobs.ts";
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
  windowOptions,
  yearOptions,
} from "../../../lib/surveys/sources.ts";
import { canAfford, areaText, type SurveyQuote } from "../../../lib/surveys/pricing.ts";
import CreditCostPanel from "../../../components/surveys/CreditCostPanel.tsx";
import type { SurveyFormValues } from "./model.ts";

const fieldClass =
  "h-8 rounded-md border border-input bg-background px-2.5 text-[12.5px] shadow-xs outline-none focus-visible:ring-[2px] focus-visible:ring-ring/60";
const monoClass = `${fieldClass} font-mono tabular-nums`;
const labelClass =
  "text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground";

interface TargetFormProps {
  currentJob: JobWithProject;
  values: SurveyFormValues;
  onChange: (patch: Partial<SurveyFormValues>) => void;
  onOpenSetup?: () => void;
  /** True while the queue call is in flight, so the same survey cannot be paid for twice. */
  queueing: boolean;
  /** True while a worker holds a survey of this target, running or not. */
  busy: boolean;
  stage: string | null;
  progress: number | null;
  elapsed: string | null;
  problems: string[];
  refused: string | null;
  onSubmit: () => void;
  /** What the platform prices this job at, from its survey type and its ground. */
  quote: SurveyQuote | null;
  quoteLoading: boolean;
  /** The workspace's credit balance, or null when it has not been reported. */
  balance: number | null;
  onNavigateBilling?: () => void;
}

export default function TargetForm({
  currentJob,
  values,
  onChange,
  onOpenSetup,
  queueing,
  busy,
  stage,
  progress,
  elapsed,
  problems,
  refused,
  onSubmit,
  quote,
  quoteLoading,
  balance,
  onNavigateBilling,
}: TargetFormProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const latitude = parseCoordinate(values.latitude);
  const longitude = parseCoordinate(values.longitude);
  const typedBoth = latitude !== null && longitude !== null;
  const note = typedBoth ? coverageNoteFor(latitude, longitude) : "";

  const optical = values.dataSources?.optical ?? OPTICAL_PRODUCTS[0].id;
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

  /** Whether the workspace can pay for the job as it is currently specified. */
  const affordable = canAfford(quote, balance);

  return (
    <form
      className="block px-4 py-4 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-center justify-between pb-1 border-b border-border/60">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Observation Controls
        </span>
        {onOpenSetup ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10.5px] text-muted-foreground hover:text-destructive gap-1"
            onClick={onOpenSetup}
            title="Back to this project's Earth Observation"
          >
            <LogOut className="size-3 shrink-0" />
            <span>Back to project</span>
          </Button>
        ) : null}
      </div>

      {/* ── STEP 1: Current Job ─────────────────────────────────────────── */}
      <section className="rounded-lg border border-border/70 bg-card/60 p-3 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
            1
          </span>
          <span className={labelClass}>Open survey</span>
        </div>

        <div className="mt-2 flex items-center justify-between rounded-md border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-[11.5px]">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Briefcase className="size-3.5 text-primary" />
              <span className="truncate">{currentJob.title}</span>
            </div>
            {currentJob.location ? (
              <p className="truncate text-[10.5px] text-muted-foreground">
                {currentJob.location}
              </p>
            ) : null}
          </div>
          <Badge variant="outline" className="text-[10px] uppercase">
            {currentJob.status}
          </Badge>
        </div>
      </section>

      {/* ── STEP 2: Survey Type / Domain ────────────────────────────────── */}
      <section className="rounded-lg border border-border/70 bg-card/60 p-3 shadow-xs">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
            2
          </span>
          <legend className={labelClass}>Survey Type</legend>
        </div>

        <div
          className="grid grid-cols-1 gap-1.5"
          role="region"
          aria-label="Earth Observation Survey Category"
        >
          {SURVEY_CATEGORY_OPTIONS.filter((opt) => opt.id === activeCategory).map((option) => {
            const meta = CATEGORY_LABELS[option.dossier];
            return (
              <div
                key={option.id}
                className="flex items-start gap-2.5 rounded-md border border-primary/50 bg-primary/10 p-2 text-left shadow-xs ring-1 ring-primary/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-foreground">
                      {meta.short}
                    </span>
                    <Badge variant="default" className="text-[9.5px]">
                      {option.id}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {meta.name}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── STEP 3: Earth Observation Data Inputs ───────────────────────── */}
      <section className="rounded-lg border border-border/70 bg-card/60 p-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
              3
            </span>
            <Label className={labelClass}>Earth Observation Data</Label>
          </div>
          <button
            type="button"
            className="flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80"
            aria-expanded={sourcesOpen}
            onClick={() => setSourcesOpen((open) => !open)}
          >
            <span>{sourcesOpen ? "Hide options" : "Customize"}</span>
            {sourcesOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        </div>

        <div className="mt-1.5 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="text-[10.5px] font-normal">
            {imageryChip(chosen, { year, window: windowId })}
          </Badge>
          <Badge variant="outline" className="text-[10.5px] font-normal">
            {chosen.dem ?? "Copernicus DEM 30m"}
          </Badge>
          <Badge variant="outline" className="text-[10.5px] font-normal">
            ALOS PALSAR Radar SAR
          </Badge>
          <Badge variant="outline" className="text-[10.5px] font-normal">
            Landsat WOfS Water History
          </Badge>
        </div>

        {sourcesOpen ? (
          <div className="mt-3 space-y-2.5 border-t border-border/60 pt-3">
            {DATA_SOURCES.map((field) => (
              <div
                key={field.id}
                className={`space-y-1 ${field.wide ? "" : "grid grid-cols-2 items-end gap-2"}`}
              >
                <Label htmlFor={`src-${field.id}`} className={labelClass}>
                  {field.label}
                </Label>
                <select
                  id={`src-${field.id}`}
                  className={fieldClass}
                  value={chosen[field.id] ?? field.default}
                  disabled={busy}
                  onChange={(event) => setSource(field.id, event.target.value)}
                >
                  {field.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="composite-year" className={labelClass}>
                  Composite Year
                </Label>
                <select
                  id="composite-year"
                  className={monoClass}
                  value={year}
                  disabled={busy}
                  onChange={(event) =>
                    onChange({
                      composite: { year: Number(event.target.value), window: windowId },
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
                <Label htmlFor="composite-window" className={labelClass}>
                  Composite Window
                </Label>
                <select
                  id="composite-window"
                  className={fieldClass}
                  value={windowId}
                  disabled={busy}
                  onChange={(event) =>
                    onChange({ composite: { year, window: event.target.value } })
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
              <p className="text-[11px] text-muted-foreground">{deadWindow.reason}</p>
            ) : null}

            <details className="mt-2 text-[11px]">
              <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                Fixed Calibrated Models
              </summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                {FIXED_SOURCES.map((source) => (
                  <li key={source}>{source}</li>
                ))}
              </ul>
            </details>
          </div>
        ) : null}
      </section>

      {/* ── STEP 4: Site Coordinates & Extent ───────────────────────────── */}
      <section className="rounded-lg border border-border/70 bg-card/60 p-3 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
            4
          </span>
          <Label className={labelClass}>Site Coordinates & Extent</Label>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <Label htmlFor="survey-lat" className={labelClass}>
              Latitude
            </Label>
            <Input
              id="survey-lat"
              className={monoClass}
              type="number"
              step="0.00001"
              min={-90}
              max={90}
              inputMode="decimal"
              value={values.latitude}
              disabled={busy}
              onChange={(event) => onChange({ latitude: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="survey-lon" className={labelClass}>
              Longitude
            </Label>
            <Input
              id="survey-lon"
              className={monoClass}
              type="number"
              step="0.00001"
              min={-180}
              max={180}
              inputMode="decimal"
              value={values.longitude}
              disabled={busy}
              onChange={(event) => onChange({ longitude: event.target.value })}
            />
          </div>
        </div>

        {note ? (
          <p
            role="status"
            aria-live="polite"
            className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2.5 py-2 text-[11.5px] leading-snug text-amber-700 dark:text-amber-400"
          >
            {note}
          </p>
        ) : null}

        <div className="space-y-1">
          <Label htmlFor="survey-extent" className={labelClass}>
            Observation Extent (AOI)
          </Label>
          <select
            id="survey-extent"
            className={`w-full ${fieldClass}`}
            value={values.halfDeg}
            disabled={busy}
            onChange={(event) => onChange({ halfDeg: Number(event.target.value) })}
          >
            {AOI_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
          {quote ? (
            <p className="text-[10.5px] text-muted-foreground">
              Ground covered:{" "}
              <span className="font-medium text-foreground">{areaText(quote)}</span>
            </p>
          ) : null}
        </div>
      </section>

      {/* ── STEP 5: Credit cost ─────────────────────────────────────────── */}
      <CreditCostPanel
        quote={quote}
        loading={quoteLoading}
        balance={balance}
        onNavigateBilling={onNavigateBilling}
      />

      {/* ── Submit Action ────────────────────────────────────────────────── */}
      <Button
        type="submit"
        className="mt-2 h-9 w-full justify-center gap-2 text-[12.5px] font-semibold"
        disabled={queueing || busy || !affordable}
        title={
          affordable
            ? undefined
            : "This workspace does not have enough credits for this survey."
        }
      >
        {queueing || busy ? <Loader className="size-3.5 animate-spin shrink-0" aria-hidden="true" /> : <Sparkles className="size-3.5 shrink-0" />}
        {busy ? (
          "Observation in progress…"
        ) : quote ? (
          <>
            <span>Run Screening</span>
            <span>· {quote.credits} credit{quote.credits === 1 ? "" : "s"}</span>
          </>
        ) : (
          <span>Run Screening</span>
        )}
      </Button>

      {progress !== null ? (
        <>
          <div
            className="sw-progress mt-2"
            role="progressbar"
            aria-label="Survey progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-[11.5px] text-muted-foreground" role="status" aria-live="polite">
            {stage ?? "Processing"}{" "}
            <b className="sw-mono font-semibold text-foreground">
              {progress}%{elapsed ? ` · ${elapsed}` : ""}
            </b>
          </p>
        </>
      ) : null}

      {problems.length || refused ? (
        <div role="alert" className="mt-2 rounded-md border border-destructive/40 bg-destructive/8 px-2.5 py-2">
          <ul className="list-disc space-y-0.5 pl-4 text-[11.5px] text-destructive">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
            {refused ? <li>{refused}</li> : null}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
