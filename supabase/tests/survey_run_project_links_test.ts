import { assertEquals } from "jsr:@std/assert@1";
import { PGlite } from "npm:@electric-sql/pglite@0.3.14";

// Isolated PostgreSQL fixtures: no Supabase connection or credentials required.
Deno.test("survey link repair is workspace-scoped, preserves unassigned jobs and is idempotent", async () => {
  const db = new PGlite();
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const migration = await Deno.readTextFile(new URL(
    "../migrations/20261110205921_repair_survey_run_project_links.sql", import.meta.url,
  ));
  try {
    await db.exec(`
      create table public.projects (id uuid primary key, workspace_id uuid not null);
      create table public.jobs (
        id uuid primary key, workspace_id uuid not null, project_id uuid references public.projects(id)
      );
      create table public.survey_runs (
        id uuid primary key, workspace_id uuid not null,
        job_id uuid references public.jobs(id), project_id uuid
      );
    `);
    for (const [project, workspace] of [[11, 1], [12, 2], [13, 1]]) {
      await db.query("insert into public.projects values ($1, $2)", [id(project), id(workspace)]);
    }
    for (const [job, workspace, project] of [[21, 1, 11], [22, 1, null], [23, 2, 12], [24, 1, 12], [25, 1, 13]]) {
      await db.query("insert into public.jobs values ($1, $2, $3)", [
        id(job!), id(workspace!), project === null ? null : id(project!),
      ]);
    }
    // [run, workspace, old job, old project, expected job, expected project]
    const cases = [
      [31, 1, null, 21, 21, 11], // Recover only from the legacy job UUID.
      [32, 1, 21, 21, 21, 11], // Canonicalize a mirrored project ID.
      [33, 1, null, 22, 22, null], // Recovery must preserve an unassigned job.
      [34, 1, 22, 11, 22, null], // Clear a stale project on an unassigned job.
      [35, 1, null, 23, null, 23], // Do not recover a foreign workspace job.
      [36, 1, 23, 23, 23, 23], // Do not canonicalize a foreign workspace job.
      [37, 1, null, 11, null, 11], // A genuine project ID does not imply a job.
      [38, 1, 25, 21, 25, 13], // Existing job_id wins over a different legacy job.
      [39, 1, 24, 24, 24, 24], // Do not copy a linked foreign project.
      [40, 1, null, null, null, null], // Do not invent links for orphaned runs.
      [41, 1, 21, null, 21, 11], // Fill a missing project from an explicit job.
      [42, 2, null, 23, 23, 12], // Recovery works independently in each workspace.
    ];
    for (const [run, workspace, job, project] of cases) {
      await db.query("insert into public.survey_runs values ($1, $2, $3, $4)", [
        id(run!), id(workspace!), job === null ? null : id(job!), project === null ? null : id(project!),
      ]);
    }
    const expected = cases.map(([run, , , , job, project]) => ({
      id: id(run!), job_id: job === null ? null : id(job!), project_id: project === null ? null : id(project!),
    }));
    for (let iteration = 0; iteration < 2; iteration++) {
      await db.exec(migration);
      const { rows } = await db.query("select id, job_id, project_id from public.survey_runs order by id");
      assertEquals(rows, expected);
    }
  } finally {
    await db.close();
  }
});
