import { useState } from "react";
import { Loader } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

import type { SurveyCategory } from "../../../lib/repositories/satelliteSurveys.ts";
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
import type { SurveyFormValues } from "./model.ts";

const fieldClass =
  "h-8 rounded-md border border-input bg-transparent px-2.5 text-[12.5px] shadow-xs outline-none focus-visible:ring-[2px] focus-visible:ring-ring/60";
const monoClass = `${fieldClass} font-mono tabular-nums`;
const labelClass =
  "text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground";

interface TargetFormProps {
  values: SurveyFormValues;
  onChange: (patch: Partial<SurveyFormValues>) => void;
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
}

/**
 * Site parameters, in the order the engine's own console asks for them.
 *
 * The coordinate fields are the two the whole survey turns on, so they are first, mono
 * and five-decimal precise; the study area comes next because it is the choice that
 * changes how long the wait is; categories and coverages follow, since neither changes
 * the target. Every control here maps to a value the worker actually applies — there is
 * nothing in this form that only looks like a setting.
 */
export default function TargetForm({
  values,
  onChange,
  queueing,
  busy,
  stage,
  progress,
  elapsed,
  problems,
  refused,
  onSubmit,
}: TargetFormProps) {
  const [sourcesOpen, setSourcesOpen] = useState(false);

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

  function toggleCategory(id: SurveyCategory) {
    const categories = values.categories.includes(id)
      ? values.categories.filter((category) => category !== id)
      : [...values.categories, id];
    onChange({ categories });
  }

  return (
    <form
      className="block px-4 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <h2 className={labelClass}>Site parameters</h2>

      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
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
          className="mt-2.5 rounded-md border border-amber-500/35 bg-amber-500/10 px-2.5 py-2 text-[11.5px] leading-snug text-amber-700 dark:text-amber-400"
        >
          {note}
        </p>
      ) : null}

      <div className="mt-3 space-y-1">
        <Label htmlFor="survey-client" className={labelClass}>
          Client / property
        </Label>
        <Input
          id="survey-client"
          className={fieldClass}
          maxLength={120}
          autoComplete="off"
          placeholder="Unnamed site"
          value={values.clientName}
          disabled={busy}
          onChange={(event) => onChange({ clientName: event.target.value })}
        />
      </div>

      <div className="mt-3 space-y-1">
        <Label htmlFor="survey-address" className={labelClass}>
          Location description
        </Label>
        <Input
          id="survey-address"
          className={fieldClass}
          maxLength={240}
          autoComplete="off"
          placeholder="Property location not specified"
          value={values.address}
          disabled={busy}
          onChange={(event) => onChange({ address: event.target.value })}
        />
      </div>

      <div className="mt-3 space-y-1">
        <Label htmlFor="survey-extent" className={labelClass}>
          Survey extent
        </Label>
        <select
          id="survey-extent"
          className={fieldClass}
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
      </div>

      <fieldset className="mt-3 space-y-1 border-0 p-0">
        <legend className={labelClass}>Categories</legend>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {SURVEY_CATEGORY_OPTIONS.map((option) => {
            const active = values.categories.includes(option.id);
            return (
              <label
                key={option.id}
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? "border-primary/45 bg-primary/12 text-primary"
                    : "border-input text-muted-foreground hover:bg-muted"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={active}
                  disabled={busy}
                  onChange={() => toggleCategory(option.id)}
                />
                {CATEGORY_LABELS[option.dossier].short}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-3 space-y-1 border-0 p-0">
        <legend className={labelClass}>Data inputs</legend>
        <button
          type="button"
          className="mt-1 flex w-full items-center justify-between text-left text-[11.5px] text-muted-foreground hover:text-foreground"
          aria-expanded={sourcesOpen}
          onClick={() => setSourcesOpen((open) => !open)}
        >
          <span>
            {imageryChip(chosen, { year, window: windowId })} ·{" "}
            {chosen.dem ?? "engine default"}
          </span>
          <span aria-hidden="true">{sourcesOpen ? "−" : "+"}</span>
        </button>

        {sourcesOpen ? (
          <div className="mt-1.5 space-y-2.5">
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
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="composite-year" className={labelClass}>
                  Composite year
                </Label>
                <select
                  id="composite-year"
                  className={monoClass}
                  value={year}
                  disabled={busy}
                  onChange={(event) =>
                    onChange({ composite: { year: Number(event.target.value), window: windowId } })
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
                  Composite window
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
                  {windows.map((window) => (
                    <option
                      key={window.id}
                      value={window.id}
                      disabled={!window.available}
                      title={window.reason}
                    >
                      {window.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {deadWindow ? (
              <p className="text-[11px] text-muted-foreground">{deadWindow.reason}</p>
            ) : null}

            <p className="text-[11px] text-muted-foreground">
              Years {product.years[0]}–{product.years[1]} are what {product.label} answers
              for. A year outside that range is an empty request, not an empty result.
            </p>
          </div>
        ) : null}

        <details className="mt-2">
          <summary className={labelClass}>Other inputs, fixed by the model</summary>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
            {FIXED_SOURCES.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-muted-foreground">
            The model is calibrated on these, so they are not a choice. They are listed
            because a reader who knows what produced a score can judge it.
          </p>
        </details>
      </fieldset>

      <Button
        type="submit"
        className="mt-3.5 h-9 w-full justify-center gap-2 text-[12.5px] font-semibold"
        disabled={queueing || busy}
      >
        {queueing || busy ? <Loader className="size-3.5 animate-spin" aria-hidden="true" /> : null}
        {busy ? "Screening in progress…" : "Run screening survey"}
      </Button>

      {progress !== null ? (
        <>
          <div
            className="sw-progress mt-3"
            role="progressbar"
            aria-label="Survey progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground" role="status" aria-live="polite">
            {stage ?? "Working"}{" "}
            <b className="sw-mono font-semibold text-foreground">
              {progress}%{elapsed ? ` · ${elapsed}` : ""}
            </b>
          </p>
        </>
      ) : null}

      {problems.length || refused ? (
        <div role="alert" className="mt-3 rounded-md border border-destructive/40 bg-destructive/8 px-2.5 py-2">
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
