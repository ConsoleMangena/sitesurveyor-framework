import { synchronize } from '@nozbe/watermelondb/sync'
import { Q, Model } from '@nozbe/watermelondb'
import type { Database } from '@nozbe/watermelondb'
import type { DirtyRaw } from '@nozbe/watermelondb'
import type {
  SyncPullArgs,
  SyncPullResult,
  SyncPushArgs,
  SyncDatabaseChangeSet,
  SyncTableChangeSet,
  Timestamp,
} from '@nozbe/watermelondb/sync'
import { BehaviorSubject } from 'rxjs'
import { isOnline, supabase } from '../supabase/client.ts'
import type { LocalDb } from './db.ts'

export type OfflineSyncState = 'idle' | 'syncing' | 'synced' | 'error'

export interface OfflineSyncStatus {
  status: OfflineSyncState
  lastError?: string
}

export const offlineSyncStatus$ = new BehaviorSubject<OfflineSyncStatus>({
  status: 'idle',
})

const SYNC_TABLES = [
  // Parent tables must sync before children so foreign-key pushes succeed.
  'organizations',
  'contacts',
  'assets',
  'asset_calibrations',
  'asset_maintenance_events',
  'projects',
  'time_entries',
  'expense_entries',
  'jobs',
  'job_events',
  'job_assignments',
  'job_assignment_members',
  'job_assignment_assets',
] as const

const activeIntervals = new Map<string, ReturnType<typeof setInterval>>()
const pendingSyncs = new Map<string, Promise<void>>()

/** Time cap for a single sync pull/push run before we abort the UI wait. */
const SYNC_TIMEOUT_MS = 30000

function recomputeStatus(lastError?: string) {
  // The interval timer is not an active sync; only pending sync runs should
  // keep the UI indicator in the "syncing" state.
  const anyActive = pendingSyncs.size > 0

  if (lastError) {
    offlineSyncStatus$.next({ status: 'error', lastError })
    return
  }

  offlineSyncStatus$.next({ status: anyActive ? 'syncing' : 'synced' })
}

function isAppVisible(): boolean {
  if (typeof document === 'undefined') return true
  return !document.hidden
}

function nowTs(): Timestamp {
  return Math.floor(Date.now() / 1000)
}

function tsToIso(ts: Timestamp): string | null {
  if (!ts) return null
  return new Date(ts * 1000).toISOString()
}

function cleanServerRow(tableName: string, row: Record<string, unknown>): DirtyRaw {
  const raw = { ...row } as Record<string, unknown>
  if (tableName === 'assets' && raw.metadata && typeof raw.metadata === 'object') {
    raw.metadata = JSON.stringify(raw.metadata)
  }
  raw._deleted = row._deleted ?? false
  if (typeof raw.created_at === 'string') {
    raw.created_at = Date.parse(raw.created_at)
  }
  if (typeof raw.updated_at === 'string') {
    raw.updated_at = Date.parse(raw.updated_at)
  }
  return raw as DirtyRaw
}

function applyProjectDefaults(payload: Record<string, unknown>): void {
  if (payload.axis_convention == null) payload.axis_convention = 'yx'
  if (payload.crs_type == null) payload.crs_type = 'local'
  if (payload.local_origin_e == null) payload.local_origin_e = 0
  if (payload.local_origin_n == null) payload.local_origin_n = 0
  if (payload.bearing_format == null) payload.bearing_format = 'azimuth'
  if (payload.angle_entry == null) payload.angle_entry = 'packed'
  if (payload.coord_decimals == null) payload.coord_decimals = 3
}

