/**
 * Tests for the Earth Observation result read the assistant answers from.
 *
 * The dossier tool runs with the service-role key, so the workspace predicate
 * has to be in the request itself, and the digest must carry the same keys the
 * web reader (parseSurveyResult) renders — scores, mineral systems with their
 * map share, depth-to-water, provenance and ranked targets.
 *
 * Run with: deno test supabase/functions/_shared/
 */

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { getSatelliteSurveyResult, launchSatelliteSurvey } from "./satellite-survey-workflow.ts";
import type { CallOpts, Db } from "./workflows.ts";
import { executeTool } from "./ai-agent.ts";

const OWN_RUN = "11111111-1111-1111-1111-111111111111";
const RIVAL_RUN = "22222222-2222-2222-2222-222222222222";

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

/** eq-aware PostgREST stub injected as the workflow `db` seam. */
function workflowDb(store: Store): { db: Db; paths: string[] } {
  const paths: string[] = [];
  const db: Db = {
    supabaseFetch(opts) {
      paths.push(opts.path);
      const [table, qs = ""] = opts.path.split("?");
      const params = new URLSearchParams(qs);
      let rows = store[table] ?? [];
      for (const key of params.keys()) {
        const value = params.get(key);
        if (!value?.startsWith("eq.")) continue;
        const operand = value.slice(3);
        rows = rows.filter((r) => String(r[key]) === operand);
      }
      return Promise.resolve({ ok: true, status: 200, json: rows, count: rows.length });
    },
  };
  return { db, paths };
}

const OPTS: CallOpts = { supabaseUrl: "http://test", serviceKey: "svc", workspaceId: "ws-1" };

const RESULT_BLOB: Row = {
  executive_summary: "Gold and iron systems screened across the claim.",
  claim_ceiling: "Scores rank investigation priority inside this survey area only.",
  score_basis: "Six coverages on a 30 m grid.",
  scores: {
    minerals: { cell_score: 78, cell_class: "High" },
    groundwater: { cell_score: 41, cell_class: "Moderate" },
    hazard_safety: { safety_score: 62, hazard_class: "Caution" },
  },
  target: { cell_m: 30, utm_zone: "36K", crs: "EPSG:32736" },
  categories: {
    minerals: {
      mineral_commodities: [
        {
          key: "GOLD",
          name: "Gold",
          group: "Precious",
          indicated: true,
          confidence: "Moderate",
          area_band: "Indicated",
          area_top_decile: 91,
          target_score: 78,
          symbol: "Au",
          color: "#e69f00",
        },
        {
          key: "IRON_ORE",
          name: "Iron ore",
          group: "Ferrous",
          indicated: false,
          confidence: "High",
          area_band: "Not indicated",
          area_top_decile: 44,
          target_score: 51,
        },
      ],
      commodity_area_distribution: [
        { key: "GOLD", area_km2: 12.4, share_pct: 38.5 },
        { key: "IRON_ORE", area_km2: 6.1, share_pct: 19.0 },
      ],
      unscreenable_commodities: [
        { name: "Diamonds", reason: "No orbital signature", needs: "Ground kimberlite sampling" },
      ],
    },
    water: {
      target_assessment: {
        depth_to_water_wet_m: 18,
        depth_to_water_dry_m: 34,
        borehole_read: "Drill to 40 m",
      },
    },
  },
  data_sources: {
    selectable: {
      optical: { coverage: "sentinel-2-l2a", label: "Sentinel-2 L2A", credit: "ESA" },
      dem: "copernicus-30",
    },
    fixed: { landcover: "ESA WorldCover" },
  },
};

