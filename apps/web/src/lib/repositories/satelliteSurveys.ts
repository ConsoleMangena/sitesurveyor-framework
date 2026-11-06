import { supabase } from "../supabase/client.ts";
import type { Tables } from "../supabase/types.ts";

export type SurveyRunRow = Tables<"survey_runs">;
export type SurveyTargetRow = Tables<"survey_targets">;
export type SurveyDeliverableRow = Tables<"survey_deliverables">;

const BUCKET = "survey-deliverables";
// Long enough to open every file in one survey sitting, short enough that a link pasted
// into a message tomorrow cannot read someone's deliverables.
const URL_TTL_SECONDS = 60 * 30;

export const SURVEY_CATEGORIES = ["water", "minerals", "soil", "hazard"] as const;
export type SurveyCategory = (typeof SURVEY_CATEGORIES)[number];

export const SURVEY_STATUSES = [
  "queued",
  "acquiring",
  "surveying",
  "publishing",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

/** Anything still being worked on, and therefore still worth polling. */
export function isActiveStatus(status: SurveyStatus): boolean {
  return status === "queued" || status === "acquiring" || status === "surveying" || status === "publishing";
}

/** The engine's four score keys, in the order a dossier presents them.
 *
 * `category` is the dossier key -- the same value `survey_targets.category` stores -- so
 * a score tile and its ranked targets join on one word instead of a translation table.
 */
const SCORE_KEYS = [
  { category: "water", key: "groundwater", label: "Groundwater" },
  { category: "minerals", key: "minerals", label: "Mineral prospectivity" },
  { category: "soil_land", key: "soil_land", label: "Soil & land capability" },
  { category: "hazard_safety", key: "hazard_safety", label: "Hazard & site safety" },
] as const;

export interface SurveyScore {
  category: string;
  label: string;
  /** 0-100, or null when this category was not part of the run. */
  score: number | null;
  klass: string | null;
}

export interface SurveyTargetArea {
  /** The grid the engine scored, in metres. */
  cellM: number | null;
  utmZone: string | null;
  crs: string | null;
}

/** One layer's provenance, as the worker records the coverage that fed the score.
 *
 * `coverage` is the registry id the raster came from and `label` the words a reader can
 * act on; they differ when a cached layer predates a switch, which is exactly the case a
 * report must not paper over.
 */
export interface SurveySourceEntry {
  coverage: string;
  label: string;
  credit: string | null;
}

export interface SurveyProvenance {
  /** Keyed by layer: `dem`, `landcover`, `optical`. */
  selectable: Record<string, SurveySourceEntry>;
  /** Inputs the caller cannot choose, named once per survey for the same reason. */
  fixed: Record<string, string>;
}

export interface SurveyResult {
  summary: string | null;
  scores: SurveyScore[];
  /** Restated on every result: a score here ranks investigation priority inside one
   *  AOI, and a reader who does not see it will compare two sites that cannot be compared. */
  claimCeiling: string | null;
  scoreBasis: string | null;
  dataSources: SurveyProvenance;
  target: SurveyTargetArea | null;
}

export interface SurveyRun {
  id: string;
  workspaceId: string;
  status: SurveyStatus;
  stage: string | null;
  progress: number;
  latitude: number;
  longitude: number;
  halfDeg: number;
  categories: string[];
  clientName: string;
  address: string | null;
  estimatedMinutes: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  result: SurveyResult | null;
  active: boolean;
}

export interface SurveyTarget {
  id: string;
  runId: string;
  category: string;
  rank: number;
  latitude: number;
  longitude: number;
  score: number | null;
  distanceKm: number | null;
  readout: string | null;
}

export interface SurveyDeliverable {
  id: string;
  runId: string;
  kind: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number | null;
}

export interface SurveyRunDetail {
  run: SurveyRun;
  targets: SurveyTarget[];
  deliverables: SurveyDeliverable[];
}

export interface StartSurveyInput {
  workspaceId: string;
  projectId?: string | null;
  latitude: number;
  longitude: number;
  halfDeg: number;
  categories: SurveyCategory[];
  clientName: string;
  address: string;
  dataSources?: Record<string, string>;
  composite?: Record<string, unknown>;
}

/** Raised when the workspace has run out of credits.
 *
 * Its own class because the page must not offer "try again" on it: resubmitting the same
 * survey cannot work, and the only honest next step is Billing.
 */
export class InsufficientCreditsError extends Error {
  constructor() {
    super("This workspace has run out of AI credits. Buy more from Billing to survey again.");
    this.name = "InsufficientCreditsError";
  }
}

function num(value: unknown): number {
  // PostgREST renders `numeric` columns as strings, and a latitude read as "false" or
  // "NaN" would render a survey of nowhere rather than fail loudly.
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function statusOf(value: string): SurveyStatus {
  return (SURVEY_STATUSES as readonly string[]).includes(value)
    ? (value as SurveyStatus)
    : "failed";
}

/**
 * Read the provenance block the worker writes into `result.data_sources`.
 *
 * The engine's shape is `{ selectable: { dem: { coverage, label } }, fixed: {...} }`, and
 * an entry that is only a string is read as the coverage id itself: `used_sources()` has
 * always carried a label, but a layer named without one should still say what it was.
 */
function provenanceOf(raw: unknown): SurveyProvenance {
  const empty: SurveyProvenance = { selectable: {}, fixed: {} };
  if (!raw || typeof raw !== "object") return empty;
  const doc = raw as Record<string, unknown>;

  const selectable: Record<string, SurveySourceEntry> = {};
  for (const [layer, value] of entriesOf(doc.selectable)) {
    if (typeof value === "string") {
      selectable[layer] = { coverage: value, label: value, credit: null };
      continue;
    }
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    const coverage = asText(entry.coverage) ?? layer;
    selectable[layer] = {
      coverage,
      label: asText(entry.label) ?? coverage,
      credit: asText(entry.credit),
    };
  }

  const fixed: Record<string, string> = {};
  for (const [layer, value] of entriesOf(doc.fixed)) {
    if (typeof value === "string" && value.trim()) fixed[layer] = value;
  }

  return { selectable, fixed };
}

function entriesOf(value: unknown): [string, unknown][] {
  return value && typeof value === "object"
    ? Object.entries(value as Record<string, unknown>)
    : [];
}

/**
 * Read the engine's result blob into what the page renders.
 *
 * Everything here is defensive on purpose: the result is a JSON document the engine owns
 * and versions on its side, so a renamed key must cost the reader one missing line, not
 * a white screen on a survey they paid for.
 */
export function parseSurveyResult(raw: unknown): SurveyResult | null {
  if (!raw || typeof raw !== "object") return null;
  const result = raw as Record<string, unknown>;
  const scores = (result.scores ?? {}) as Record<string, unknown>;
  const block = (result.target ?? null) as Record<string, unknown> | null;

  return {
    summary: asText(result.executive_summary),
    claimCeiling: asText(result.claim_ceiling),
    scoreBasis: asText(result.score_basis),
    dataSources: provenanceOf(result.data_sources),
    scores: SCORE_KEYS.map(({ category, key, label }) => {
      const entry = (scores[key] ?? {}) as Record<string, unknown>;
      // Hazard is scored the other way round by the engine: a higher index is worse, and
      // the safety score is what a reader acts on.
      const value = key === "hazard_safety" ? entry.safety_score : entry.cell_score;
      const klass = asText(entry.cell_class ?? entry.hazard_class);
      return {
        category,
        label,
        score: value === null || value === undefined ? null : num(value),
        klass,
      };
    }),
    target: block
      ? {
          cellM:
            block.cell_m === null || block.cell_m === undefined
              ? null
              : num(block.cell_m),
          utmZone: asText(block.utm_zone),
          crs: asText(block.crs),
        }
      : null,
  };
}

export function toSurveyRun(row: SurveyRunRow): SurveyRun {
  const status = statusOf(row.status);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    status,
    stage: row.stage,
    progress: num(row.progress),
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    halfDeg: num(row.half_deg),
    categories: row.categories ?? [],
    clientName: row.client_name,
    address: row.address,
    estimatedMinutes: row.estimated_minutes,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    result: parseSurveyResult(row.result),
    active: isActiveStatus(status),
  };
}

function toSurveyTarget(row: SurveyTargetRow): SurveyTarget {
  return {
    id: row.id,
    runId: row.run_id,
    category: row.category,
    rank: row.rank,
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    score: row.score === null ? null : num(row.score),
    distanceKm: row.distance_km === null ? null : num(row.distance_km),
    readout: row.readout,
  };
}

function toSurveyDeliverable(row: SurveyDeliverableRow): SurveyDeliverable {
  return {
    id: row.id,
    runId: row.run_id,
    kind: row.kind,
    storagePath: row.storage_path,
    contentType: row.content_type,
    sizeBytes: row.size_bytes === null ? null : num(row.size_bytes),
  };
}

export async function listSurveyRuns(
  workspaceId: string,
  limit = 20,
): Promise<SurveyRun[]> {
  const { data, error } = await supabase
    .from("survey_runs")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toSurveyRun);
}

