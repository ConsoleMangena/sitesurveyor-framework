// Satellite surveying, started from inside the platform.
//
// This function is the only way a survey begins. It does three things the browser cannot
// be trusted to do for itself: it proves the caller belongs to the workspace, it charges
// the workspace's credits for the run, and it validates the request against what the
// engine can actually answer for. Everything after that is ordinary row reads -- the
// worker publishes into `survey_runs`, `survey_targets` and `survey_deliverables`, and
// members read those tables under RLS directly, so this function is not a proxy the UI
// has to poll through.
//
// There is deliberately no engine URL here, and none in the browser. The worker is a
// consumer of the database, not a service anyone calls, which is why no origin has to be
// allowlisted and nothing about a survey is reachable without a signed-in user.

import {
  adminClient,
  corsHeaders,
  getCaller,
  json,
} from "../_shared/supabase.ts";

const CATEGORY_IDS = ["water", "minerals", "soil", "hazard"] as const;

// The Digital Earth Africa envelope. Outside it the honest answer is "no coverage", not
// a survey built from rasters that failed to warp -- and because the check lives here, a
// hand-edited request cannot queue a job that is certain to fail after being paid for.
const COVERAGE_LON: [number, number] = [-30.0, 66.0];
const COVERAGE_LAT: [number, number] = [-56.0, 41.0];

const MAX_HALF_DEG = 0.5;

interface StartInput {
  workspaceId: string;
  projectId?: string | null;
  jobId: string;
  latitude: number;
  longitude: number;
  halfDeg: number;
  categories: string[];
  clientName: string;
  address: string;
  dataSources: Record<string, string>;
  composite: Record<string, unknown>;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Every problem with one request, in one pass.
 *
 * Returning the first failure only would make a user fix a latitude, resubmit, and then
 * discover the category list was empty. A survey costs credits, so the form should be
 * able to fail completely before it fails expensively.
 */
export function validate(rawBody: unknown): { input?: StartInput; problems: string[] } {
  const problems: string[] = [];
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return { problems: ["The survey request must be an object."] };
  }
  const body = rawBody as Record<string, unknown>;
  const { workspaceId, projectId, jobId, latitude, longitude, halfDeg, categories } = body;

  if (!isUuid(workspaceId)) problems.push("A valid workspace is required.");
  if (!isUuid(jobId)) problems.push("A valid job is required.");

  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    problems.push("Latitude must be a number between -90 and 90.");
  } else if (lat < COVERAGE_LAT[0] || lat > COVERAGE_LAT[1]) {
    problems.push(
      `Latitude ${lat} is outside the satellite coverage available here (${COVERAGE_LAT[0]} to ${COVERAGE_LAT[1]}).`,
    );
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    problems.push("Longitude must be a number between -180 and 180.");
  } else if (lon < COVERAGE_LON[0] || lon > COVERAGE_LON[1]) {
    problems.push(
      `Longitude ${lon} is outside the satellite coverage available here (${COVERAGE_LON[0]} to ${COVERAGE_LON[1]}).`,
    );
  }

  const size = Number(halfDeg);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_HALF_DEG) {
    problems.push(`The study area must be between 0 and ${MAX_HALF_DEG} degrees each way.`);
  }

  const chosen = Array.isArray(categories) ? categories.map(String) : [];
  const unknown = chosen.filter((c) => !(CATEGORY_IDS as readonly string[]).includes(c));
  if (!chosen.length) problems.push("Choose at least one survey category.");
  if (unknown.length) problems.push(`Unknown survey category: ${unknown.join(", ")}.`);

  const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (clientName.length > 160) problems.push("The client or project name must be under 160 characters.");
  if (address.length > 500) problems.push("The location note must be under 500 characters.");
  if (projectId !== null && projectId !== undefined && !isUuid(projectId)) {
    problems.push("The linked project must be a valid project.");
  }

  if (problems.length) return { problems };

  return {
    problems,
    input: {
      workspaceId: (workspaceId as string).toLowerCase(),
      projectId: isUuid(projectId) ? projectId.toLowerCase() : null,
      jobId: (jobId as string).toLowerCase(),
      latitude: lat,
      longitude: lon,
      halfDeg: size,
      categories: chosen,
      // A survey is published with a name on it. "Unnamed site" is the honest fallback;
      // the engine's own default is a real person's property, which must not be inherited.
      clientName: clientName || "Unnamed site",
      address,
      dataSources: typeof body.dataSources === "object" && body.dataSources !== null
        ? body.dataSources as Record<string, string>
        : {},
      composite: typeof body.composite === "object" && body.composite !== null
        ? body.composite as Record<string, unknown>
        : {},
    },
  };
}

/** How long this run will take, as the engine's own arithmetic.
 *
 * One category is roughly four minutes and each additional one about three more, because
 * every category re-reads the coverages already downloaded for the first. It is an
 * estimate shown to a person who is waiting, so it is stated as such and recomputed from
 * what was actually asked for rather than fixed.
 */
function estimatedMinutes(categories: string[]): number {
  return 4 + 3 * Math.max(0, categories.length - 1);
}