function freshStore(): Store {
  return {
    survey_runs: [
      {
        id: OWN_RUN,
        workspace_id: "ws-1",
        status: "succeeded",
        stage: null,
        progress: 100,
        categories: ["minerals"],
        client_name: "Gweru South",
        latitude: -19.5,
        longitude: 29.8,
        half_deg: 0.06,
        surface_area_km2: 169,
        quoted_credits: 40,
        result: RESULT_BLOB,
        error_message: null,
        created_at: "2026-11-07T10:00:00Z",
        completed_at: "2026-11-07T10:04:00Z",
      },
      {
        id: RIVAL_RUN,
        workspace_id: "ws-2",
        status: "succeeded",
        categories: ["water"],
        client_name: "Rival claim",
        result: { executive_summary: "Rival findings" },
        created_at: "2026-11-08T10:00:00Z",
      },
    ],
    survey_targets: [
      {
        run_id: OWN_RUN,
        category: "minerals",
        rank: 1,
        latitude: -19.51,
        longitude: 29.84,
        score: 82,
        distance_km: 1.2,
        readout: "Shear-hosted quartz vein",
      },
      { run_id: RIVAL_RUN, category: "water", rank: 1, latitude: 0, longitude: 0 },
    ],
    survey_deliverables: [
      { run_id: OWN_RUN, kind: "minerals_kmz", content_type: "application/vnd.google-earth.kmz" },
      { run_id: OWN_RUN, kind: "minerals_map_tif", content_type: "image/tiff" },
      { run_id: RIVAL_RUN, kind: "water_kmz", content_type: "application/vnd.google-earth.kmz" },
    ],
  };
}

Deno.test("get_satellite_survey_result cannot read another workspace's run", async () => {
  const { db, paths } = workflowDb(freshStore());
  const result = JSON.parse(
    await getSatelliteSurveyResult(db, OPTS, { run_id: RIVAL_RUN }),
  ) as { found: boolean };
  assertEquals(result.found, false);
  assertStringIncludes(paths[0], "workspace_id=eq.ws-1");
  assertEquals(paths.length, 1, "a foreign run must not reach the child tables");
});

Deno.test("the dossier carries scores, mineral systems, water depth and targets", async () => {
  const { db, paths } = workflowDb(freshStore());
  const result = JSON.parse(
    await getSatelliteSurveyResult(db, OPTS, { run_id: OWN_RUN }),
  ) as {
    status: string;
    claim_ceiling: string;
    scores: Record<string, { score: number; class: string }>;
    mineral_commodities: {
      name: string;
      indicated: boolean;
      map_area_km2: number;
      map_share_pct: number;
    }[];
    unscreenable_commodities: { name: string }[];
    water_depth: { depth_to_water_wet_m: number; borehole_read: string };
    target_grid: { cell_m: number; crs: string };
    data_sources: { layers: Record<string, string>; fixed: Record<string, string> };
    targets: { latitude: number; readout: string }[];
    published_files: string[];
  };

  assertEquals(result.status, "succeeded");
  assertStringIncludes(result.claim_ceiling, "investigation priority");
  assertEquals(result.scores.minerals.score, 78);
  assertEquals(result.scores.hazard_safety.score, 62, "hazard reads the safety score");
  assertEquals(result.mineral_commodities[0].name, "Gold");
  assertEquals(result.mineral_commodities[0].indicated, true);
  assertEquals(result.mineral_commodities[0].map_share_pct, 38.5);
  assertEquals(result.mineral_commodities[1].map_area_km2, 6.1);
  assertEquals(result.unscreenable_commodities[0].name, "Diamonds");
  assertEquals(result.water_depth.depth_to_water_wet_m, 18);
  assertEquals(result.water_depth.borehole_read, "Drill to 40 m");
  assertEquals(result.target_grid.cell_m, 30);
  assertEquals(result.data_sources.layers.optical, "Sentinel-2 L2A");
  assertEquals(result.data_sources.layers.dem, "copernicus-30", "a bare string entry is its own label");
  assertEquals(result.data_sources.fixed.landcover, "ESA WorldCover");
  assertEquals(result.targets.length, 1, "only this run's targets");
  assertEquals(result.targets[0].latitude, -19.51);
  assertEquals(result.published_files, ["minerals_kmz", "minerals_map_tif"]);
  for (const path of paths) {
    assert(!path.includes(RIVAL_RUN), "no request may name the rival run");
  }
});

