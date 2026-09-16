import { getCurrentSession } from "../auth/session.ts";
import type { Tables, TablesInsert, TablesUpdate } from "../supabase/types.ts";
import { getLocalDatabase, type LocalDb } from "../localDb/db.ts";
import { startWorkspaceSync } from "../localDb/sync.ts";
import { generateLocalId, nowIso, omitNullish } from "../localDb/utils.ts";
import type {
  JobAssignmentDocType,
  JobAssignmentMemberDocType,
  JobAssignmentAssetDocType,
} from "../localDb/schemas.ts";

export type JobAssignmentRow = Tables<"job_assignments">;
export type JobAssignmentInsert = TablesInsert<"job_assignments">;
export type JobAssignmentUpdate = TablesUpdate<"job_assignments">;

export interface JobAssignmentPayload {
  project_id: string;
  job_id?: string | null;
  assignment_date: string;
  notes?: string | null;
  status?: string;
}

export interface AssignmentWithDetails extends JobAssignmentRow {
  project_name: string | null;
  job_title: string | null;
  member_ids: string[];
  asset_ids: string[];
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

function toAssignmentRow(doc: JobAssignmentDocType): JobAssignmentRow {
  const { _deleted: _ignored, ...row } = doc;
  void _ignored;
  return row as JobAssignmentRow;
}

function toAssignmentWithDetails(
  assignment: JobAssignmentRow,
  projectName: string | null,
  jobTitle: string | null,
  members: JobAssignmentMemberDocType[],
  assets: JobAssignmentAssetDocType[],
): AssignmentWithDetails {
  return {
    ...assignment,
    project_name: projectName,
    job_title: jobTitle,
    member_ids: members
      .filter((m) => !m._deleted)
      .map((m) => m.workspace_member_id),
    asset_ids: assets.filter((a) => !a._deleted).map((a) => a.asset_id),
  };
}

export async function listJobAssignments(
  workspaceId: string,
): Promise<AssignmentWithDetails[]> {
  const session = await getCurrentSession();
  if (!session?.user) return [];

  const db = await getLocalDb(workspaceId);

  const [assignments, members, assets, projects, jobs] = await Promise.all([
    db.job_assignments
      .find({
        selector: { workspace_id: workspaceId, _deleted: false },
      })
      .sort({ assignment_date: "desc" })
      .exec(),
    db.job_assignment_members
      .find({
        selector: { workspace_id: workspaceId, _deleted: false },
      })
      .exec(),
    db.job_assignment_assets
      .find({
        selector: { workspace_id: workspaceId, _deleted: false },
      })
      .exec(),
    db.projects
      .find({ selector: { workspace_id: workspaceId, _deleted: false } })
      .exec(),
    db.jobs.find({ selector: { workspace_id: workspaceId, _deleted: false } }).exec(),
  ]);

  const projectMap = new Map(projects.map((p) => [p.id, p.toMutableJSON()]));
  const jobMap = new Map(jobs.map((j) => [j.id, j.toMutableJSON()]));
  const membersByAssignment = new Map<string, JobAssignmentMemberDocType[]>();
  const assetsByAssignment = new Map<string, JobAssignmentAssetDocType[]>();

  for (const m of members) {
    const row = m.toMutableJSON();
    const arr = membersByAssignment.get(row.assignment_id) ?? [];
    arr.push(row);
    membersByAssignment.set(row.assignment_id, arr);
  }
  for (const a of assets) {
    const row = a.toMutableJSON();
    const arr = assetsByAssignment.get(row.assignment_id) ?? [];
    arr.push(row);
    assetsByAssignment.set(row.assignment_id, arr);
  }

  return assignments.map((d) => {
    const row = toAssignmentRow(d.toMutableJSON());
    const project = row.project_id ? projectMap.get(row.project_id) : undefined;
    const job = row.job_id ? jobMap.get(row.job_id) : undefined;
    return toAssignmentWithDetails(
      row,
      project?.name ?? null,
      job?.title ?? null,
      membersByAssignment.get(row.id) ?? [],
      assetsByAssignment.get(row.id) ?? [],
    );
  });
}

export async function getJobAssignment(id: string): Promise<AssignmentWithDetails | null> {
  const session = await getCurrentSession();
  if (!session?.user) return null;

  const db = await getLocalDb();

  const assignmentDoc = await db.job_assignments.findOne(id).exec();
  if (!assignmentDoc) return null;

  const row = toAssignmentRow(assignmentDoc.toMutableJSON());
  const [members, assets, project, job] = await Promise.all([
    db.job_assignment_members
      .find({ selector: { assignment_id: id, _deleted: false } })
      .exec(),
    db.job_assignment_assets
      .find({ selector: { assignment_id: id, _deleted: false } })
      .exec(),
    row.project_id ? db.projects.findOne(row.project_id).exec() : null,
    row.job_id ? db.jobs.findOne(row.job_id).exec() : null,
  ]);

  return toAssignmentWithDetails(
    row,
    project?.toMutableJSON().name ?? null,
    job?.toMutableJSON().title ?? null,
    members.map((m) => m.toMutableJSON()),
    assets.map((a) => a.toMutableJSON()),
  );
}

export async function createJobAssignment(
  workspaceId: string,
  payload: JobAssignmentPayload,
  memberIds: string[],
  assetIds: string[],
): Promise<AssignmentWithDetails> {
  const session = await getCurrentSession();
  if (!session?.user)
    throw new Error("You must be signed in to create an assignment.");

  const db = await getLocalDb(workspaceId);
  const now = nowIso();

  const assignmentDoc = await db.job_assignments.insert({
    id: generateLocalId(),
    workspace_id: workspaceId,
    created_by: session.user.id,
    project_id: payload.project_id,
    job_id: payload.job_id ?? undefined,
    assignment_date: payload.assignment_date,
    status: payload.status ?? "confirmed",
    notes: payload.notes ?? undefined,
    created_at: now,
    updated_at: now,
    _deleted: false,
  });

  const assignment = toAssignmentRow(assignmentDoc.toMutableJSON());

  await Promise.all(
    memberIds.map((memberId) =>
      db.job_assignment_members.insert({
        id: generateLocalId(),
        workspace_id: workspaceId,
        assignment_id: assignment.id,
        workspace_member_id: memberId,
        assignment_role: null,
        created_at: now,
        updated_at: now,
        _deleted: false,
      }),
    ),
  );

  await Promise.all(
    assetIds.map((assetId) =>
      db.job_assignment_assets.insert({
        id: generateLocalId(),
        workspace_id: workspaceId,
        assignment_id: assignment.id,
        asset_id: assetId,
        created_at: now,
        updated_at: now,
        _deleted: false,
      }),
    ),
  );

  return getJobAssignment(assignment.id) as Promise<AssignmentWithDetails>;
}

export async function updateJobAssignment(
  id: string,
  patch: Partial<JobAssignmentInsert>,
): Promise<JobAssignmentRow> {
  const session = await getCurrentSession();
  if (!session?.user)
    throw new Error("You must be signed in to update an assignment.");

  const db = await getLocalDb();
  const doc = await db.job_assignments.findOne(id).exec();
  if (!doc) throw new Error(`Assignment not found: ${id}`);

  await doc.incrementalPatch({
    ...omitNullish(patch as unknown as Record<string, unknown>),
    updated_at: nowIso(),
  });

  return toAssignmentRow(doc.toMutableJSON());
}

export async function deleteJobAssignment(id: string): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.user)
    throw new Error("You must be signed in to delete an assignment.");

  const db = await getLocalDb();
  const doc = await db.job_assignments.findOne(id).exec();
  if (!doc) throw new Error(`Assignment not found: ${id}`);

  const now = nowIso();
  await doc.incrementalPatch({
    _deleted: true,
    updated_at: now,
  });

  const [members, assets] = await Promise.all([
    db.job_assignment_members
      .find({ selector: { assignment_id: id, _deleted: false } })
      .exec(),
    db.job_assignment_assets
      .find({ selector: { assignment_id: id, _deleted: false } })
      .exec(),
  ]);

  await Promise.all(members.map((m) => m.incrementalPatch({ _deleted: true, updated_at: now })));
  await Promise.all(assets.map((a) => a.incrementalPatch({ _deleted: true, updated_at: now })));
}

