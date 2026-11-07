// SiteSurveyor Earth Observation composite workflow tools.
//
// Enforces two strict business policies:
// 1. One survey at a time: exactly one domain category per run, and no concurrent
//    runs while another survey is actively in progress for the workspace.
// 2. Strict credit protocol: server-side quote -> balance check -> user confirmation
//    -> atomic server-side credit deduction via charge_satellite_survey.

import { scopeWrite, workspaceParam } from "./scoping.ts";
import type { Db, CallOpts } from "./workflows.ts";

export const EO_CATEGORIES = ["water", "minerals", "soil", "hazard"] as const;
export type EoCategory = (typeof EO_CATEGORIES)[number];

export const EO_CATEGORY_LABELS: Record<EoCategory, string> = {
  water: "Groundwater & Boreholes",
  minerals: "Mineral Prospectivity & Alteration",
  soil: "Soil & Land Capability",
  hazard: "Natural Hazard & Site Safety",
};

export const COVERAGE_LON: [number, number] = [-30.0, 66.0];
export const COVERAGE_LAT: [number, number] = [-56.0, 41.0];
export const DEFAULT_HALF_DEG = 0.06; // ~13 km bounding box

interface ActiveRunRow {
  id: string;
  status: string;
  stage: string | null;
  progress: number;
  categories: string[];
  created_at: string;
}

interface QuoteLine {
  category: string;
  label: string;
  base_credits: number;
  area_credits: number;
  credits: number;
  minimum_credits: number;
}

interface PriceQuoteResult {
  credits: number;
  surface_area_km2: number;
  surface_area_ha: number;
  half_deg: number;
  latitude: number;
  categories: string[];
  lines: QuoteLine[];
}

/** Check if this workspace has any survey currently in flight. */
export async function getActiveSurveyRun(
  db: Db,
  opts: CallOpts,
): Promise<ActiveRunRow | null> {
  const owner = scopeWrite(opts.workspaceId);
  if (!owner.ok) return null;

  const path = `survey_runs?select=id,status,stage,progress,categories,created_at&${workspaceParam(
    owner.workspaceId,
  )}&status=in.(queued,acquiring,surveying,publishing)&order=created_at.desc&limit=1`;

  const res = await db.supabaseFetch({
    ...opts,
    method: "GET",
    path,
  });

  if (!res.ok || !Array.isArray(res.json) || res.json.length === 0) {
    return null;
  }
  return res.json[0] as ActiveRunRow;
}

/**
 * 1. Quote an Earth Observation survey:
 *    - Validates single-domain category
 *    - Checks for active in-progress survey lock
 *    - Validates African bounding box coverage
 *    - Fetches official credit price from price_satellite_survey RPC
 *    - Checks workspace credit balance
 */