/** One run with its targets and files.
 *
 * Three queries rather than two embeds: PostgREST would return the children of a
 * `select(*)` join untyped here, and the page needs each of them separately anyway --
 * targets grouped by category, files listed as downloads.
 */
export async function getSurveyRunDetail(runId: string): Promise<SurveyRunDetail | null> {
  const { data, error } = await supabase
    .from("survey_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const [{ data: targetRows }, { data: fileRows }] = await Promise.all([
    supabase
      .from("survey_targets")
      .select("*")
      .eq("run_id", runId)
      .order("category")
      .order("rank"),
    supabase.from("survey_deliverables").select("*").eq("run_id", runId).order("kind"),
  ]);

  return {
    run: toSurveyRun(data),
    targets: (targetRows ?? []).map(toSurveyTarget),
    deliverables: (fileRows ?? []).map(toSurveyDeliverable),
  };
}

export interface StartSurveyOutcome {
  run: SurveyRun;
  creditsCharged: number;
  remainingBalance: number | null;
}

/** Queue a survey through the platform, never against the engine.
 *
 * The call that charges is the only privileged one, so it goes through the edge function
 * and its error codes are mapped here rather than translated at every call site: a 402
 * has to arrive as something the page can only resolve in Billing, and a validation
 * failure has to arrive with every problem the form caused at once.
 */
