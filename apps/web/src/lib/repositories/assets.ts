import { getCurrentSession } from "../auth/session.ts";
import type { Tables, TablesInsert, TablesUpdate } from "../supabase/types.ts";
import { getLocalDatabase, type LocalDb } from "../localDb/db.ts";
import { startWorkspaceSync } from "../localDb/sync.ts";
import { generateLocalId, nowIso, omitNullish } from "../localDb/utils.ts";
import type {
  AssetCalibrationDocType,
  AssetDocType,
  AssetMaintenanceEventDocType,
} from "../localDb/schemas.ts";

export type AssetRow = Tables<"assets">;
export type AssetInsert = TablesInsert<"assets">;
export type AssetUpdate = TablesUpdate<"assets">;
export type CalibrationRow = Tables<"asset_calibrations">;
export type CalibrationInsert = TablesInsert<"asset_calibrations">;
export type CalibrationUpdate = TablesUpdate<"asset_calibrations">;
export type MaintenanceEventRow = Tables<"asset_maintenance_events">;
export type MaintenanceEventInsert = TablesInsert<"asset_maintenance_events">;
export type MaintenanceEventUpdate = TablesUpdate<"asset_maintenance_events">;

async function getLocalDb(workspaceId?: string): Promise<LocalDb> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in.");

  const db = await getLocalDatabase(session.user.id);
  if (workspaceId) {
    startWorkspaceSync(db, workspaceId);
  }
  return db;
}

function toAssetRow(doc: AssetDocType): AssetRow {
  const { _deleted: _ignored, ...row } = doc;
  void _ignored;
  return row as AssetRow;
}

function toCalibrationRow(doc: AssetCalibrationDocType): CalibrationRow {
  const { _deleted: _ignored, ...row } = doc;
  void _ignored;
  return row as CalibrationRow;
}

function toMaintenanceEventRow(
  doc: AssetMaintenanceEventDocType,
): MaintenanceEventRow {
  const { _deleted: _ignored, ...row } = doc;
  void _ignored;
  return row as MaintenanceEventRow;
}

export async function listAssets(workspaceId: string): Promise<AssetRow[]> {
  const session = await getCurrentSession();
  if (!session?.user) return [];

  const db = await getLocalDb(workspaceId);

  const docs = await db.assets
    .find({
      selector: {
        workspace_id: workspaceId,
        _deleted: false,
      },
    })
    .sort({ name: "asc" })
    .exec();

  return docs
    .map((d) => d.toMutableJSON())
    .filter((a) => !a.archived_at)
    .map((a) => toAssetRow(a));
}

export async function getAsset(id: string): Promise<AssetRow | null> {
  const db = await getLocalDb();
  const doc = await db.assets.findOne(id).exec();
  return doc ? toAssetRow(doc.toMutableJSON()) : null;
}

export async function createAsset(
  workspaceId: string,
  input: Omit<AssetInsert, "workspace_id" | "created_by">,
): Promise<AssetRow> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in to create an asset.");

  const db = await getLocalDb(workspaceId);

  const doc = await db.assets.insert({
    id: generateLocalId(),
    workspace_id: workspaceId,
    created_by: session.user.id,
    created_at: nowIso(),
    updated_at: nowIso(),
    _deleted: false,
    name: input.name ?? "",
    kind: input.kind ?? "instrument",
    status: input.status ?? "available",
    metadata: (input.metadata as Record<string, unknown>) ?? {},
    ...omitNullish(input as unknown as Record<string, unknown>),
  });

  return toAssetRow(doc.toMutableJSON());
}

export async function updateAsset(
  id: string,
  patch: AssetUpdate,
): Promise<AssetRow> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in to update an asset.");

  const db = await getLocalDb();
  const doc = await db.assets.findOne(id).exec();
  if (!doc) throw new Error(`Asset not found: ${id}`);

  const { id: _id, ...safePatch } = patch;
  void _id;

  await doc.incrementalPatch({
    ...omitNullish(safePatch as unknown as Record<string, unknown>),
    updated_at: nowIso(),
  });

  return toAssetRow(doc.toMutableJSON());
}

export async function archiveAsset(id: string): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in to archive an asset.");

  const db = await getLocalDb();
  const doc = await db.assets.findOne(id).exec();
  if (!doc) throw new Error(`Asset not found: ${id}`);

  await doc.incrementalPatch({
    archived_at: nowIso(),
    updated_at: nowIso(),
  });
}

export async function listCalibrations(
  workspaceId: string,
  assetId?: string,
): Promise<CalibrationRow[]> {
  const session = await getCurrentSession();
  if (!session?.user) return [];

  const db = await getLocalDb(workspaceId);

  const selector: Record<string, unknown> = {
    workspace_id: workspaceId,
    _deleted: false,
  };
  if (assetId) {
    selector.asset_id = assetId;
  }

  const docs = await db.asset_calibrations
    .find({ selector })
    .sort({ calibration_date: "desc" })
    .exec();

  return docs.map((d) => toCalibrationRow(d.toMutableJSON()));
}

