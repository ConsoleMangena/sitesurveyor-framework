import { getCurrentSession } from "../auth/session.ts";
import type { Tables, TablesInsert, TablesUpdate } from "../supabase/types.ts";
import { getLocalDatabase, type LocalDb } from "../localDb/db.ts";
import { startWorkspaceSync } from "../localDb/sync.ts";
import { generateLocalId, nowIso, omitNullish } from "../localDb/utils.ts";
import type { OrganizationDocType } from "../localDb/schemas.ts";

export type OrganizationRow = Tables<"organizations">;
export type OrganizationInsert = TablesInsert<"organizations">;
export type OrganizationUpdate = TablesUpdate<"organizations">;

async function getLocalDb(workspaceId?: string): Promise<LocalDb> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in.");

  const db = await getLocalDatabase(session.user.id);
  if (workspaceId) {
    startWorkspaceSync(db, workspaceId);
  }
  return db;
}

function toOrganizationRow(doc: OrganizationDocType): OrganizationRow {
  const { _deleted: _ignored, ...row } = doc;
  void _ignored;
  return row as OrganizationRow;
}

export async function listOrganizations(
  workspaceId: string,
): Promise<OrganizationRow[]> {
  const session = await getCurrentSession();
  if (!session?.user) return [];

  const db = await getLocalDb(workspaceId);

  const docs = await db.organizations
    .find({
      selector: {
        workspace_id: workspaceId,
        _deleted: false,
      },
    })
    .exec();

  return docs
    .map((d) => d.toMutableJSON())
    .filter((o) => !o.archived_at)
    .map((o) => toOrganizationRow(o));
}

export async function getOrganization(
  id: string,
): Promise<OrganizationRow | null> {
  const db = await getLocalDb();
  const doc = await db.organizations.findOne(id).exec();
  return doc ? toOrganizationRow(doc.toMutableJSON()) : null;
}

export async function createOrganization(
  workspaceId: string,
  input: Omit<OrganizationInsert, "workspace_id" | "created_by">,
): Promise<OrganizationRow> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in to create an organization.");

  const db = await getLocalDb(workspaceId);

  const doc = await db.organizations.insert({
    id: generateLocalId(),
    workspace_id: workspaceId,
    created_by: session.user.id,
    created_at: nowIso(),
    updated_at: nowIso(),
    _deleted: false,
    name: input.name ?? "",
    organization_type: input.organization_type ?? "client",
    country_code: input.country_code ?? "ZW",
    ...omitNullish(input as unknown as Record<string, unknown>),
  });

  return toOrganizationRow(doc.toMutableJSON());
}

export async function updateOrganization(
  id: string,
  patch: OrganizationUpdate,
): Promise<OrganizationRow> {
  const session = await getCurrentSession();
  if (!session?.user)
    throw new Error("You must be signed in to update an organization.");

  const db = await getLocalDb();
  const doc = await db.organizations.findOne(id).exec();
  if (!doc) throw new Error(`Organization not found: ${id}`);

  const { id: _id, ...safePatch } = patch;
  void _id;

  await doc.incrementalPatch({
    ...omitNullish(safePatch as unknown as Record<string, unknown>),
    updated_at: nowIso(),
  });

  return toOrganizationRow(doc.toMutableJSON());
}

export async function archiveOrganization(id: string): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.user)
    throw new Error("You must be signed in to archive an organization.");

  const db = await getLocalDb();
  const doc = await db.organizations.findOne(id).exec();
  if (!doc) throw new Error(`Organization not found: ${id}`);

  await doc.incrementalPatch({
    archived_at: nowIso(),
    updated_at: nowIso(),
  });
}
