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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(val: unknown): val is string {
  return typeof val === "string" && UUID_REGEX.test(val);
}

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
      const selector = input.selector ?? {};

      // If any ID column (id or *_id) is queried with an invalid UUID string,
      // Postgres UUID validation fails with HTTP 400. Return [] immediately.
      for (const [key, value] of Object.entries(selector)) {
        if (key === "id" || key.endsWith("_id")) {
          if (typeof value === "string" && !isUuid(value)) {
            return [];
          }
          if (value && typeof value === "object" && "$in" in value && Array.isArray((value as any).$in)) {
            const valid = (value as any).$in.filter((v: unknown) => isUuid(v));
            if (valid.length === 0) return [];
            (value as any).$in = valid;
          }
        }
      }

      let query = (supabase as any).from(table).select("*");
      for (const [key, value] of Object.entries(selector)) {
        if (value === undefined) continue;

        if (value === null) {
          query = query.is(key, null);
        } else if (typeof value === "object" && !Array.isArray(value)) {
          // Support Mongo-style operators: $ne, $in, $nin, $gt, $gte, $lt, $lte
          const opObj = value as Record<string, unknown>;
          if ("$ne" in opObj) {
            query = query.neq(key, opObj.$ne);
          }
          if ("$in" in opObj && Array.isArray(opObj.$in)) {
            query = query.in(key, opObj.$in);
          }
          if ("$nin" in opObj && Array.isArray(opObj.$nin)) {
            query = query.not(key, "in", `(${opObj.$nin.join(",")})`);
          }
          if ("$gt" in opObj) {
            query = query.gt(key, opObj.$gt);
          }
          if ("$gte" in opObj) {
            query = query.gte(key, opObj.$gte);
          }
          if ("$lt" in opObj) {
            query = query.lt(key, opObj.$lt);
          }
          if ("$lte" in opObj) {
            query = query.lte(key, opObj.$lte);
          }
        } else {
          query = query.eq(key, value);
        }
      }
      for (const [key, direction] of Object.entries({ ...input.sort, ...extraSort })) {
        query = query.order(key, { ascending: direction === "asc" });
      }

      try {
        const { data, error } = await query;
        if (error) {
          console.warn(`Query on table ${table} failed:`, error.message || error);
          return [];
        }
        return ((data ?? []) as AnyRow[]).map((row) => makeDoc<T>(table, row));
      } catch (err) {
        console.warn(`Unexpected error querying table ${table}:`, err);
        return [];
      }
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
        if (!id || !isUuid(id)) return null;
        try {
          const { data, error } = await (supabase as any).from(table).select("*").eq("id", id).maybeSingle();
          if (error) {
            console.warn(`findOne on table ${table} failed:`, error.message || error);
            return null;
          }
          return data ? makeDoc<T>(table, data as AnyRow) : null;
        } catch (err) {
          console.warn(`Unexpected error in findOne on table ${table}:`, err);
          return null;
        }
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