export async function quoteSatelliteSurvey(
  db: Db,
  opts: CallOpts,
  args: {
    category: string;
    latitude: number;
    longitude: number;
    half_deg?: number;
    client_name?: string;
    notes?: string;
  },
): Promise<string> {
  const owner = scopeWrite(opts.workspaceId);
  if (!owner.ok) return JSON.stringify({ error: owner.error });

  // 1. Enforce single category
  const rawCat = (args.category || "").trim().toLowerCase();
  if (!EO_CATEGORIES.includes(rawCat as EoCategory)) {
    return JSON.stringify({
      can_run: false,
      error: "INVALID_CATEGORY",
      message:
        "Please choose exactly ONE survey type at a time: 'water' (groundwater/boreholes), 'minerals' (gold/alteration), 'hazard' (flood/safety), or 'soil' (land capability).",
    });
  }
  const category = rawCat as EoCategory;
  const categoryLabel = EO_CATEGORY_LABELS[category];

  // 2. Enforce active survey lock
  const activeRun = await getActiveSurveyRun(db, opts);
  if (activeRun) {
    const runningCat = (activeRun.categories?.[0] as EoCategory) || "unknown";
    const runningLabel = EO_CATEGORY_LABELS[runningCat] || runningCat;
    return JSON.stringify({
      can_run: false,
      error: "SURVEY_IN_PROGRESS",
      message: `A ${runningLabel} survey is currently in progress for this workspace (${activeRun.status}: ${activeRun.progress}%). SiteSurveyor enforces one survey at a time. Please wait for it to finish before starting another.`,
      active_survey: {
        id: activeRun.id,
        category: runningCat,
        status: activeRun.status,
        progress: activeRun.progress,
        stage: activeRun.stage,
        created_at: activeRun.created_at,
      },
    });
  }

  // 3. Validate coordinates
  const lat = Number(args.latitude);
  const lon = Number(args.longitude);
  if (!Number.isFinite(lat) || lat < COVERAGE_LAT[0] || lat > COVERAGE_LAT[1]) {
    return JSON.stringify({
      can_run: false,
      error: "OUT_OF_COVERAGE",
      message: `Latitude ${lat} is outside satellite coverage (${COVERAGE_LAT[0]}° to ${COVERAGE_LAT[1]}°).`,
    });
  }
  if (!Number.isFinite(lon) || lon < COVERAGE_LON[0] || lon > COVERAGE_LON[1]) {
    return JSON.stringify({
      can_run: false,
      error: "OUT_OF_COVERAGE",
      message: `Longitude ${lon} is outside satellite coverage (${COVERAGE_LON[0]}° to ${COVERAGE_LON[1]}°).`,
    });
  }

  const halfDeg = Math.min(
    Math.max(Number(args.half_deg) || DEFAULT_HALF_DEG, 0.01),
    0.5,
  );

  // 4. Call server-side pricing function
  const priceRes = await db.supabaseFetch({
    ...opts,
    method: "POST",
    path: "rpc/price_satellite_survey",
    body: {
      p_categories: [category],
      p_half_deg: halfDeg,
      p_latitude: lat,
    },
  });

  if (!priceRes.ok || !priceRes.json) {
    return JSON.stringify({
      can_run: false,
      error: "PRICING_FAILED",
      message: "Could not calculate survey pricing. Please check database migrations.",
    });
  }

  const quote = priceRes.json as PriceQuoteResult;
  const creditsRequired = quote.credits;

  // 5. Query workspace AI credit balance
  const balanceRes = await db.supabaseFetch({
    ...opts,
    method: "GET",
    path: `workspace_ai_credit_accounts?select=balance&${workspaceParam(
      owner.workspaceId,
    )}&limit=1`,
  });

  let currentBalance = 0;
  if (
    balanceRes.ok &&
    Array.isArray(balanceRes.json) &&
    balanceRes.json.length > 0
  ) {
    currentBalance = Number((balanceRes.json[0] as { balance?: number }).balance) || 0;
  }

  const balanceSufficient = currentBalance >= creditsRequired;
  const balanceAfter = balanceSufficient ? currentBalance - creditsRequired : currentBalance;

  return JSON.stringify({
    can_run: balanceSufficient,
    category,
    category_label: categoryLabel,
    latitude: lat,
    longitude: lon,
    half_deg: halfDeg,
    surface_area_km2: quote.surface_area_km2,
    surface_area_ha: quote.surface_area_ha,
    credits_required: creditsRequired,
    current_balance: currentBalance,
    balance_sufficient: balanceSufficient,
    balance_after: balanceAfter,
    credits_deficit: balanceSufficient ? 0 : creditsRequired - currentBalance,
    estimated_minutes: 4,
    notes: args.notes || null,
    quote_breakdown: quote.lines,
  });
}

/**
 * 2. Launch an Earth Observation survey:
 *    - Validates user confirmation
 *    - Re-checks active survey lock
 *    - Debits credits atomically using charge_satellite_survey RPC
 *    - Inserts row into survey_runs table
 *    - Refunds credits automatically if queue insert fails
 */