export async function startSurvey(input: StartSurveyInput): Promise<StartSurveyOutcome> {
  const { data, error } = await supabase.functions.invoke("satellite-survey", {
    body: {
      workspaceId: input.workspaceId,
      projectId: input.projectId ?? null,
      latitude: input.latitude,
      longitude: input.longitude,
      halfDeg: input.halfDeg,
      categories: input.categories,
      clientName: input.clientName,
      address: input.address,
      dataSources: input.dataSources ?? {},
      composite: input.composite ?? {},
    },
  });

  if (error) {
    const response = (error as { context?: Response }).context;
    let payload: { error?: string; problems?: string[] } | null = null;
    try {
      payload = response ? (await response.json() as { error?: string; problems?: string[] }) : null;
    } catch {
      payload = null;
    }
    if (response?.status === 402) throw new InsufficientCreditsError();
    throw new Error(payload?.error ?? error.message);
  }

  const outcome = data as { run: SurveyRunRow; creditsCharged: number; remainingBalance: number | null };
  return {
    run: toSurveyRun(outcome.run),
    creditsCharged: outcome.creditsCharged ?? 0,
    remainingBalance: outcome.remainingBalance === null ? null : num(outcome.remainingBalance),
  };
}

/**
 * Withdraw a survey that has not started.
 *
 * Called straight against the RPC rather than through the edge function: the rule is
 * "the person who queued it, or a workspace admin", which Postgres can check from the
 * caller's own token, and routing it through a service-role call would erase exactly the
 * identity the rule needs.
 */
export async function cancelSurveyRun(runId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_survey_run", { p_run_id: runId });
  if (error) throw error;
}

/** A time-limited link to one deliverable, minted for this member only.
 *
 * The bucket is private and its policy reads the workspace out of the object path, so a
 * survey's maps and KMZ files cannot be enumerated by another tenant -- which is the
 * property the engine's public `/outputs/` directory never had.
 */
export async function deliverableUrl(deliverable: SurveyDeliverable): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(deliverable.storagePath, URL_TTL_SECONDS, {
      transform: undefined,
    });
  if (error) return null;
  return data.signedUrl;
}