function preparePayload(tableName: string, raw: Record<string, unknown>, isCreated = false): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  // Include `id` for newly-created records so Supabase uses the same UUID the
  // local database generated. This keeps child foreign-key references intact
  // (e.g. projects.organization_id -> organizations.id).
  const skip = new Set<string>(['_status', '_changed', '_raw'])
  if (!isCreated) skip.add('id')

  for (const [key, value] of Object.entries(raw)) {
    if (skip.has(key)) continue
    if (key === 'metadata' && tableName === 'assets' && typeof value === 'string') {
      try {
        payload[key] = JSON.parse(value)
      } catch {
        payload[key] = {}
      }
    } else if (key === 'created_at' || key === 'updated_at') {
      if (typeof value === 'number') {
        payload[key] = new Date(value).toISOString()
      } else if (value !== undefined) {
        payload[key] = value
      }
    } else if (value !== undefined) {
      payload[key] = value
    }
  }

  if (isCreated && (!payload.created_at || typeof payload.created_at !== 'string')) {
    payload.created_at = new Date().toISOString()
  }
  payload.updated_at = new Date().toISOString()

  // The Supabase projects table has NOT NULL defaults for these columns. If a
  // local record has explicit NULLs (e.g. from a pre-migration insert),
  // substitute the defaults so the push succeeds.
  if (tableName === 'projects') {
    applyProjectDefaults(payload)
  }

  return payload
}

function typedChangeSet(changes: SyncDatabaseChangeSet): Record<string, SyncTableChangeSet> {
  return changes as unknown as Record<string, SyncTableChangeSet>
}

function supabaseTable(tableName: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from(tableName)
}

interface ForeignKeyMapping {
  table: string
  field: string
  refTable: string
}

/** Fields that reference other synced tables and must be validated before push. */
const FOREIGN_KEYS: ForeignKeyMapping[] = [
  { table: 'contacts', field: 'organization_id', refTable: 'organizations' },
  { table: 'projects', field: 'organization_id', refTable: 'organizations' },
  { table: 'jobs', field: 'project_id', refTable: 'projects' },
  { table: 'job_events', field: 'project_id', refTable: 'projects' },
  { table: 'job_events', field: 'job_id', refTable: 'jobs' },
  { table: 'job_assignments', field: 'project_id', refTable: 'projects' },
  { table: 'job_assignments', field: 'job_id', refTable: 'jobs' },
  { table: 'job_assignment_assets', field: 'assignment_id', refTable: 'job_assignments' },
  { table: 'job_assignment_assets', field: 'asset_id', refTable: 'assets' },
  { table: 'asset_calibrations', field: 'asset_id', refTable: 'assets' },
  { table: 'asset_maintenance_events', field: 'asset_id', refTable: 'assets' },
  { table: 'time_entries', field: 'project_id', refTable: 'projects' },
  { table: 'expense_entries', field: 'project_id', refTable: 'projects' },
]

async function getExistingIds(wmDatabase: Database, tableName: string): Promise<Set<string>> {
  try {
    const records = await wmDatabase.collections.get(tableName).query().fetch()
    return new Set(records.map((r) => r.id))
  } catch {
    return new Set()
  }
}

/**
 * Prevent pushing foreign keys that no longer exist locally (e.g. a parent was
 * soft-deleted on the server). For inserts the FK is nulled; for updates the
 * field is omitted so the server keeps its current value. The next pull will
 * bring the local records back into sync with the server.
 */
async function sanitizeStaleForeignKeys(
  wmDatabase: Database,
  changes: SyncDatabaseChangeSet,
): Promise<void> {
  const typedChanges = typedChangeSet(changes)
  const existingIdCache: Record<string, Set<string>> = {}

  async function exists(refTable: string, id: string): Promise<boolean> {
    if (!existingIdCache[refTable]) {
      existingIdCache[refTable] = await getExistingIds(wmDatabase, refTable)
    }
    return existingIdCache[refTable].has(id)
  }

  for (const { table, field, refTable } of FOREIGN_KEYS) {
    const ops = typedChanges[table]
    if (!ops) continue

    for (const created of ops.created) {
      const row = created as Record<string, unknown>
      const value = row[field]
      if (value === undefined || value === null) continue
      if (!(await exists(refTable, String(value)))) {
        console.warn(`[sync] clearing stale ${table}.${field}=${value} (refs missing ${refTable}) before create`)
        row[field] = null
      }
    }

    for (const updated of ops.updated) {
      const row = updated as Record<string, unknown>
      const value = row[field]
      if (value === undefined || value === null) continue
      if (!(await exists(refTable, String(value)))) {
        console.warn(`[sync] omitting stale ${table}.${field}=${value} (refs missing ${refTable}) from update`)
        delete row[field]
      }
    }
  }
}

