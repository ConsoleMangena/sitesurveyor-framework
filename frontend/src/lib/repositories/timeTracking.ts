import { getCurrentSession } from "../auth/session.ts";
import { getLocalDatabase, type LocalDb } from "../localDb/db.ts";
import { startWorkspaceSync } from "../localDb/sync.ts";
import { generateLocalId, nowIso, omitNullish } from "../localDb/utils.ts";
import type {
  ExpenseEntryDocType,
  TimeEntryDocType,
} from "../localDb/schemas.ts";

export interface TimeEntryRow {
  id: string;
  workspace_id: string;
  user_id: string;
  project_id: string | null;
  entry_date: string;
  task: string;
  hours: number;
  billable: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  projects?: { name: string | null } | null;
}

export interface ExpenseEntryRow {
  id: string;
  workspace_id: string;
  user_id: string;
  project_id: string | null;
  entry_date: string;
  category: string;
  amount: number;
  vendor: string | null;
  reimbursable: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  projects?: { name: string | null } | null;
}

type TimeEntryInsert = Pick<
  TimeEntryRow,
  "entry_date" | "task" | "hours" | "billable" | "project_id" | "notes"
>;

type ExpenseEntryInsert = Pick<
  ExpenseEntryRow,
  "entry_date" | "category" | "amount" | "vendor" | "reimbursable" | "project_id" | "notes"
>;

async function getLocalDb(workspaceId?: string): Promise<LocalDb> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in.");

  const db = await getLocalDatabase(session.user.id);
  if (workspaceId) {
    startWorkspaceSync(db, workspaceId);
  }
  return db;
}

function toTimeEntryRow(doc: TimeEntryDocType): TimeEntryRow {
  const { _deleted: _ignored, ...row } = doc;
  void _ignored;
  return {
    ...row,
    project_id: row.project_id ?? null,
    notes: row.notes ?? null,
  };
}

function toExpenseEntryRow(doc: ExpenseEntryDocType): ExpenseEntryRow {
  const { _deleted: _ignored, ...row } = doc;
  void _ignored;
  return {
    ...row,
    project_id: row.project_id ?? null,
    vendor: row.vendor ?? null,
    notes: row.notes ?? null,
  };
}

export async function listTimeEntries(workspaceId: string): Promise<TimeEntryRow[]> {
  const session = await getCurrentSession();
  if (!session?.user) return [];

  const db = await getLocalDb(workspaceId);

  const docs = await db.time_entries
    .find({
      selector: {
        workspace_id: workspaceId,
        user_id: session.user.id,
        _deleted: false,
      },
    })
    .sort({ entry_date: "desc", created_at: "desc" })
    .exec();

  const projectDocs = await db.projects
    .find({ selector: { workspace_id: workspaceId, _deleted: false } })
    .exec();
  const projectMap = new Map(projectDocs.map((d) => [d.id, d.toMutableJSON()]));

  return docs.map((d) => {
    const row = toTimeEntryRow(d.toMutableJSON());
    const project = row.project_id ? projectMap.get(row.project_id) : undefined;
    return {
      ...row,
      projects: project ? { name: project.name } : null,
    };
  });
}

export async function listExpenseEntries(workspaceId: string): Promise<ExpenseEntryRow[]> {
  const session = await getCurrentSession();
  if (!session?.user) return [];

  const db = await getLocalDb(workspaceId);

  const docs = await db.expense_entries
    .find({
      selector: {
        workspace_id: workspaceId,
        user_id: session.user.id,
        _deleted: false,
      },
    })
    .sort({ entry_date: "desc", created_at: "desc" })
    .exec();

  const projectDocs = await db.projects
    .find({ selector: { workspace_id: workspaceId, _deleted: false } })
    .exec();
  const projectMap = new Map(projectDocs.map((d) => [d.id, d.toMutableJSON()]));

  return docs.map((d) => {
    const row = toExpenseEntryRow(d.toMutableJSON());
    const project = row.project_id ? projectMap.get(row.project_id) : undefined;
    return {
      ...row,
      projects: project ? { name: project.name } : null,
    };
  });
}

export async function createTimeEntry(
  workspaceId: string,
  input: TimeEntryInsert,
): Promise<TimeEntryRow> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in to log time.");

  const db = await getLocalDb(workspaceId);

  const doc = await db.time_entries.insert({
    id: generateLocalId(),
    workspace_id: workspaceId,
    user_id: session.user.id,
    created_at: nowIso(),
    updated_at: nowIso(),
    _deleted: false,
    entry_date: input.entry_date,
    task: input.task,
    hours: input.hours,
    billable: input.billable,
    project_id: input.project_id ?? undefined,
    notes: input.notes ?? undefined,
  });

  return toTimeEntryRow(doc.toMutableJSON());
}

export async function createExpenseEntry(
  workspaceId: string,
  input: ExpenseEntryInsert,
): Promise<ExpenseEntryRow> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in to log expenses.");

  const db = await getLocalDb(workspaceId);

  const doc = await db.expense_entries.insert({
    id: generateLocalId(),
    workspace_id: workspaceId,
    user_id: session.user.id,
    created_at: nowIso(),
    updated_at: nowIso(),
    _deleted: false,
    entry_date: input.entry_date,
    category: input.category,
    amount: input.amount,
    vendor: input.vendor ?? undefined,
    reimbursable: input.reimbursable,
    project_id: input.project_id ?? undefined,
    notes: input.notes ?? undefined,
  });

  return toExpenseEntryRow(doc.toMutableJSON());
}

export async function updateTimeEntry(
  id: string,
  patch: Partial<TimeEntryInsert>,
): Promise<TimeEntryRow> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in to update a time entry.");

  const db = await getLocalDb();
  const doc = await db.time_entries.findOne(id).exec();
  if (!doc) throw new Error(`Time entry not found: ${id}`);

  await doc.incrementalPatch({
    ...omitNullish(patch as unknown as Record<string, unknown>),
    updated_at: nowIso(),
  });

  return toTimeEntryRow(doc.toMutableJSON());
}

export async function updateExpenseEntry(
  id: string,
  patch: Partial<ExpenseEntryInsert>,
): Promise<ExpenseEntryRow> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in to update an expense entry.");

  const db = await getLocalDb();
  const doc = await db.expense_entries.findOne(id).exec();
  if (!doc) throw new Error(`Expense entry not found: ${id}`);

  await doc.incrementalPatch({
    ...omitNullish(patch as unknown as Record<string, unknown>),
    updated_at: nowIso(),
  });

  return toExpenseEntryRow(doc.toMutableJSON());
}

export async function deleteTimeEntry(id: string): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in to delete a time entry.");

  const db = await getLocalDb();
  const doc = await db.time_entries.findOne(id).exec();
  if (!doc) throw new Error(`Time entry not found: ${id}`);

  await doc.incrementalPatch({
    _deleted: true,
    updated_at: nowIso(),
  });
}

export async function deleteExpenseEntry(id: string): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in to delete an expense entry.");

  const db = await getLocalDb();
  const doc = await db.expense_entries.findOne(id).exec();
  if (!doc) throw new Error(`Expense entry not found: ${id}`);

  await doc.incrementalPatch({
    _deleted: true,
    updated_at: nowIso(),
  });
}
