/**
 * Client for the SiteSurveyor AI geospatial engine.
 *
 * The contract is `src/api.py` in the engine project: FastAPI routes that
 * answer with either the JSON documented there or an HTTPException whose
 * `detail` is `{ code, message, hint }`. Every type here mirrors that file, so
 * a field the engine does not send cannot silently appear in the dashboard.
 *
 * A survey is always started with `async_mode: true`. The engines take minutes
 * per category, and a request held open that long gets cut off by a proxy or a
 * sleeping laptop after the work has already finished — the job id and
 * `/api/jobs/{id}` are the engine's own answer to that, so this client uses it.
 */

const HEALTH_TIMEOUT_MS = 8_000;
const READ_TIMEOUT_MS = 15_000;

export type EngineErrorKind =
  /** Nothing answered, or the browser refused to read the answer. */
  | "unreachable"
  | "timeout"
  /** The engine answered with a status this client cannot use. */
  | "http";

export class EngineError extends Error {
  kind: EngineErrorKind;
  /** The engine's own machine-readable code, when it sent one. */
  code: string | null;
  /** What the engine told the caller to do about it. */
  hint: string | null;
  status: number | null;

  constructor(
    kind: EngineErrorKind,
    message: string,
    options: { code?: string | null; hint?: string | null; status?: number | null; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "EngineError";
    this.kind = kind;
    this.code = options.code ?? null;
    this.hint = options.hint ?? null;
    this.status = options.status ?? null;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export interface EngineHealth {
  status: string;
  service: string;
  organization: string;
  version: string;
  active_aoi: string;
  crs: string;
  state_dir_persistent: boolean;
  endpoints: Record<string, string>;
}

export type SurveyCategory = "water" | "minerals" | "soil" | "hazard" | "all";

export interface SurveyInput {
  latitude: number;
  longitude: number;
  categories: SurveyCategory[];
  clientName: string;
  address: string;
  halfDeg: number;
}

export interface EngineTarget {
  latitude: number;
  longitude: number;
  half_deg: number;
  cell_m: number;
  bbox_wgs84: number[];
  utm_zone: string;
  epsg: number;
  crs: string;
}

export interface SurveyAccepted {
  job_id: string;
  status: string;
  poll_url: string;
  poll_after_ms: number;
  estimated_minutes: number;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface SurveyScore {
  cell_score: number | null;
  cell_class: string | null;
  parcel_150m_mean?: number | null;
  safety_score?: number | null;
  hazard_score?: number | null;
  hazard_class?: string | null;
}

/** The dossier's category keys, which is what `survey_site` names its candidate lists. */
export type IntelligenceCategory =
  | "water"
  | "minerals"
  | "soil_land"
  | "hazard_safety";

/**
 * Keys of `result.scores`.
 *
 * The engine names its candidate list `water` but the matching score entry
 * `groundwater`, so the two dicts cannot share one key type and a lookup that
 * assumes they do silently reads undefined.
 */
export type SurveyScoreKey =
  | "groundwater"
  | "minerals"
  | "soil_land"
  | "hazard_safety";

/**
 * A ranked candidate straight from an engine category summary.
 *
 * Fields are the engine's own: only groundwater carries depth-to-water reads,
 * only minerals carries overburden and sampling advice, and every category
 * shares the rank/score/distance trio the table renders.
 */
export interface SurveyCandidate {
  rank?: number;
  latitude: number | null;
  longitude: number | null;
  potential_score?: number | null;
  class_name?: string | null;
  distance_from_target_km?: number | null;
  field_notes?: string[];
  depth_to_water_wet_m?: number | null;
  depth_to_water_dry_m?: number | null;
  borehole_read?: string | null;
  overburden_min_m?: number | null;
  overburden_max_m?: number | null;
  test_hole_depth_m?: number | null;
  sampling_method?: string | null;
  landcover?: string | null;
  elevation_m?: number | null;
}

/** The dossier's normalised primary recommendation, which renames distance. */
export interface PrimaryCandidate {
  latitude: number | null;
  longitude: number | null;
  distance_km: number | null;
  score?: number | null;
  class_name?: string | null;
  potential_score?: number | null;
  prospectivity_score?: number | null;
  capability_score?: number | null;
  safety_score?: number | null;
  borehole_read?: string | null;
  depth_to_water_wet_m?: number | null;
  depth_to_water_dry_m?: number | null;
}

export interface SurveyResult {
  status: string;
  executive_summary: string;
  scores: Partial<Record<SurveyScoreKey, SurveyScore>>;
  candidates: Partial<Record<IntelligenceCategory, SurveyCandidate[]>>;
  primary_recommendations: Record<string, PrimaryCandidate | null>;
  score_basis: string;
  claim_ceiling: string;
  target?: EngineTarget;
  download_urls?: Record<string, string>;
  deliverables_missing?: string[];
}

export interface EngineJob {
  id: string;
  status: JobStatus;
  stage: string;
  progress: number;
  submitted_at: number;
  started_at: number | null;
  finished_at: number | null;
  target: { latitude: number; longitude: number };
  error: { code: string; message: string; request_id?: string } | null;
  result: SurveyResult | null;
}

export interface DossierScorecard {
  groundwater?: SurveyScore & { primary_borehole_candidate?: PrimaryCandidate | null };
  minerals?: SurveyScore & { primary_mineral_target?: PrimaryCandidate | null };
  soil_land?: SurveyScore & { primary_agricultural_zone?: PrimaryCandidate | null };
  hazard_safety?: SurveyScore & {
    primary_safe_build_site?: PrimaryCandidate | null;
    sub_hazards?: Record<string, number>;
  };
}

export interface Dossier {
  title: string;
  generated_at: string;
  client: string;
  address: string;
  analyst_organization: string;
  target_coordinates: { latitude: number; longitude: number };
  category_status: Record<string, string>;
  executive_scorecard: DossierScorecard;
}

export interface CategoryArtefact {
  file: string;
  exists: boolean;
  bytes?: number;
  url?: string;
  raster_available?: boolean;
}

export interface CategoryState {
  key: string;
  slug: string;
  name: string;
  short: string;
  status: string;
  available: boolean;
  verification: string;
  candidate_noun: string;
  report: CategoryArtefact;
  viewer: CategoryArtefact;
  bundle: { url: string; formats: string[] };
  headline: string | null;
  candidates: number;
  top_candidate: PrimaryCandidate | null;
}

export interface EngineInventory {
  generated_at: string;
  categories: CategoryState[];
  surveyed: boolean;
  categories_complete: number;
  identity: { latitude: number; longitude: number; client: string; address: string } | null;
}

interface ApiErrorDetail {
  code?: string;
  message?: string;
  hint?: string;
  /** FastAPI's own field-validation wording, for a 422 this client did not raise. */
  msg?: string;
}

async function parseError(response: Response): Promise<EngineError> {
  let detail: ApiErrorDetail | ApiErrorDetail[] | string | null = null;
  try {
    const body = (await response.json()) as { detail?: ApiErrorDetail | ApiErrorDetail[] | string };
    detail = body.detail ?? null;
  } catch {
    detail = null;
  }
  const first = Array.isArray(detail) ? detail[0] : detail;
  const described = typeof first === "object" && first !== null ? first : null;
  const message =
    described?.message ??
    described?.msg ??
    (typeof detail === "string" && detail ? detail : null) ??
    `The engine answered ${response.status}.`;
  return new EngineError("http", message, {
    code: described?.code ?? null,
    hint: described?.hint ?? null,
    status: response.status,
  });
}

/**
 * Re-root an engine-supplied URL on the address this client was configured
 * with. The engine builds deliverable links from the Host header of the request
 * it is answering, so behind a proxy it can name a host the browser cannot
 * reach; only the path is trustworthy.
 */
export function relink(base: string, url: string | undefined | null): string | null {
  if (!url) return null;
  const root = base.replace(/\/+$/, "");
  const path = url.startsWith("http") ? new URL(url).pathname : url;
  return `${root}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function request<T>(
  base: string,
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      signal: controller.signal,
      credentials: "omit",
    });
    if (!response.ok) throw await parseError(response);
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof EngineError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new EngineError("timeout", `The engine did not answer within ${Math.round(timeoutMs / 1000)}s.`);
    }
    // A CORS rejection, a refused connection and a bad host all arrive as an
    // opaque network failure with no detail — a browser will not say which.
    throw new EngineError(
      "unreachable",
      "The engine did not answer.",
      {
        hint:
          "Check the engine URL is reachable and that this app's origin is listed in the engine's " +
          "ALLOWED_ORIGINS. A browser blocks the call either way and reports nothing more.",
        cause: error,
      },
    );
  } finally {
    clearTimeout(timer);
  }
}

export function createEngineClient(base: string) {
  const root = base.replace(/\/+$/, "");
  const json = { "Content-Type": "application/json" };

  return {
    base: root,

    health(): Promise<EngineHealth> {
      return request<EngineHealth>(root, "/health", { method: "GET" }, HEALTH_TIMEOUT_MS);
    },

    /** Start a survey and get a job id back; the caller polls `job`. */
    async survey(input: SurveyInput): Promise<SurveyAccepted> {
      return request<SurveyAccepted>(
        root,
        "/api/survey",
        {
          method: "POST",
          headers: json,
          body: JSON.stringify({
            latitude: input.latitude,
            longitude: input.longitude,
            categories: input.categories.length ? input.categories : ["all"],
            client_name: input.clientName,
            address: input.address,
            half_deg: input.halfDeg,
            async_mode: true,
          }),
        },
        READ_TIMEOUT_MS,
      );
    },

    job(jobId: string): Promise<EngineJob> {
      return request<EngineJob>(root, `/api/jobs/${encodeURIComponent(jobId)}`, { method: "GET" }, READ_TIMEOUT_MS);
    },

    jobs(): Promise<{ jobs: EngineJob[] }> {
      return request<{ jobs: EngineJob[] }>(root, "/api/jobs", { method: "GET" }, READ_TIMEOUT_MS);
    },

    dossier(): Promise<Dossier> {
      return request<Dossier>(root, "/api/dossier", { method: "GET" }, READ_TIMEOUT_MS);
    },

    inventory(): Promise<EngineInventory> {
      return request<EngineInventory>(root, "/api/categories", { method: "GET" }, READ_TIMEOUT_MS);
    },

    reportUrl(category: string): string {
      return `${root}/api/report/${encodeURIComponent(category)}`;
    },

    viewerUrl(category: string): string {
      return `${root}/api/raster/${encodeURIComponent(category)}`;
    },

    bundleUrl(category: string): string {
      return `${root}/api/export/${encodeURIComponent(category)}`;
    },

    absolute(path: string | undefined | null): string | null {
      return relink(root, path);
    },
  };
}

export type EngineClient = ReturnType<typeof createEngineClient>;
