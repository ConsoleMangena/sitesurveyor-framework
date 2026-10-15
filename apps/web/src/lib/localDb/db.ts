import { supabase } from "../supabase/client.ts";
import type {
  AssetDocType,
  AssetCalibrationDocType,
  AssetMaintenanceEventDocType,
  ContactDocType,
  ExpenseEntryDocType,
  JobAssignmentAssetDocType,
  JobAssignmentDocType,
  JobAssignmentMemberDocType,
  JobDocType,
  JobEventDocType,
  OrganizationDocType,
  ProjectDocType,
  TimeEntryDocType,
} from "./schemas.ts";

type SortDirection = "asc" | "desc";
type UpdatePatch<T> = Partial<T> | { $set: Record<string, unknown> };

export interface WmDoc<T extends object> {
  id: string;
  toMutableJSON(): T;
  update(patch: UpdatePatch<T>): Promise<WmDoc<T>>;
  incrementalPatch(patch: Partial<T>): Promise<WmDoc<T>>;
  remove(): Promise<void>;
}

export interface WmQuery<T extends object> {
  sort(sortObj: Record<string, SortDirection>): { exec(): Promise<WmDoc<T>[]> };
  exec(): Promise<WmDoc<T>[]>;
}

export interface WmFindOne<T extends object> {
  exec(): Promise<WmDoc<T> | null>;
}

export interface WmCollection<T extends object> {
  find(input?: { selector?: Record<string, unknown>; sort?: Record<string, SortDirection> }): WmQuery<T>;
  findOne(id: string): WmFindOne<T>;
  insert(data: T): Promise<WmDoc<T>>;
}

export interface LocalDb {
  projects: WmCollection<ProjectDocType>;
  organizations: WmCollection<OrganizationDocType>;
  contacts: WmCollection<ContactDocType>;
  assets: WmCollection<AssetDocType>;
  asset_calibrations: WmCollection<AssetCalibrationDocType>;
  asset_maintenance_events: WmCollection<AssetMaintenanceEventDocType>;
  time_entries: WmCollection<TimeEntryDocType>;
  expense_entries: WmCollection<ExpenseEntryDocType>;
  jobs: WmCollection<JobDocType>;
  job_events: WmCollection<JobEventDocType>;
  job_assignments: WmCollection<JobAssignmentDocType>;
  job_assignment_members: WmCollection<JobAssignmentMemberDocType>;
  job_assignment_assets: WmCollection<JobAssignmentAssetDocType>;
}

type AnyRow = Record<string, unknown> & { id: string };

function normalizePatch<T extends object>(patch: UpdatePatch<T>): Record<string, unknown> {
  const value = patch as Record<string, unknown>;
  return "$set" in value && value.$set && typeof value.$set === "object"
    ? (value.$set as Record<string, unknown>)
    : value;
}

function makeDoc<T extends object>(table: string, row: AnyRow): WmDoc<T> {
  let current = { ...row };
  const read = () => ({ ...current }) as T;

  return {
    id: current.id,
    toMutableJSON: read,
    update: async (patch) => {
      const changes = normalizePatch(patch);
      const { data, error } = await (supabase as any)
        .from(table)
        .update(changes)
        .eq("id", current.id)
        .select()
        .single();
      if (error) throw error;
      current = { ...current, ...(data as AnyRow) };
      return makeDoc<T>(table, current);
    },
    incrementalPatch: async (patch) => makeDoc<T>(table, current).update(patch),
    remove: async () => {
      const now = new Date().toISOString();
      const { error } = await (supabase as any)
        .from(table)
        .update({ _deleted: true, updated_at: now })
        .eq("id", current.id);
      if (error) throw error;
    },
  };
}

function makeCollection<T extends object>(table: string): WmCollection<T> {
  const find = (input: { selector?: Record<string, unknown>; sort?: Record<string, SortDirection> } = {}): WmQuery<T> => {
    const execute = async (extraSort?: Record<string, SortDirection>) => {
      let query = (supabase as any).from(table).select("*");
      for (const [key, value] of Object.entries(input.selector ?? {})) {
        if (value !== undefined) query = query.eq(key, value);
      }
      for (const [key, direction] of Object.entries({ ...input.sort, ...extraSort })) {
        query = query.order(key, { ascending: direction === "asc" });
      }
      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as AnyRow[]).map((row) => makeDoc<T>(table, row));
    };

    return {
      exec: () => execute(),
      sort: (sortObj) => ({ exec: () => execute(sortObj) }),
    };
  };

  return {
    find,
    findOne: (id) => ({
      exec: async () => {
        const { data, error } = await (supabase as any).from(table).select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        return data ? makeDoc<T>(table, data as AnyRow) : null;
      },
    }),
    insert: async (data) => {
      const { data: inserted, error } = await (supabase as any)
        .from(table)
        .insert(data)
        .select()
        .single();
      if (error) throw error;
      return makeDoc<T>(table, inserted as AnyRow);
    },
  };
}

export async function getLocalDatabase(_userId: string): Promise<LocalDb> {
  return {
    projects: makeCollection("projects"),
    organizations: makeCollection("organizations"),
    contacts: makeCollection("contacts"),
    assets: makeCollection("assets"),
    asset_calibrations: makeCollection("asset_calibrations"),
    asset_maintenance_events: makeCollection("asset_maintenance_events"),
    time_entries: makeCollection("time_entries"),
    expense_entries: makeCollection("expense_entries"),
    jobs: makeCollection("jobs"),
    job_events: makeCollection("job_events"),
    job_assignments: makeCollection("job_assignments"),
    job_assignment_members: makeCollection("job_assignment_members"),
    job_assignment_assets: makeCollection("job_assignment_assets"),
  };
}