export async function launchSatelliteSurvey(
  db: Db,
  opts: CallOpts,
  userId: string | undefined,
  args: {
    category: string;
    latitude: number;
    longitude: number;
    half_deg?: number;
    client_name?: string;
    notes?: string;
    address?: string;
    projectId?: string;
    confirmed: boolean;
  },
): Promise<string> {
  const owner = scopeWrite(opts.workspaceId);
  if (!owner.ok) return JSON.stringify({ error: owner.error });

  // 1. Explicit confirmation guard
  if (!args.confirmed) {
    return JSON.stringify({
      status: "pending_confirmation",
      message:
        "Satellite surveys require explicit user confirmation because credits will be deducted from your workspace ledger.",
    });
  }

  // 2. Validate single category
  const rawCat = (args.category || "").trim().toLowerCase();
  if (!EO_CATEGORIES.includes(rawCat as EoCategory)) {
    return JSON.stringify({
      error: "INVALID_CATEGORY",
      message: "Please specify exactly ONE survey category: water, minerals, soil, or hazard.",
    });
  }
  const category = rawCat as EoCategory;
  const categoryLabel = EO_CATEGORY_LABELS[category];

  // 3. Active run concurrency lock
  const activeRun = await getActiveSurveyRun(db, opts);
  if (activeRun) {
    return JSON.stringify({
      error: "SURVEY_IN_PROGRESS",
      message: "Another survey is already running for this workspace. Only one survey can run at a time.",
      active_run_id: activeRun.id,
    });
  }

  const lat = Number(args.latitude);
  const lon = Number(args.longitude);
  const halfDeg = Math.min(
    Math.max(Number(args.half_deg) || DEFAULT_HALF_DEG, 0.01),
    0.5,
  );
  const clientName = (args.client_name || "Site Survey").trim().slice(0, 160);
  const runId = crypto.randomUUID();

  // 4. Charge credits atomically via Postgres RPC
  const chargeRes = await db.supabaseFetch({
    ...opts,
    method: "POST",
    path: "rpc/charge_satellite_survey",
    body: {
      p_workspace_id: owner.workspaceId,
      p_user_id: userId || null,
      p_operation_id: runId,
      p_description: `Satellite ${categoryLabel} survey`,
      p_categories: [category],
      p_half_deg: halfDeg,
      p_latitude: lat,
    },
  });

  if (!chargeRes.ok) {
    const details = chargeRes.json as { message?: string } | null;
    const msg = details?.message || "";
    if (msg.includes("INSUFFICIENT_AI_CREDITS")) {
      return JSON.stringify({
        error: "INSUFFICIENT_CREDITS",
        message: "Your workspace has insufficient AI credits for this survey. Top up credits in Billing to proceed.",
      });
    }
    return JSON.stringify({
      error: `Credit charge failed (HTTP ${chargeRes.status}): ${msg}`,
    });
  }

  const chargeData = (
    Array.isArray(chargeRes.json) ? chargeRes.json[0] : chargeRes.json
  ) as
    | {
        credits_charged: number;
        remaining_balance: number;
        quote: PriceQuoteResult | null;
      }
    | undefined;

  const creditsCharged = chargeData?.credits_charged ?? 0;
  const remainingBalance = chargeData?.remaining_balance ?? 0;
  const quote = chargeData?.quote ?? null;

  // 5. Insert queued run into survey_runs
  const insertRes = await db.supabaseFetch({
    ...opts,
    method: "POST",
    path: "survey_runs",
    body: {
      id: runId,
      workspace_id: owner.workspaceId,
      created_by: userId || null,
      project_id: args.projectId || null,
      status: "queued",
      stage: "Queued for a survey worker",
      latitude: lat,
      longitude: lon,
      half_deg: halfDeg,
      categories: [category],
      client_name: clientName,
      address: (args.notes || args.address || "").trim() || null,
      estimated_minutes: 4,
      quoted_credits: creditsCharged,
      surface_area_km2: quote?.surface_area_km2 ?? null,
      credit_quote: quote,
    },
  });

  if (!insertRes.ok) {
    // If table insert fails, refund credits immediately
    await db.supabaseFetch({
      ...opts,
      method: "POST",
      path: "rpc/refund_workspace_ai_credits",
      body: {
        p_workspace_id: owner.workspaceId,
        p_user_id: userId || null,
        p_operation_id: runId,
        p_reason: "Satellite survey run insert failed",
      },
    });

    return JSON.stringify({
      error: "QUEUE_INSERT_FAILED",
      message: "Could not queue the survey job. Your credits have been refunded.",
    });
  }

  return JSON.stringify({
    success: true,
    run_id: runId,
    category,
    category_label: categoryLabel,
    latitude: lat,
    longitude: lon,
    surface_area_km2: quote?.surface_area_km2,
    credits_charged: creditsCharged,
    remaining_balance: remainingBalance,
    status: "queued",
    stage: "Queued for a survey worker",
    estimated_minutes: 4,
    message: `🛰️ ${categoryLabel} survey successfully launched and debited (${creditsCharged} credits). The worker is processing satellite rasters.`,
  });
}

