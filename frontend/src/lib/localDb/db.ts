import { Database, Model, Q, type Collection, type RawRecord } from '@nozbe/watermelondb'
import LokiJSAdapterImport from '@nozbe/watermelondb/adapters/lokijs'

const LokiJSAdapter =
  (LokiJSAdapterImport as unknown as { default?: typeof LokiJSAdapterImport }).default ??
  LokiJSAdapterImport
import { wmSchema } from './wmSchema.ts'
import { migrations } from './migrations.ts'
import { generateLocalId } from './utils.ts'
import {
  Project,
  Organization,
  Contact,
  Asset,
  AssetCalibration,
  AssetMaintenanceEvent,
  TimeEntry,
  ExpenseEntry,
  Job,
  JobEvent,
  JobAssignment,
  JobAssignmentMember,
  JobAssignmentAsset,
} from './wmModels.ts'
import type {
  ProjectDocType,
  OrganizationDocType,
  ContactDocType,
  AssetDocType,
  AssetCalibrationDocType,
  AssetMaintenanceEventDocType,
  TimeEntryDocType,
  ExpenseEntryDocType,
  JobDocType,
  JobEventDocType,
  JobAssignmentDocType,
  JobAssignmentMemberDocType,
  JobAssignmentAssetDocType,
} from './schemas.ts'

// ── Document wrapper shape matching the repository API contract ─────────────

type SortDirection = 'asc' | 'desc'

// Compatibility update patch; the `$set` form is used in a few repositories.
type UpdatePatch<T> = Partial<T> | { $set: Record<string, unknown> }

export interface WmDoc<T extends object> {
  id: string
  toMutableJSON(): T
  update(patch: UpdatePatch<T>): Promise<WmDoc<T>>
  incrementalPatch(patch: Partial<T>): Promise<WmDoc<T>>
  remove(): Promise<void>
}

export interface WmQuery<T extends object> {
  sort(sortObj: Record<string, SortDirection>): { exec(): Promise<WmDoc<T>[]> }
  exec(): Promise<WmDoc<T>[]>
}

export interface WmFindOne<T extends object> {
  exec(): Promise<WmDoc<T> | null>
}

export interface WmCollection<T extends object> {
  find(input?: { selector?: Record<string, unknown>; sort?: Record<string, SortDirection> }): WmQuery<T>
  findOne(id: string): WmFindOne<T>
  insert(data: T): Promise<WmDoc<T>>
}

export interface LocalDb {
  /** Underlying WatermelonDB instance (used by sync). */
  readonly _wmDatabase: Database

  projects: WmCollection<ProjectDocType>
  organizations: WmCollection<OrganizationDocType>
  contacts: WmCollection<ContactDocType>
  assets: WmCollection<AssetDocType>
  asset_calibrations: WmCollection<AssetCalibrationDocType>
  asset_maintenance_events: WmCollection<AssetMaintenanceEventDocType>
  time_entries: WmCollection<TimeEntryDocType>
  expense_entries: WmCollection<ExpenseEntryDocType>
  jobs: WmCollection<JobDocType>
  job_events: WmCollection<JobEventDocType>
  job_assignments: WmCollection<JobAssignmentDocType>
  job_assignment_members: WmCollection<JobAssignmentMemberDocType>
  job_assignment_assets: WmCollection<JobAssignmentAssetDocType>
}

// ── Helpers for metadata / timestamp serialization ─────────────────────────

function toDbValue(key: string, value: unknown): unknown {
  if ((key === 'created_at' || key === 'updated_at') && typeof value === 'string') {
    const ms = Date.parse(value)
    return isNaN(ms) ? Date.now() : ms
  }
  if (key === 'metadata' && (typeof value === 'object' || value === null || value === undefined)) {
    return JSON.stringify(value ?? {})
  }
  return value
}

function fromDbValue(key: string, value: unknown): unknown {
  if ((key === 'created_at' || key === 'updated_at') && typeof value === 'number') {
    return new Date(value).toISOString()
  }
  if (key === 'metadata' && typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return {}
    }
  }
  return value
}

function deserializeRaw(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    out[key] = fromDbValue(key, value)
  }
  return out
}

function applyRaw(record: Model, raw: Record<string, unknown>): void {
  const model = record as unknown as { _setRaw: (key: string, value: unknown) => void }
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'id') continue
    model._setRaw(key, toDbValue(key, value))
  }
}

function normalizePatch<T extends object>(patch: UpdatePatch<T>): Record<string, unknown> {
  const p = patch as Record<string, unknown>
  if ('$set' in p && p.$set && typeof p.$set === 'object') {
    return p.$set as Record<string, unknown>
  }
  return p
}

function makeDoc<T extends object>(record: Model): WmDoc<T> {
  return {
    id: record.id,
    toMutableJSON: () => {
      const raw = { id: record.id, ...(record._raw as Record<string, unknown>) } as Record<string, unknown>
      return deserializeRaw(raw) as T
    },
    update: async (patch) => {
      const normalized = normalizePatch<T>(patch)
      await record.collection.database.write(async () => {
        await record.update((r) => applyRaw(r, normalized))
      })
      return makeDoc<T>(record)
    },
    incrementalPatch: async (patch) => {
      return makeDoc<T>(record).update(patch)
    },
    remove: async () => {
      const now = new Date().toISOString()
      await makeDoc<T>(record).update({ _deleted: true, updated_at: now } as unknown as UpdatePatch<T>)
    },
  }
}

