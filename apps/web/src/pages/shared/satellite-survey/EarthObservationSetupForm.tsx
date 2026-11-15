import { useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Loader,
  Satellite,
} from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";

import type { SurveyCategory } from "../../../lib/repositories/satelliteSurveys.ts";
import { createJob, type JobWithProject } from "../../../lib/repositories/jobs.ts";
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
import { DEFAULT_HALF_DEG, DEFAULT_TARGET, type SurveyFormValues } from "./model.ts";

const fieldClass =
  "h-10 sm:h-9 rounded-md border border-input bg-background px-3 text-[16px] sm:text-sm shadow-xs outline-none focus-visible:ring-[2px] focus-visible:ring-ring/60";
const monoClass = `${fieldClass} font-mono tabular-nums`;
const labelClass =
  "text-[12px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

interface EarthObservationSetupFormProps {
  workspaceId: string;
  values: SurveyFormValues;
  onChange: (patch: Partial<SurveyFormValues>) => void;
  onCreateSurvey: (survey: JobWithProject) => void;
  projectName?: string;
  projectContextId?: string | null;
  busy: boolean;
  queueing: boolean;
  quote: SurveyQuote | null;
  quoteLoading: boolean;
  balance: number | null;
  onNavigateBilling?: () => void;
  onNavigate?: (view: string, context?: Record<string, string>) => void;
}