/**
 * 3. Check status or get results for a satellite survey run:
 *    - Reads run progress and status
 *    - If succeeded, returns top targets and deliverables
 */
export async function getSatelliteSurveyStatus(
  db: Db,
  opts: CallOpts,
  args: { run_id?: string },
): Promise<string> {
  const owner = scopeWrite(opts.workspaceId);
  if (!owner.ok) return JSON.stringify({ error: owner.error });

  const runId = args.run_id?.trim();
  const filter = runId
    ? `id=eq.${encodeURIComponent(runId)}`
    : `status=in.(queued,acquiring,surveying,publishing,succeeded,failed)`;

  const runRes = await db.supabaseFetch({
    ...opts,
    method: "GET",
    path: `survey_runs?select=id,status,stage,progress,categories,client_name,latitude,longitude,quoted_credits,surface_area_km2,result,error_message,created_at,completed_at&${workspaceParam(
      owner.workspaceId,
    )}&${filter}&order=created_at.desc&limit=1`,
  });

  if (!runRes.ok || !Array.isArray(runRes.json) || runRes.json.length === 0) {
    return JSON.stringify({
      found: false,
      message: runId
        ? `No survey run found with id ${runId}.`
        : "No recent satellite survey found for this workspace.",
    });
  }

  const run = runRes.json[0] as {
    id: string;
    status: string;
    stage: string | null;
    progress: number;
    categories: string[];
    client_name: string;
    latitude: number;
    longitude: number;
    quoted_credits: number | null;
    surface_area_km2: number | null;
    result: Record<string, unknown> | null;
    error_message: string | null;
    created_at: string;
    completed_at: string | null;
  };

  const category = (run.categories?.[0] as EoCategory) || "water";
  const categoryLabel = EO_CATEGORY_LABELS[category] || category;

  if (run.status === "succeeded") {
    // Read top ranked targets
    const targetsRes = await db.supabaseFetch({
      ...opts,
      method: "GET",
      path: `survey_targets?select=category,rank,latitude,longitude,score,distance_km,readout&run_id=eq.${run.id}&order=rank.asc&limit=5`,
    });

    const targets = Array.isArray(targetsRes.json) ? targetsRes.json : [];

    return JSON.stringify({
      found: true,
      id: run.id,
      category,
      category_label: categoryLabel,
      status: "succeeded",
      progress: 100,
      client_name: run.client_name,
      latitude: run.latitude,
      longitude: run.longitude,
      surface_area_km2: run.surface_area_km2,
      completed_at: run.completed_at,
      targets,
      executive_summary: run.result?.executive_summary || null,
      message: `Survey complete for ${categoryLabel}. Top targets are available.`,
    });
  }

  if (run.status === "failed") {
    return JSON.stringify({
      found: true,
      id: run.id,
      category,
      category_label: categoryLabel,
      status: "failed",
      error_message: run.error_message || "The survey worker encountered an unrecoverable error.",
    });
  }

  // Active in progress
  return JSON.stringify({
    found: true,
    id: run.id,
    category,
    category_label: categoryLabel,
    status: run.status,
    stage: run.stage || "Processing satellite layers",
    progress: run.progress,
    created_at: run.created_at,
    message: `Survey is actively ${run.status} (${run.progress}% complete: ${run.stage || "processing"}).`,
  });
}