async function getMembership(
  admin: ReturnType<typeof adminClient>,
  workspaceId: string,
  userId: string,
) {
  const { data, error } = await admin
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Charge for the survey before the job exists as anything.
 *
 * Two orderings are wrong. Queueing then charging leaves a free job that a worker will
 * run for a workspace that could not pay, and the bar it reports is paid work that never
 * happened. Charging without a job id makes the later refund unaddressable, because the
 * ledger finds refunds by operation id -- so the run's id is generated here and becomes
 * that operation id, and the insert that follows either completes the pair or gives the
 * credits back.
 *
 * The amount is the platform's, not the request's. The job's own specification -- what
 * it surveys and how much ground it covers -- is priced inside the charge, so a
 * hand-edited request buys the survey it asked for and is billed for it rather than
 * naming its own price.
 */
async function chargeSurvey(
  admin: ReturnType<typeof adminClient>,
  workspaceId: string,
  userId: string,
  runId: string,
  input: StartInput,
) {
  const { data, error } = await admin.rpc("charge_satellite_survey", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_operation_id: runId,
    p_description: "Satellite survey",
    p_categories: input.categories,
    p_half_deg: input.halfDeg,
    p_latitude: input.latitude,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("INSUFFICIENT_AI_CREDITS")) {
      return { ok: false as const, status: 402, error:
        "This workspace has run out of SiteSurveyor credits. Buy more from Billing to survey again." };
    }
    if (message.includes("not configured for billing")) {
      return { ok: false as const, status: 503, error:
        "Satellite surveys are not priced in this project yet: push the survey migrations (npm run db:push) to enable them." };
    }
    if (message.includes("Not authorised")) {
      return { ok: false as const, status: 403, error:
        "Only an active member of this workspace can run a satellite survey." };
    }
    if (message.includes("Unknown survey category")) {
      return { ok: false as const, status: 400, error:
        `This survey cannot be priced: ${message}` };
    }
    return { ok: false as const, status: 503, error: "Could not charge for the survey." };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        transaction_id: string;
        remaining_balance: number;
        credits_charged: number;
        quote: Record<string, unknown> | null;
      }
    | undefined;
  return {
    ok: true as const,
    charged: row?.credits_charged ?? 0,
    balance: row?.remaining_balance ?? null,
    quote: row?.quote ?? null,
  };
}

async function refundQuietly(
  admin: ReturnType<typeof adminClient>,
  workspaceId: string,
  userId: string,
  runId: string,
) {
  // The job was never created, so the money has to come back; if that itself fails the
  // ledger is left for a human, and the user still hears about their survey failing.
  const { error } = await admin.rpc("refund_workspace_ai_credits", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_operation_id: runId,
    p_reason: "Satellite survey could not be queued",
  });
  if (error) console.error("survey credit refund failed", runId, error.message);
}

export async function start(
  req: Request,
  dependencies = { getCaller, adminClient },
): Promise<Response> {
  const caller = await dependencies.getCaller(req);
  if (!caller) return json({ error: "Sign in to run a satellite survey." }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return json({ error: "The survey request could not be read." }, 400);
  }

  const checked = validate(body);
  if (!checked.input) return json({ error: checked.problems.join(" "), problems: checked.problems }, 400);
  const input = checked.input;

  const admin = dependencies.adminClient();
  const membership = await getMembership(admin, input.workspaceId, caller.id).catch(() => null);
  if (!membership) {
    return json({ error: "Only an active member of this workspace can run a satellite survey." }, 403);
  }

  // Service-role inserts bypass RLS: prove the entire linkage before charging.
  const { data: job, error: jobError } = await admin
    .from("jobs")
    .select("id, project_id")
    .eq("id", input.jobId)
    .eq("workspace_id", input.workspaceId)
    .eq("_deleted", false)
    .is("archived_at", null)
    .maybeSingle();
  if (jobError) throw jobError;
  if (!job) {
    return json({ error: "Choose an available job in this workspace." }, 400);
  }

  const projectId: string | null = job.project_id ?? null;
  if (input.projectId !== null && input.projectId !== undefined && input.projectId !== projectId) {
    return json({ error: "The linked project does not match this job's project." }, 400);
  }
  if (projectId !== null) {
    const { data: project, error: projectError } = await admin
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("workspace_id", input.workspaceId)
      .eq("_deleted", false)
      .is("archived_at", null)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) {
      return json({ error: "The job's linked project is not available in this workspace." }, 400);
    }
  }

  const runId = crypto.randomUUID();
  const charge = await chargeSurvey(admin, input.workspaceId, caller.id, runId, input);
  if (!charge.ok) return json({ error: charge.error }, charge.status);

  // The quote travels with the run: what the survey covered and what it cost are
  // facts about the survey, not about the moment it was queued.
  const quote = charge.quote as { credits?: number; surface_area_km2?: number } | null;

  const { data, error } = await admin
    .from("survey_runs")
    .insert({
      id: runId,
      workspace_id: input.workspaceId,
      created_by: caller.id,
      project_id: projectId,
      job_id: input.jobId,
      status: "queued",
      stage: "Queued for a survey worker",
      latitude: input.latitude,
      longitude: input.longitude,
      half_deg: input.halfDeg,
      categories: input.categories,
      client_name: input.clientName,
      address: input.address || null,
      data_sources: input.dataSources,
      composite: input.composite,
      estimated_minutes: estimatedMinutes(input.categories),
      quoted_credits: charge.charged,
      surface_area_km2: quote?.surface_area_km2 ?? null,
      credit_quote: charge.quote,
    })
    .select("*")
    .single();

  if (error) {
    await refundQuietly(admin, input.workspaceId, caller.id, runId);
    console.error("survey insert failed", error.message);
    return json(
      { error: "This workspace cannot queue surveys yet: push the survey migrations (npm run db:push)." },
      503,
    );
  }

  return json({
    run: data,
    creditsCharged: charge.charged,
    remainingBalance: charge.balance,
    quote: charge.quote,
  });
}

if (import.meta.main) Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Only POST is supported." }, 405);
  }

  try {
    return await start(req);
  } catch (error) {
    // Never a stack trace in the response: this runs with the service-role key.
    console.error("satellite-survey failed", error);
    return json({ error: "The survey could not be started. Try again in a moment." }, 500);
  }
});