/** Create a project survey without exposing the legacy job-selection workflow. */
export default function EarthObservationSetupForm({
  workspaceId,
  values,
  onChange,
  onCreateSurvey,
  projectContextId,
  projectName,
  busy,
  queueing,
  balance,
  onNavigateBilling,
  onNavigate,
}: EarthObservationSetupFormProps) {
  const [surveyName, setSurveyName] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<SurveyCategory>("water");
  const [latitude, setLatitude] = useState(DEFAULT_TARGET.latitude.toFixed(5));
  const [longitude, setLongitude] = useState(DEFAULT_TARGET.longitude.toFixed(5));
  const [halfDeg, setHalfDeg] = useState(DEFAULT_HALF_DEG);
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const parsedLatitude = parseCoordinate(latitude);
  const parsedLongitude = parseCoordinate(longitude);
  const draftQuote = useSurveyQuote(
    parsedLatitude === null
      ? null
      : { categories: [category], halfDeg, latitude: parsedLatitude },
  );
  const note = parsedLatitude !== null && parsedLongitude !== null
    ? coverageNoteFor(parsedLatitude, parsedLongitude)
    : "";

  const optical = values.dataSources?.optical ?? OPTICAL_PRODUCTS[0].id;
  const product = productById(optical);
  const windows = windowOptions(optical);
  const composite = values.composite ?? DEFAULT_COMPOSITE;
  const deadWindow = windows.find((window) => !window.available);
  const windowId = composite.window === deadWindow?.id ? "annual" : composite.window;
  const years = yearOptions(optical);
  const year = years.includes(composite.year) ? composite.year : DEFAULT_COMPOSITE.year;
  const chosen = values.dataSources ?? {};

  function setSource(id: string, value: string) {
    onChange({ dataSources: { ...chosen, [id]: value } });
  }

  async function handleCreateSurvey() {
    const nextProblems = jobSpecProblems({
      title: surveyName,
      category,
      latitude,
      longitude,
      halfDeg,
    });
    if (nextProblems.length > 0) {
      setProblems(nextProblems);
      setError(null);
      return;
    }

    const spec = jobSpecFrom({ category, latitude, longitude, halfDeg });
    if (!spec) {
      setProblems(["The area to be analysed could not be read."]);
      return;
    }

    setProblems([]);
    setError(null);
    setSaving(true);
    try {
      const typeLabel =
        category === "water"
          ? "Groundwater & Boreholes"
          : category === "minerals"
            ? "Mineral Exploration & Prospectivity"
            : category === "soil"
              ? "Soil & Land Capability"
              : "Multi-Hazard & Safety";
      const created = await createJob(workspaceId, {
        title: surveyName.trim(),
        location: location.trim() || undefined,
        job_type: typeLabel,
        description: serializeJobSpec(spec),
        project_id: projectContextId || undefined,
        status: "planned",
      });
      onCreateSurvey({ ...created, project_name: projectName ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create survey.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="flex flex-col gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Satellite className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">New Earth Observation survey</h1>
            {projectName ? <p className="text-sm text-muted-foreground">{projectName}</p> : null}
          </div>
        </div>
        {onNavigate ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 self-start text-xs font-medium sm:self-auto"
            onClick={() => onNavigate("projects", projectContextId ? { projectId: projectContextId, tab: "earthObservation" } : undefined)}
          >
            <ArrowLeft className="size-3.5" /> Back to project
          </Button>
        ) : null}
      </div>

      {!projectContextId ? (
        <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-6 text-center">
          <p className="text-sm font-medium text-foreground">Open Earth Observation from a project</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Surveys and their results stay with the project they belong to.
          </p>
        </div>
      ) : (
        <>
          <Card className="border-border/70 shadow-xs">
            <CardHeader className="pb-3"><CardTitle className="text-base">Survey details</CardTitle></CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="eo-create-title" className={labelClass}>Survey Name *</Label>
                  <Input
                    id="eo-create-title"
                    className={fieldClass}
                    placeholder="e.g. Masvingo Groundwater Siting"
                    value={surveyName}
                    disabled={saving}
                    onChange={(event) => setSurveyName(event.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="eo-create-loc" className={labelClass}>Site Location / Address</Label>
                  <Input
                    id="eo-create-loc"
                    className={fieldClass}
                    placeholder="e.g. Plot 14, Masvingo North"
                    value={location}
                    disabled={saving}
                    onChange={(event) => setLocation(event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className={labelClass}>Primary Survey Domain</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {SURVEY_CATEGORY_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={category === option.id}
                      onClick={() => setCategory(option.id)}
                      className={`rounded-md border p-2 text-left text-xs font-medium transition-colors ${
                        category === option.id
                          ? "border-primary bg-primary/15 text-primary shadow-xs ring-1 ring-primary/40"
                          : "border-border/70 text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      {CATEGORY_LABELS[option.dossier].short}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-xs">
            <CardHeader className="pb-3"><CardTitle className="text-base">Area to be analysed</CardTitle></CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="eo-new-lat" className={labelClass}>Latitude *</Label>
                  <Input id="eo-new-lat" className={monoClass} type="number" step="0.00001" min={-90} max={90} inputMode="decimal" value={latitude} disabled={saving} onChange={(event) => setLatitude(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="eo-new-lon" className={labelClass}>Longitude *</Label>
                  <Input id="eo-new-lon" className={monoClass} type="number" step="0.00001" min={-180} max={180} inputMode="decimal" value={longitude} disabled={saving} onChange={(event) => setLongitude(event.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eo-new-extent" className={labelClass}>Observation extent (AOI) *</Label>
                <select id="eo-new-extent" className={`w-full ${fieldClass}`} value={halfDeg} disabled={saving} onChange={(event) => setHalfDeg(Number(event.target.value))}>
                  {AOI_CHOICES.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                </select>
                {draftQuote.quote ? <p className="text-[12px] sm:text-[11px] text-muted-foreground">Ground covered: <span className="font-medium text-foreground">{areaText(draftQuote.quote)}</span></p> : null}
              </div>
              {note ? <p role="status" className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs leading-snug text-amber-700 dark:text-amber-400">{note}</p> : null}
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-xs">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Earth Observation data inputs</CardTitle>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-primary" aria-expanded={sourcesOpen} onClick={() => setSourcesOpen((open) => !open)}>
                {sourcesOpen ? <>Collapse <ChevronUp className="size-3.5" /></> : <>Customize feeds <ChevronDown className="size-3.5" /></>}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/40 p-2.5 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Active feeds:</span>
                <span className="rounded border bg-background px-2 py-0.5 font-medium text-foreground">{product.label} ({year}, {composite.window})</span>
                <span className="rounded border bg-background px-2 py-0.5 font-medium text-foreground">NASADEM 30m Elevation</span>
                <span className="rounded border bg-background px-2 py-0.5 font-medium text-foreground">Sentinel-1 SAR Radar</span>
              </div>
              {sourcesOpen ? (
                <div className="space-y-4 border-t border-border/60 pt-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="eo-optical-source" className={labelClass}>Optical Imagery Product</Label>
                      <select id="eo-optical-source" className={`w-full ${fieldClass}`} value={optical} disabled={busy} onChange={(event) => setSource("optical", event.target.value)}>
                        {OPTICAL_PRODUCTS.map((item) => <option key={item.id} value={item.id}>{item.label} ({item.family})</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="eo-comp-year" className={labelClass}>Archive Year</Label>
                        <select id="eo-comp-year" className={`w-full ${fieldClass}`} value={year} disabled={busy} onChange={(event) => onChange({ composite: { ...composite, year: Number(event.target.value), window: windowId } })}>
                          {years.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="eo-comp-window" className={labelClass}>Seasonal Window</Label>
                        <select id="eo-comp-window" className={`w-full ${fieldClass}`} value={windowId} disabled={busy} onChange={(event) => onChange({ composite: { ...composite, year, window: event.target.value } })}>
                          {windows.map((window) => <option key={window.id} value={window.id} disabled={!window.available}>{window.label}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {DATA_SOURCES.filter((source) => source.id !== "optical").map((group) => {
                      const selected = chosen[group.id] ?? group.options[0].value;
                      return (
                        <div key={group.id} className="space-y-1.5">
                          <Label htmlFor={`eo-src-${group.id}`} className={labelClass}>{group.label}</Label>
                          <select id={`eo-src-${group.id}`} className={`w-full ${fieldClass}`} value={selected} disabled={busy} onChange={(event) => setSource(group.id, event.target.value)}>
                            {group.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                  <details className="text-xs">
                    <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">Fixed Pre-Calibrated Models</summary>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted-foreground">{FIXED_SOURCES.map((source) => <li key={source}>{source}</li>)}</ul>
                  </details>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <CreditCostPanel quote={draftQuote.quote} loading={draftQuote.loading} balance={balance} onNavigateBilling={onNavigateBilling} />

          {problems.length > 0 ? (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <p className="mb-1 font-semibold">This survey cannot be priced yet:</p>
              <ul className="list-disc space-y-0.5 pl-4">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
            </div>
          ) : null}
          {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}

          <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-4 sm:flex-row sm:justify-end">
            {onNavigate ? <Button type="button" variant="outline" onClick={() => onNavigate("projects", { projectId: projectContextId, tab: "earthObservation" })}>Cancel</Button> : null}
            <Button type="button" className="h-9 gap-1.5 text-xs font-semibold" disabled={saving || queueing || !surveyName.trim()} onClick={() => void handleCreateSurvey()}>
              {saving ? <Loader className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {saving ? "Creating Survey…" : draftQuote.quote ? `Create & Open Survey · ${draftQuote.quote.credits} credit${draftQuote.quote.credits === 1 ? "" : "s"}` : "Create & Open Survey"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
