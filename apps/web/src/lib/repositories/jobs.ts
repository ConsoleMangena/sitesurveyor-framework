import { getCurrentSession } from "../auth/session.ts";
import type { Tables, TablesInsert, TablesUpdate } from "../supabase/types.ts";
import { getLocalDatabase, type LocalDb } from "../localDb/db.ts";
import { startWorkspaceSync } from "../localDb/sync.ts";
import { generateLocalId, nowIso, omitNullish } from "../localDb/utils.ts";
import type { JobDocType } from "../localDb/schemas.ts";

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
    status: input.status ?? "draft",
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