/**
 * Before pushing local changes, repair foreign keys that point to parent records
 * which no longer exist on the current server (e.g. stale IndexedDB data from a
 * previous environment). FKs referencing locally-created parents are kept,
 * because those parents are pushed before children in dependency order.
 */
async function repairStaleForeignKeys(wmDatabase: Database): Promise<void> {
  if (!isOnline()) {
    console.log('[sync] repairStaleForeignKeys skipped: offline')
    return
  }
  console.log('[sync] repairStaleForeignKeys starting')
  const recordsByTable: Record<string, unknown[]> = {}
  const pendingCreatedIds: Record<string, Set<string>> = {}
  const fkValuesByRef: Record<string, Set<string>> = {}

  for (const { table, refTable } of FOREIGN_KEYS) {
    if (!recordsByTable[table]) {
      try {
        const collection = wmDatabase.collections.get(table)
        const created = await collection.query(Q.where('_status', 'created')).fetch()
        const updated = await collection.query(Q.where('_status', 'updated')).fetch()
        recordsByTable[table] = [...created, ...updated]
        console.log(`[sync] ${table}: ${created.length} created + ${updated.length} updated dirty records`)
      } catch (err) {
        console.warn(`[sync] failed to fetch dirty ${table}:`, err)
        recordsByTable[table] = []
      }
    }
    if (!pendingCreatedIds[refTable]) {
      try {
        const refCollection = wmDatabase.collections.get(refTable)
        const created = await refCollection.query(Q.where('_status', 'created')).fetch()
        pendingCreatedIds[refTable] = new Set(created.map((r) => r.id))
        console.log(`[sync] ${refTable}: ${created.length} pending-created parent records`)
      } catch (err) {
        console.warn(`[sync] failed to fetch pending-created ${refTable}:`, err)
        pendingCreatedIds[refTable] = new Set()
      }
    }
  }

  for (const { table, field, refTable } of FOREIGN_KEYS) {
    for (const record of recordsByTable[table] ?? []) {
      const raw = (record as { _raw: Record<string, unknown> })._raw
      const value = raw[field]
      if (value === undefined || value === null || value === '') continue
      const id = String(value)
      if (pendingCreatedIds[refTable].has(id)) {
        console.log(`[sync] ${table}#${(record as { id: string }).id} ${field}=${id} is pending-created ${refTable}, keeping`)
        continue
      }
      if (!fkValuesByRef[refTable]) fkValuesByRef[refTable] = new Set()
      fkValuesByRef[refTable].add(id)
    }
  }

  const validIdsByRef: Record<string, Set<string>> = {}
  for (const refTable of Object.keys(fkValuesByRef)) {
    const ids = [...fkValuesByRef[refTable]]
    validIdsByRef[refTable] = new Set(pendingCreatedIds[refTable])
    if (ids.length === 0) continue
    console.log(`[sync] checking ${ids.length} ${refTable} IDs on server:`, ids)
    try {
      const { data, error } = await supabaseTable(refTable).select('id').in('id', ids)
      if (error) throw error
      ;(data || []).forEach((r: { id: string }) => validIdsByRef[refTable].add(String(r.id)))
      console.log(`[sync] server confirmed ${validIdsByRef[refTable].size - pendingCreatedIds[refTable].size}/${ids.length} ${refTable} IDs`)
    } catch (err) {
      console.warn(`[sync] failed to verify ${refTable} IDs on server:`, err)
    }
  }

  const recordsToPatch: { record: { id: string; table: string }; patch: Record<string, unknown> }[] = []
  for (const { table, field, refTable } of FOREIGN_KEYS) {
    const validIds = validIdsByRef[refTable]
    if (!validIds) continue
    for (const record of recordsByTable[table] ?? []) {
      const raw = (record as { _raw: Record<string, unknown> })._raw
      const value = raw[field]
      if (value === undefined || value === null || value === '') continue
      if (validIds.has(String(value))) continue
      const id = (record as { id: string }).id
      console.warn(`[sync] ${table}#${id} has invalid ${field}=${value} (missing ${refTable}), will clear`)
      const existing = recordsToPatch.find((r) => r.record.id === id)
      if (existing) {
        existing.patch[field] = null
      } else {
        recordsToPatch.push({ record: record as { id: string; table: string }, patch: { [field]: null } })
      }
    }
  }

  if (recordsToPatch.length === 0) {
    console.log('[sync] repairStaleForeignKeys finished: nothing to repair')
    return
  }

  try {
    await wmDatabase.write(async () => {
      await wmDatabase.batch(
        ...(recordsToPatch.map(({ record, patch }) =>
          (record as unknown as Model).prepareUpdate((rec) => {
            for (const [key, value] of Object.entries(patch)) {
              ;(rec as unknown as Record<string, unknown>)[key] = value
            }
          })
        ) as Model[])
      )
    })
    console.log(`[sync] repairStaleForeignKeys finished: cleared FKs on ${recordsToPatch.length} records`)
  } catch (err) {
    console.error('[sync] repairStaleForeignKeys batch update failed:', err)
  }

  for (const { record, patch } of recordsToPatch) {
    console.warn(`[sync] repaired stale FKs on ${record.table}#${record.id}:`, patch)
  }
}