export async function replaceAssignmentMembers(
  workspaceId: string,
  assignmentId: string,
  memberIds: string[],
): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.user)
    throw new Error("You must be signed in to update assignment members.");

  const db = await getLocalDb(workspaceId);
  const now = nowIso();

  const existing = await db.job_assignment_members
    .find({ selector: { workspace_id: workspaceId, assignment_id: assignmentId, _deleted: false } })
    .exec();

  await Promise.all(
    existing.map((m) => m.incrementalPatch({ _deleted: true, updated_at: now })),
  );

  await Promise.all(
    memberIds.map((memberId) =>
      db.job_assignment_members.insert({
        id: generateLocalId(),
        workspace_id: workspaceId,
        assignment_id: assignmentId,
        workspace_member_id: memberId,
        assignment_role: null,
        created_at: now,
        updated_at: now,
        _deleted: false,
      }),
    ),
  );
}

export async function replaceAssignmentAssets(
  workspaceId: string,
  assignmentId: string,
  assetIds: string[],
): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.user)
    throw new Error("You must be signed in to update assignment assets.");

  const db = await getLocalDb(workspaceId);
  const now = nowIso();

  const existing = await db.job_assignment_assets
    .find({ selector: { workspace_id: workspaceId, assignment_id: assignmentId, _deleted: false } })
    .exec();

  await Promise.all(
    existing.map((a) => a.incrementalPatch({ _deleted: true, updated_at: now })),
  );

  await Promise.all(
    assetIds.map((assetId) =>
      db.job_assignment_assets.insert({
        id: generateLocalId(),
        workspace_id: workspaceId,
        assignment_id: assignmentId,
        asset_id: assetId,
        created_at: now,
        updated_at: now,
        _deleted: false,
      }),
    ),
  );
}

export async function deleteAllWorkspaceAssignments(workspaceId: string): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.user)
    throw new Error("You must be signed in to delete assignments.");

  const db = await getLocalDb(workspaceId);
  const assignments = await db.job_assignments
    .find({ selector: { workspace_id: workspaceId, _deleted: false } })
    .exec();
  await Promise.all(assignments.map((a) => deleteJobAssignment(a.id)));
}