function buildClauses(selector?: Record<string, unknown>): ReturnType<typeof Q.where>[] {
  if (!selector) return []
  const clauses: ReturnType<typeof Q.where>[] = []
  for (const [key, value] of Object.entries(selector)) {
    if (value === undefined) continue
    clauses.push(Q.where(key, value as never))
  }
  return clauses
}

function buildSort(sort?: Record<string, SortDirection>): ReturnType<typeof Q.sortBy>[] {
  if (!sort) return []
  return Object.entries(sort).map(([key, dir]) =>
    Q.sortBy(key, dir === 'asc' ? Q.asc : Q.desc),
  )
}

function makeCollection<T extends object>(collection: Collection<Model>): WmCollection<T> {
  return {
    find: (input = {}) => {
      const selector = { ...(input.selector ?? {}) }
      // Exclude deleted documents by default, just as the old store did.
      if (!('_deleted' in selector)) {
        selector._deleted = false
      }
      const baseClauses = buildClauses(selector)
      const baseSort = buildSort(input.sort)

      const makeQuery = () => collection.query(...baseClauses, ...baseSort)

      return {
        sort: (extraSort) => {
          const extraSortClauses = buildSort(extraSort)
          const query = collection.query(...baseClauses, ...baseSort, ...extraSortClauses)
          return {
            exec: async () => {
              const records = await query.fetch()
              return records.map((r) => makeDoc<T>(r))
            },
          }
        },
        exec: async () => {
          const records = await makeQuery().fetch()
          return records.map((r) => makeDoc<T>(r))
        },
      }
    },
    findOne: (id) => ({
      exec: async () => {
        try {
          const record = await collection.find(id)
          return makeDoc<T>(record)
        } catch {
          return null
        }
      },
    }),
    insert: async (data) => {
      const raw = { ...(data as Record<string, unknown>) } as Record<string, unknown>
      if (!raw.id) {
        raw.id = generateLocalId()
      }
      raw._deleted = raw._deleted ?? false
      for (const key of Object.keys(raw)) {
        raw[key] = toDbValue(key, raw[key])
      }

      const record = await collection.database.write(async () => {
        const prepared = collection.prepareCreateFromDirtyRaw(raw as RawRecord)
        await collection.database.batch(prepared)
        return prepared
      })
      return makeDoc<T>(record)
    },
  }
}

// ── Singleton database per user ────────────────────────────────────────────

let databasePromise: Promise<LocalDb> | null = null
let databaseUserId: string | null = null
const wmDatabaseByUser = new Map<string, Database>()

export async function getLocalDatabase(userId: string): Promise<LocalDb> {
  if (databasePromise && databaseUserId === userId) {
    return databasePromise
  }

  if (databasePromise && databaseUserId !== userId) {
    const old = await databasePromise
    if (old._wmDatabase) {
      await ((old._wmDatabase.adapter as unknown as { dangerouslyResetDatabase?: () => Promise<void> }).dangerouslyResetDatabase?.() ?? Promise.resolve())
        .catch(() => null)
    }
    wmDatabaseByUser.delete(databaseUserId!)
    databasePromise = null
  }

  databaseUserId = userId
  databasePromise = (async (): Promise<LocalDb> => {
    const wmDb = new Database({
      adapter: new LokiJSAdapter({
        schema: wmSchema,
        migrations,
        useWebWorker: false,
        useIncrementalIndexedDB: true,
      }),
      modelClasses: [
        Project,
        Organization,
        Contact,
        Asset,
        AssetCalibration,
        AssetMaintenanceEvent,
        TimeEntry,
        ExpenseEntry,
        Job,
        JobEvent,
        JobAssignment,
        JobAssignmentMember,
        JobAssignmentAsset,
      ],
    })

    wmDatabaseByUser.set(userId, wmDb)

    return {
      _wmDatabase: wmDb,
      projects: makeCollection<ProjectDocType>(wmDb.get('projects')),
      organizations: makeCollection<OrganizationDocType>(wmDb.get('organizations')),
      contacts: makeCollection<ContactDocType>(wmDb.get('contacts')),
      assets: makeCollection<AssetDocType>(wmDb.get('assets')),
      asset_calibrations: makeCollection<AssetCalibrationDocType>(wmDb.get('asset_calibrations')),
      asset_maintenance_events: makeCollection<AssetMaintenanceEventDocType>(wmDb.get('asset_maintenance_events')),
      time_entries: makeCollection<TimeEntryDocType>(wmDb.get('time_entries')),
      expense_entries: makeCollection<ExpenseEntryDocType>(wmDb.get('expense_entries')),
      jobs: makeCollection<JobDocType>(wmDb.get('jobs')),
      job_events: makeCollection<JobEventDocType>(wmDb.get('job_events')),
      job_assignments: makeCollection<JobAssignmentDocType>(wmDb.get('job_assignments')),
      job_assignment_members: makeCollection<JobAssignmentMemberDocType>(wmDb.get('job_assignment_members')),
      job_assignment_assets: makeCollection<JobAssignmentAssetDocType>(wmDb.get('job_assignment_assets')),
    }
  })()

  return databasePromise
}