Deno.test("an in-flight run returns a progress pointer, not findings", async () => {
  const store = freshStore();
  store.survey_runs = [
    {
      id: OWN_RUN,
      workspace_id: "ws-1",
      status: "surveying",
      stage: "Scoring mineral systems",
      progress: 55,
      categories: ["minerals"],
      created_at: "2026-11-07T10:00:00Z",
    },
  ];
  const { db, paths } = workflowDb(store);
  const result = JSON.parse(await getSatelliteSurveyResult(db, OPTS, {})) as {
    status: string;
    progress: number;
    message: string;
    scores?: unknown;
  };
  assertEquals(result.status, "surveying");
  assertEquals(result.progress, 55);
  assertStringIncludes(result.message, "not published yet");
  assertEquals(result.scores, undefined);
  assertEquals(paths.length, 1, "no child reads before the run succeeds");
});

Deno.test("a failed run reports its error", async () => {
  const store = freshStore();
  store.survey_runs = [
    {
      id: OWN_RUN,
      workspace_id: "ws-1",
      status: "failed",
      categories: ["water"],
      error_message: "Coverage download timed out",
      created_at: "2026-11-07T10:00:00Z",
    },
  ];
  const { db } = workflowDb(store);
  const result = JSON.parse(await getSatelliteSurveyResult(db, OPTS, {})) as {
    status: string;
    error_message: string;
  };
  assertEquals(result.status, "failed");
  assertEquals(result.error_message, "Coverage download timed out");
});

Deno.test("a workspace-less read emits nothing", async () => {
  const { db, paths } = workflowDb(freshStore());
  const result = JSON.parse(
    await getSatelliteSurveyResult(db, { ...OPTS, workspaceId: undefined }, {}),
  ) as { error: string };
  assertStringIncludes(result.error, "no workspace");
  assertEquals(paths, []);
});

Deno.test("executeTool routes get_satellite_survey_result inside the workspace", async () => {
  const store = freshStore();
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const u = new URL(url);
    const table = decodeURIComponent(u.pathname.slice("/rest/v1/".length));
    const params = new URLSearchParams(u.search);
    let rows = store[table] ?? [];
    for (const key of params.keys()) {
      const value = params.get(key);
      if (!value?.startsWith("eq.")) continue;
      rows = rows.filter((r) => String(r[key]) === value.slice(3));
    }
    return Promise.resolve(
      new Response(JSON.stringify(rows), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;
  try {
    const result = JSON.parse(
      await executeTool(
        "get_satellite_survey_result",
        JSON.stringify({ run_id: OWN_RUN }),
        {
          supabaseUrl: "http://test",
          serviceKey: "svc",
          workspaceId: "ws-1",
          schemas: new Map(),
        },
      ),
    ) as { found: boolean; status: string };
    assertEquals(result.found, true);
    assertEquals(result.status, "succeeded");
    assertStringIncludes(urls[0], "workspace_id=eq.ws-1");
  } finally {
    globalThis.fetch = original;
  }
});

// ── Launch: job creation + run linkage ─────────────────────────────────────
//
// The AI launch path used to queue an orphaned run: it charged credits and
// inserted survey_runs with no job, so the survey never appeared under the
// workspace's jobs and could not be opened in the workbench. These tests pin
// the job into existence and the run's job_id to it, without inventing a project.

interface LaunchCall {
  method: string;
  path: string;
  body?: unknown;
}

/** POST-aware stub: no run in flight, a successful charge, and controllable
 *  job/run insert outcomes so the refund paths can be exercised. */
function launchDb(
  opts: { failJobInsert?: boolean; failRunInsert?: boolean } = {},
): { db: Db; calls: LaunchCall[] } {
  const calls: LaunchCall[] = [];
  const db: Db = {
    supabaseFetch(o) {
      calls.push({ method: o.method, path: o.path, body: o.body });
      const [table] = o.path.split("?");
      if (o.method === "GET" && table === "survey_runs") {
        return Promise.resolve({ ok: true, status: 200, json: [], count: 0 });
      }
      if (o.method === "POST" && table === "rpc/charge_satellite_survey") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: [{ credits_charged: 40, remaining_balance: 60, quote: { surface_area_km2: 169 } }],
          count: 1,
        });
      }
      if (o.method === "POST" && table === "jobs") {
        return Promise.resolve({ ok: !opts.failJobInsert, status: opts.failJobInsert ? 500 : 201, json: [], count: 0 });
      }
      if (o.method === "POST" && table === "survey_runs") {
        return Promise.resolve({ ok: !opts.failRunInsert, status: opts.failRunInsert ? 500 : 201, json: [], count: 0 });
      }
      return Promise.resolve({ ok: true, status: 200, json: [], count: 0 });
    },
  };
  return { db, calls };
}

