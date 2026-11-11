import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { start, validate } from "./index.ts";

const WORKSPACE = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_WORKSPACE = "aaaaaaaa-0000-4000-8000-000000000002";
const JOB = "bbbbbbbb-0000-4000-8000-000000000001";
const PROJECT = "cccccccc-0000-4000-8000-000000000001";
const OTHER_PROJECT = "cccccccc-0000-4000-8000-000000000002";
const BODY = {
  workspaceId: WORKSPACE, jobId: JOB, latitude: -19.5, longitude: 29.8,
  halfDeg: 0.06, categories: ["water"], clientName: "Test site",
};
type Row = Record<string, unknown>;

function fixture() {
  const store: Record<string, Row[]> = {
    workspace_members: [{ workspace_id: WORKSPACE, user_id: "user-1", status: "active" }],
    jobs: [{ id: JOB, workspace_id: WORKSPACE, project_id: PROJECT, _deleted: false, archived_at: null }],
    projects: [{ id: PROJECT, workspace_id: WORKSPACE, _deleted: false, archived_at: null }],
  };
  const calls: { path: string; body?: Row }[] = [];
  const failures = new Set<string>();
  const client = createClient("https://survey.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const path = url.pathname.replace("/rest/v1/", "");
        const body = init?.body ? JSON.parse(String(init.body)) as Row : undefined;
        calls.push({ path, body });
        if (failures.has(path)) {
          return new Response(JSON.stringify({ message: "Lookup failed" }), { status: 500 });
        }
        let result: unknown;
        if (path === "rpc/charge_satellite_survey") {
          result = [{ credits_charged: 20, remaining_balance: 80, quote: null }];
        } else if (path === "survey_runs" && init?.method === "POST") {
          result = body;
        } else {
          result = (store[path] ?? []).filter((row) => {
            for (const [key, value] of url.searchParams) {
              if (value.startsWith("eq.") && String(row[key]) !== value.slice(3)) return false;
              if (value === "is.null" && row[key] !== null) return false;
            }
            return true;
          });
        }
        return new Response(JSON.stringify(result), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
  const request = (overrides: Row = {}) => start(new Request("https://survey.test", {
    method: "POST", body: JSON.stringify({ ...BODY, ...overrides }),
  }), {
    getCaller: async () => ({ id: "user-1", email: null, emailConfirmed: true }),
    adminClient: () => client,
  });
  return { store, calls, failures, request };
}

Deno.test("valid job/project IDs remain distinct; optional project IDs stay null", () => {
  assertEquals(validate(BODY).input?.projectId, null);
  assertEquals(validate({ ...BODY, projectId: null }).input?.projectId, null);
  const input = validate({ ...BODY, jobId: JOB.toUpperCase(), projectId: PROJECT.toUpperCase() }).input;
  assertEquals(input?.jobId, JOB);
  assertEquals(input?.projectId, PROJECT);
});

for (const jobId of [undefined, null, "", "not-a-uuid", 42, {}, "bbbbbbbb-0000-4000-0000-000000000001"]) {
  Deno.test(`invalid job ID ${JSON.stringify(jobId)} is not replaced by a project ID`, async () => {
    const { calls, request } = fixture();
    const response = await request({ jobId, projectId: PROJECT });
    assertEquals(response.status, 400);
    assertEquals(calls, [], "invalid IDs must not reach membership, billing or inserts");
  });
}

for (const projectId of ["", "not-a-uuid", 42, {}]) {
  Deno.test(`invalid project ID ${JSON.stringify(projectId)} is rejected`, async () => {
    const { calls, request } = fixture();
    assertEquals((await request({ projectId })).status, 400);
    assertEquals(calls, []);
  });
}

Deno.test("malformed request bodies and workspace IDs fail validation", () => {
  for (const body of [null, [], "text", 42, { ...BODY, workspaceId: JOB.slice(1) }]) {
    assertEquals(validate(body).input, undefined);
  }
});

for (const projectId of [undefined, null, PROJECT]) {
  Deno.test(`job supplies the canonical project before billing (${projectId})`, async () => {
    const { calls, request } = fixture();
    const response = await request({ projectId });
    assertEquals(response.status, 200);
    assertEquals(calls.map((call) => call.path), [
      "workspace_members", "jobs", "projects", "rpc/charge_satellite_survey", "survey_runs",
    ]);
    const run = (await response.json()).run;
    assertEquals(run.job_id, JOB);
    assertEquals(run.project_id, PROJECT);
  });
}

Deno.test("unassigned jobs remain intentionally project-less", async () => {
  const { store, calls, request } = fixture();
  store.jobs[0].project_id = null;
  const response = await request({ projectId: null });
  assertEquals(response.status, 200);
  assertEquals((await response.json()).run.project_id, null);
  assertEquals(calls.some((call) => call.path === "projects"), false);
});

const rejectedCases: { name: string; mutate: (store: Record<string, Row[]>) => void; projectId?: string }[] = [
  { name: "missing job", mutate: (store) => { store.jobs = []; } },
  { name: "foreign workspace job", mutate: (store) => { store.jobs[0].workspace_id = OTHER_WORKSPACE; } },
  { name: "archived job", mutate: (store) => { store.jobs[0].archived_at = "2026-11-01"; } },
  { name: "deleted job", mutate: (store) => { store.jobs[0]._deleted = true; } },
  { name: "mismatching project", mutate: () => {}, projectId: OTHER_PROJECT },
  { name: "legacy mirrored job ID", mutate: () => {}, projectId: JOB },
  { name: "invented project on unassigned job", mutate: (store) => { store.jobs[0].project_id = null; }, projectId: PROJECT },
  { name: "foreign linked project", mutate: (store) => { store.projects[0].workspace_id = OTHER_WORKSPACE; } },
  { name: "missing linked project", mutate: (store) => { store.projects = []; } },
  { name: "archived linked project", mutate: (store) => { store.projects[0].archived_at = "2026-11-01"; } },
  { name: "deleted linked project", mutate: (store) => { store.projects[0]._deleted = true; } },
];
for (const scenario of rejectedCases) {
  Deno.test(`${scenario.name} cannot charge or queue a run`, async () => {
    const { store, calls, request } = fixture();
    scenario.mutate(store);
    assertEquals((await request({ projectId: scenario.projectId })).status, 400);
    assertEquals(calls.some((call) => call.body !== undefined), false);
  });
}

Deno.test("membership remains required before privileged relation lookups", async () => {
  const { store, calls, request } = fixture();
  store.workspace_members = [];
  assertEquals((await request()).status, 403);
  assertEquals(calls.map((call) => call.path), ["workspace_members"]);
});

for (const table of ["jobs", "projects"]) {
  Deno.test(`${table} lookup errors fail closed before charging`, async () => {
    const { calls, failures, request } = fixture();
    failures.add(table);
    await assertRejects(request);
    assertEquals(calls.some((call) => call.body !== undefined), false);
  });
}
