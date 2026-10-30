import { getCurrentSession } from "../auth/session.ts";
import type { Tables, TablesInsert, TablesUpdate } from "../supabase/types.ts";
import { getLocalDatabase, type LocalDb } from "../localDb/db.ts";
import { startWorkspaceSync } from "../localDb/sync.ts";
import { generateLocalId, nowIso, omitNullish } from "../localDb/utils.ts";
import type { JobEventDocType } from "../localDb/schemas.ts";

export type JobEventRow = Tables<"job_events">;
export type JobEventInsert = TablesInsert<"job_events">;
export type JobEventUpdate = TablesUpdate<"job_events">;

async function getLocalDb(workspaceId?: string): Promise<LocalDb> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in.");

  const db = await getLocalDatabase(session.user.id);
  if (workspaceId) {
    startWorkspaceSync(db, workspaceId);
  }
  return db;
}

function toJobEventRow(doc: JobEventDocType): JobEventRow {
  const { _deleted: _ignored, ...row } = doc;
  void _ignored;
  return row as JobEventRow;
}

export async function listJobEvents(
  workspaceId: string,
  options?: { jobId?: string },
): Promise<JobEventRow[]> {
  const session = await getCurrentSession();
  if (!session?.user) return [];

  const db = await getLocalDb(workspaceId);

  const selector: Record<string, unknown> = {
    workspace_id: workspaceId,
    _deleted: false,
  };
  if (options?.jobId) {
    selector.job_id = options.jobId;
  }

  const docs = await db.job_events
    .find({ selector })
    .sort({ event_date: "desc", created_at: "desc" })
    .exec();

  return docs.map((d) => toJobEventRow(d.toMutableJSON()));
}

export async function createJobEvent(
  workspaceId: string,
  input: Omit<JobEventInsert, "workspace_id" | "created_by">,
): Promise<JobEventRow> {
  const session = await getCurrentSession();
  if (!session?.user)
    throw new Error("You must be signed in to create a job event.");

  const db = await getLocalDb(workspaceId);

  const doc = await db.job_events.insert({
    id: generateLocalId(),
    workspace_id: workspaceId,
    created_by: session.user.id,
    created_at: nowIso(),
    updated_at: nowIso(),
    _deleted: false,
    title: input.title ?? "",
    event_type: input.event_type ?? "note",
    event_date: input.event_date,
    start_time: input.start_time ?? undefined,
    end_time: input.end_time ?? undefined,
    location: input.location ?? undefined,
    project_id: input.project_id ?? undefined,
    job_id: input.job_id ?? undefined,
    notes: input.notes ?? undefined,
  });

  return toJobEventRow(doc.toMutableJSON());
}

export async function updateJobEvent(
  id: string,
  patch: JobEventUpdate,
): Promise<JobEventRow> {
  const session = await getCurrentSession();
  if (!session?.user)
    throw new Error("You must be signed in to update a job event.");

  const db = await getLocalDb();
  const doc = await db.job_events.findOne(id).exec();
  if (!doc) throw new Error(`Job event not found: ${id}`);

  const { id: _id, ...safePatch } = patch;
  void _id;

  await doc.incrementalPatch({
    ...omitNullish(safePatch as unknown as Record<string, unknown>),
    updated_at: nowIso(),
  });

  return toJobEventRow(doc.toMutableJSON());
}

export async function deleteJobEvent(id: string): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.user)
    throw new Error("You must be signed in to delete a job event.");

  const db = await getLocalDb();
  const doc = await db.job_events.findOne(id).exec();
  if (!doc) throw new Error(`Job event not found: ${id}`);

  await doc.incrementalPatch({
    _deleted: true,
    updated_at: nowIso(),
  });
}