async function runSync(wmDatabase: Database, workspaceId: string): Promise<void> {
  offlineSyncStatus$.next({ status: 'syncing' })

  await repairStaleForeignKeys(wmDatabase)

  const syncPromise = synchronize({
    database: wmDatabase,
    pullChanges: async (args: SyncPullArgs): Promise<SyncPullResult> => {
      const lastPulledAt = args.lastPulledAt ?? 0
      const since = tsToIso(lastPulledAt)
      const changes: SyncDatabaseChangeSet = {}

      console.log(`[sync] pulling workspace ${workspaceId} changes since ${since ?? 'beginning'}`)

      await Promise.all(
        SYNC_TABLES.map(async (tableName) => {
          let query = supabaseTable(tableName).select('*').eq('workspace_id', workspaceId)
          if (since) {
            query = query.gt('updated_at', since)
          }
          const { data, error } = await query.order('updated_at', { ascending: true })
          if (error) throw error
          if (!data) return

          const created: DirtyRaw[] = []
          const updated: DirtyRaw[] = []
          const deleted: string[] = []
          const existingIds = new Set<string>()
          let loadedExistingIds = false

          for (const untypedRow of data) {
            const row = untypedRow as Record<string, unknown>
            if (row._deleted) {
              deleted.push(String(row.id))
              continue
            }

            const raw = cleanServerRow(tableName, row)
            // On the very first pull (since === null) every non-deleted record is
            // new to this local database and must be reported as `created`.
            let isNew =
              !since ||
              (row.created_at &&
                typeof row.created_at === 'string' &&
                row.created_at > since)

            // Avoid WatermelonDB's "Server wants client to update record but it
            // doesn't exist locally" diagnostic by re-classifying would-be
            // updates for records that are missing locally as creates.
            if (!isNew && since) {
              if (!loadedExistingIds) {
                const ids = await getExistingIds(wmDatabase, tableName)
                ids.forEach((id) => existingIds.add(id))
                loadedExistingIds = true
              }
              if (!existingIds.has(String(row.id))) {
                isNew = true
              }
            }

            if (isNew) {
              created.push(raw)
            } else {
              updated.push(raw)
            }
          }

          const changeSetEntry = changes as unknown as Record<string, SyncTableChangeSet>
          changeSetEntry[tableName] = { created, updated, deleted }
        }),
      )

      return { changes, timestamp: nowTs() }
    },

    pushChanges: async ({ changes, lastPulledAt }: SyncPushArgs): Promise<void> => {
      void lastPulledAt

      await sanitizeStaleForeignKeys(wmDatabase, changes)

      const typedChanges = typedChangeSet(changes)

      // Process tables in dependency order so parent rows exist before child rows.
      for (const tableName of SYNC_TABLES) {
        const ops = typedChanges[tableName]
        if (!ops) continue

        for (const created of ops.created) {
          const payload = preparePayload(tableName, created as Record<string, unknown>, true)
          const { error } = await supabaseTable(tableName).insert(payload)
          if (error) throw error
        }

        for (const updated of ops.updated) {
          const row = updated as Record<string, unknown>
          const id = row.id as string | undefined
          if (!id) continue
          const payload = preparePayload(tableName, row, false)
          const { error } = await supabaseTable(tableName).update(payload).eq('id', id)
          if (error) throw error
        }

        if (ops.deleted.length > 0) {
          const now = new Date().toISOString()
          const { error } = await supabaseTable(tableName)
            .update({ _deleted: true, updated_at: now })
            .in('id', ops.deleted)
          if (error) throw error
        }
      }
    },
  })

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Sync timed out after ${SYNC_TIMEOUT_MS}ms`))
    }, SYNC_TIMEOUT_MS)
  })

  try {
    await Promise.race([syncPromise, timeoutPromise])
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId)
  }

  recomputeStatus()
}

async function emergencyClearProjectOrgIds(wmDatabase: Database): Promise<void> {
  console.warn('[sync] emergencyClearProjectOrgIds running')
  try {
    const projectsCollection = wmDatabase.collections.get('projects')
    const created = await projectsCollection.query(Q.where('_status', 'created')).fetch()
    const updated = await projectsCollection.query(Q.where('_status', 'updated')).fetch()
    const dirtyProjects = [...created, ...updated]
    const toClear = dirtyProjects.filter((p) => (p._raw as Record<string, unknown>).organization_id)
    if (toClear.length === 0) {
      console.warn('[sync] no dirty projects with organization_id to clear')
      return
    }
    await wmDatabase.write(async () => {
      await wmDatabase.batch(
        toClear.map((p) =>
          p.prepareUpdate((rec) => {
            ;(rec as unknown as Record<string, unknown>).organization_id = null
          })
        )
      )
    })
    console.warn(`[sync] emergency cleared organization_id on ${toClear.length} projects`)
  } catch (err) {
    console.error('[sync] emergencyClearProjectOrgIds failed:', err)
  }
}

function runWorkspaceSync(wmDatabase: Database, workspaceId: string): Promise<void> {
  const key = workspaceId
  return (async () => {
    if (!isOnline()) {
      pendingSyncs.delete(key)
      recomputeStatus('Offline — sync paused')
      return
    }

    let lastError: string | undefined
    try {
      await runSync(wmDatabase, workspaceId)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(`[sync] workspace ${workspaceId} sync failed:`, err)

      // Detect project organization_id FK violation and emergency repair.
      if (
        errorMessage.includes('projects_organization_id_fkey') ||
        errorMessage.includes('Key is not present in table "organizations"')
      ) {
        console.warn('[sync] detected project organization FK violation, attempting emergency repair')
        try {
          await emergencyClearProjectOrgIds(wmDatabase)
          await runSync(wmDatabase, workspaceId)
          console.log('[sync] emergency repair succeeded')
        } catch (retryErr: unknown) {
          lastError = retryErr instanceof Error ? retryErr.message : String(retryErr)
          console.error('[sync] emergency repair failed:', retryErr)
        }
      } else {
        lastError = errorMessage
      }
    } finally {
      pendingSyncs.delete(key)
      recomputeStatus(lastError)
    }
  })()
}

/**
 * Starts continuous, per-workspace replication for the tables that are
 * enabled for offline-first use. Safe to call multiple times.
 */
export function startWorkspaceSync(db: LocalDb, workspaceId: string) {
  const key = workspaceId
  if (activeIntervals.has(key)) return

  const wmDatabase = db._wmDatabase

  if (isOnline()) {
    pendingSyncs.set(key, runWorkspaceSync(wmDatabase, workspaceId))
  } else {
    console.log('[sync] startWorkspaceSync: device is offline, deferring first sync')
  }

  const interval = setInterval(() => {
    // Don't keep chewing network/IndexedDB while the window is hidden or offline.
    if (!isOnline() || !isAppVisible()) return
    if (pendingSyncs.has(key)) return
    pendingSyncs.set(key, runWorkspaceSync(wmDatabase, workspaceId))
  }, 10000)

  activeIntervals.set(key, interval)
  recomputeStatus()
}

/**
 * Stop all active replication states. Useful on sign-out.
 */
export function stopAllSync() {
  for (const interval of activeIntervals.values()) {
    clearInterval(interval)
  }
  activeIntervals.clear()
  pendingSyncs.clear()
  offlineSyncStatus$.next({ status: 'idle' })
}