export async function createCalibration(
  workspaceId: string,
  input: Omit<CalibrationInsert, "workspace_id" | "created_by">,
): Promise<CalibrationRow> {
  const session = await getCurrentSession();
  if (!session?.user)
    throw new Error("You must be signed in to create a calibration record.");

  const db = await getLocalDb(workspaceId);

  const doc = await db.asset_calibrations.insert({
    id: generateLocalId(),
    workspace_id: workspaceId,
    created_by: session.user.id,
    created_at: nowIso(),
    updated_at: nowIso(),
    _deleted: false,
    asset_id: input.asset_id ?? "",
    calibration_date: input.calibration_date ?? nowIso().slice(0, 10),
    calibration_status: input.calibration_status ?? "scheduled",
    ...omitNullish(input as unknown as Record<string, unknown>),
  });

  return toCalibrationRow(doc.toMutableJSON());
}

export async function updateCalibration(
  id: string,
  patch: CalibrationUpdate,
): Promise<CalibrationRow> {
  const session = await getCurrentSession();
  if (!session?.user)
    throw new Error("You must be signed in to update a calibration record.");

  const db = await getLocalDb();
  const doc = await db.asset_calibrations.findOne(id).exec();
  if (!doc) throw new Error(`Calibration not found: ${id}`);

  const { id: _id, ...safePatch } = patch;
  void _id;

  await doc.incrementalPatch({
    ...omitNullish(safePatch as unknown as Record<string, unknown>),
    updated_at: nowIso(),
  });

  return toCalibrationRow(doc.toMutableJSON());
}

export async function deleteCalibration(id: string): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.user)
    throw new Error("You must be signed in to delete a calibration record.");

  const db = await getLocalDb();
  const doc = await db.asset_calibrations.findOne(id).exec();
  if (!doc) throw new Error(`Calibration not found: ${id}`);

  await doc.incrementalPatch({
    _deleted: true,
    updated_at: nowIso(),
  });
}

export async function listMaintenanceEvents(
  workspaceId: string,
  assetId?: string,
): Promise<MaintenanceEventRow[]> {
  const session = await getCurrentSession();
  if (!session?.user) return [];

  const db = await getLocalDb(workspaceId);

  const selector: Record<string, unknown> = {
    workspace_id: workspaceId,
    _deleted: false,
  };
  if (assetId) {
    selector.asset_id = assetId;
  }

  const docs = await db.asset_maintenance_events
    .find({ selector })
    .sort({ serviced_on: "desc" })
    .exec();

  return docs.map((d) => toMaintenanceEventRow(d.toMutableJSON()));
}

export async function createMaintenanceEvent(
  workspaceId: string,
  input: Omit<MaintenanceEventInsert, "workspace_id" | "created_by">,
): Promise<MaintenanceEventRow> {
  const session = await getCurrentSession();
  if (!session?.user)
    throw new Error("You must be signed in to create a maintenance event.");

  const db = await getLocalDb(workspaceId);

  const doc = await db.asset_maintenance_events.insert({
    id: generateLocalId(),
    workspace_id: workspaceId,
    created_by: session.user.id,
    created_at: nowIso(),
    updated_at: nowIso(),
    _deleted: false,
    asset_id: input.asset_id ?? "",
    serviced_on: input.serviced_on ?? nowIso().slice(0, 10),
    description: input.description ?? "",
    cost: input.cost ?? 0,
    ...omitNullish(input as unknown as Record<string, unknown>),
  });

  return toMaintenanceEventRow(doc.toMutableJSON());
}

export async function updateMaintenanceEvent(
  id: string,
  patch: MaintenanceEventUpdate,
): Promise<MaintenanceEventRow> {
  const session = await getCurrentSession();
  if (!session?.user)
    throw new Error("You must be signed in to update a maintenance event.");

  const db = await getLocalDb();
  const doc = await db.asset_maintenance_events.findOne(id).exec();
  if (!doc) throw new Error(`Maintenance event not found: ${id}`);

  const { id: _id, ...safePatch } = patch;
  void _id;

  await doc.incrementalPatch({
    ...omitNullish(safePatch as unknown as Record<string, unknown>),
    updated_at: nowIso(),
  });

  return toMaintenanceEventRow(doc.toMutableJSON());
}

export async function deleteMaintenanceEvent(id: string): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.user)
    throw new Error("You must be signed in to delete a maintenance event.");

  const db = await getLocalDb();
  const doc = await db.asset_maintenance_events.findOne(id).exec();
  if (!doc) throw new Error(`Maintenance event not found: ${id}`);

  await doc.incrementalPatch({
    _deleted: true,
    updated_at: nowIso(),
  });
}