const LAUNCH_ARGS = {
  category: "minerals",
  latitude: -19.5,
  longitude: 29.8,
  half_deg: 0.06,
  client_name: "Gweru South",
  notes: "Gold prospecting",
  confirmed: true,
};

Deno.test("launch creates a job and links the run to it", async () => {
  const { db, calls } = launchDb();
  const result = JSON.parse(
    await launchSatelliteSurvey(db, OPTS, "user-1", LAUNCH_ARGS),
  ) as { success: boolean; job_id: string; run_id: string };

  assertEquals(result.success, true);
  const jobCall = calls.find((c) => c.method === "POST" && c.path === "jobs");
  const runCall = calls.find((c) => c.method === "POST" && c.path === "survey_runs");
  assert(jobCall, "a job must be created");
  assert(runCall, "a run must be queued");

  const job = jobCall.body as Row;
  const run = runCall.body as Row;
  assertEquals(job.workspace_id, "ws-1");
  assertEquals(job.title, "Gweru South");
  assertEquals(job.status, "planned");
  assertEquals(job.created_by, "user-1");
  // The specification travels in description so opening the job restores it.
  const spec = JSON.parse(job.description as string) as Row;
  assertEquals(spec.category, "minerals");
  assertEquals(spec.latitude, -19.5);
  assertEquals(spec.longitude, 29.8);
  assertEquals(spec.halfDeg, 0.06);
  // The run points at the job, exactly as the workbench's own launch does.
  assertEquals(run.job_id, job.id);
  assertEquals(run.project_id, null, "an unassigned job must not become a project");
  assertEquals(run.workspace_id, "ws-1");
  assertEquals(result.job_id, job.id);
});

Deno.test("a failed run insert refunds credits and removes the orphaned job", async () => {
  const { db, calls } = launchDb({ failRunInsert: true });
  const result = JSON.parse(
    await launchSatelliteSurvey(db, OPTS, "user-1", LAUNCH_ARGS),
  ) as { error: string };

  assertEquals(result.error, "QUEUE_INSERT_FAILED");
  assert(
    calls.some((c) => c.path === "rpc/refund_workspace_ai_credits"),
    "credits must be refunded when the run cannot be queued",
  );
  const jobDelete = calls.find((c) => c.method === "PATCH" && c.path.startsWith("jobs?"));
  assert(jobDelete, "the job created for the failed queue must be removed");
  assertEquals((jobDelete.body as Row)._deleted, true);
});

Deno.test("a failed job insert refunds before any run is queued", async () => {
  const { db, calls } = launchDb({ failJobInsert: true });
  const result = JSON.parse(
    await launchSatelliteSurvey(db, OPTS, "user-1", LAUNCH_ARGS),
  ) as { error: string };

  assertEquals(result.error, "JOB_INSERT_FAILED");
  assert(
    calls.some((c) => c.path === "rpc/refund_workspace_ai_credits"),
    "credits must be refunded when the job cannot be created",
  );
  assert(
    !calls.some((c) => c.method === "POST" && c.path === "survey_runs"),
    "no run may be queued when the job insert failed",
  );
});