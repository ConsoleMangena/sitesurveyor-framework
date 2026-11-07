import { supabase } from "../supabase/client.ts";
import { getCurrentSession } from "../auth/session.ts";
import type { Tables, TablesInsert, TablesUpdate } from "../supabase/types.ts";
import { getLocalDatabase, isUuid, type LocalDb } from "../localDb/db.ts";
import { startWorkspaceSync } from "../localDb/sync.ts";
import { generateLocalId, nowIso, omitNullish } from "../localDb/utils.ts";
import type { JobDocType } from "../localDb/schemas.ts";
import { deleteSurveyRunsForJob } from "./satelliteSurveys.ts";

export type JobRow = Tables<"jobs">;
export type JobInsert = TablesInsert<"jobs">;
export type JobUpdate = TablesUpdate<"jobs">;

export interface JobWithProject extends JobRow {
  project_name: string | null;
}

async function getLocalDb(workspaceId?: string): Promise<LocalDb> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in.");

  const db = await getLocalDatabase(session.user.id);
  if (workspaceId) {
    startWorkspaceSync(db, workspaceId);
  }
  return db;
}

function toJobRow(doc: JobDocType): JobRow {
  const { _deleted: _ignored, ...row } = doc;
  void _ignored;
  return row as JobRow;
}

export async function listJobs(
  workspaceId: string,
  options: { activeOnly?: boolean; status?: string; serviceArea?: string; jobType?: string } = {},
): Promise<JobWithProject[]> {
  if (!workspaceId || !isUuid(workspaceId)) return [];

  const session = await getCurrentSession();
  if (!session?.user) return [];

  const db = await getLocalDb(workspaceId);

  const selector: Record<string, unknown> = {
    workspace_id: workspaceId,
    _deleted: false,
  };

  if (options.activeOnly) {
    selector.status = { $ne: "completed" };
  } else if (options.status) {
    selector.status = options.status;
  }

  const [jobDocs, projectDocs, eventDocs] = await Promise.all([
    db.jobs.find({ selector }).sort({ created_at: "desc" }).exec(),
    db.projects
      .find({ selector: { workspace_id: workspaceId, _deleted: false } })
      .exec(),
    db.job_events
      .find({ selector: { workspace_id: workspaceId, _deleted: false } })
      .exec(),
  ]);

  const projectMap = new Map(
    projectDocs.map((d) => [d.id, d.toMutableJSON()]),
  );

  let rows = jobDocs.map((d) => {
    const job = toJobRow(d.toMutableJSON());
    const project = job.project_id ? projectMap.get(job.project_id) : undefined;
    return {
      ...job,
      project_name: project?.name ?? null,
    } as JobWithProject;
  });

  if (options.serviceArea) {
    rows = rows.filter((job) =>
      (job.location ?? "").toLowerCase().includes(options.serviceArea!.toLowerCase()),
    );
  }

  if (options.jobType) {
    rows = rows.filter((job) => job.job_type === options.jobType);
  }

  void eventDocs;
  return rows;
}

export async function getJob(id: string): Promise<JobWithProject | null> {
  if (!id || !isUuid(id)) return null;

  const session = await getCurrentSession();
  if (!session?.user) return null;

  const db = await getLocalDb();

  const doc = await db.jobs.findOne(id).exec();
  if (!doc) return null;

  const row = toJobRow(doc.toMutableJSON());
  const project = row.project_id
    ? (await db.projects.findOne(row.project_id).exec())?.toMutableJSON()
    : undefined;

  return {
    ...row,
    project_name: project?.name ?? null,
  } as JobWithProject;
}

export async function createJob(
  workspaceId: string,
  input: Omit<JobInsert, "workspace_id" | "created_by">,
): Promise<JobRow> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in to create a job.");

  const db = await getLocalDb(workspaceId);

  const doc = await db.jobs.insert({
    id: generateLocalId(),
    workspace_id: workspaceId,
    created_by: session.user.id,
    created_at: nowIso(),
    updated_at: nowIso(),
    _deleted: false,
    title: input.title ?? "",
    status: input.status ?? "planned",
    description: input.description ?? undefined,
    job_type: input.job_type ?? undefined,
    location: input.location ?? undefined,
    project_id: input.project_id ?? undefined,
    scheduled_start: input.scheduled_start ?? undefined,
    scheduled_end: input.scheduled_end ?? undefined,
  });

  return toJobRow(doc.toMutableJSON());
}

export async function updateJob(
  id: string,
  patch: JobUpdate,
): Promise<JobRow> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in to update a job.");

  const db = await getLocalDb();
  const doc = await db.jobs.findOne(id).exec();
  if (!doc) throw new Error(`Job not found: ${id}`);

  const { id: _id, ...safePatch } = patch;
  void _id;

  await doc.incrementalPatch({
    ...omitNullish(safePatch as unknown as Record<string, unknown>),
    updated_at: nowIso(),
  });

  return toJobRow(doc.toMutableJSON());
}

export async function archiveJob(id: string): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in to archive a job.");

  const db = await getLocalDb();
  const doc = await db.jobs.findOne(id).exec();
  if (!doc) throw new Error(`Job not found: ${id}`);

  await doc.incrementalPatch({
    archived_at: nowIso(),
    updated_at: nowIso(),
  });
}


export async function deleteJob(id: string): Promise<void> {
  if (!id || !isUuid(id)) return;
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in to delete a job.");

  let jobTitle: string | null = null;
  let workspaceId: string | null = null;

  const db = await getLocalDb();
  try {
    const doc = await db.jobs.findOne(id).exec();
    if (doc) {
      const row = toJobRow(doc.toMutableJSON());
      jobTitle = row.title;
      workspaceId = row.workspace_id;
      await doc.remove();
    }
  } catch (err) {
    console.warn("Could not remove local job doc:", err);
  }

  // Also query Supabase if we did not get workspaceId or title
  if (!workspaceId || !jobTitle) {
    try {
      const { data } = await (supabase as any)
        .from("jobs")
        .select("workspace_id, title")
        .eq("id", id)
        .maybeSingle();
      if (data) {
        if (!workspaceId) workspaceId = data.workspace_id;
        if (!jobTitle) jobTitle = data.title;
      }
    } catch (err) {
      console.warn("Could not query job before deletion:", err);
    }
  }

  // In case workspace_id was not on jobs, check survey_runs
  if (!workspaceId) {
    try {
      const { data: runDoc } = await (supabase as any)
        .from("survey_runs")
        .select("workspace_id")
        .or(`job_id.eq.${id},project_id.eq.${id}`)
        .limit(1)
        .maybeSingle();
      if (runDoc?.workspace_id) {
        workspaceId = runDoc.workspace_id;
      }
    } catch {
      // Ignore
    }
  }

  // Delete all associated Earth Observation data (storage files, deliverables, targets, and survey runs)
  if (workspaceId) {
    try {
      await deleteSurveyRunsForJob(workspaceId, id, jobTitle);
    } catch (err) {
      console.warn("Could not delete Earth Observation survey data for job:", err);
    }
  }

  // Delete directly from Supabase
  try {
    const { error } = await (supabase as any)
      .from("jobs")
      .delete()
      .eq("id", id);
    if (error) {
      console.warn("Could not hard delete job from Supabase, attempting soft delete:", error.message);
      await (supabase as any)
        .from("jobs")
        .update({ _deleted: true, updated_at: nowIso() })
        .eq("id", id);
    }
  } catch (err) {
    console.warn("Error deleting job from Supabase:", err);
  }
}
