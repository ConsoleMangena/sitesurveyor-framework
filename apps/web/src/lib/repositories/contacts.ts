import { getCurrentSession } from "../auth/session.ts";
import type { Tables, TablesInsert, TablesUpdate } from "../supabase/types.ts";
import { getLocalDatabase, type LocalDb } from "../localDb/db.ts";
import { startWorkspaceSync } from "../localDb/sync.ts";
import { generateLocalId, nowIso, omitNullish } from "../localDb/utils.ts";
import type { ContactDocType } from "../localDb/schemas.ts";

export type ContactRow = Tables<"contacts">;
export type ContactInsert = TablesInsert<"contacts">;
export type ContactUpdate = TablesUpdate<"contacts">;

export interface ContactWithOrg extends ContactRow {
  organization_name: string | null;
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

function toContactRow(doc: ContactDocType): ContactRow {
  const { _deleted: _ignored, ...row } = doc;
  void _ignored;
  return row as ContactRow;
}

export async function listContacts(
  workspaceId: string,
): Promise<ContactWithOrg[]> {
  const session = await getCurrentSession();
  if (!session?.user) return [];

  const db = await getLocalDb(workspaceId);

  const docs = await db.contacts
    .find({
      selector: {
        workspace_id: workspaceId,
        _deleted: false,
      },
    })
    .sort({ full_name: "asc" })
    .exec();

  const orgDocs = await db.organizations
    .find({
      selector: {
        workspace_id: workspaceId,
        _deleted: false,
      },
    })
    .exec();

  const orgMap = new Map(
    orgDocs
      .map((d) => d.toMutableJSON())
      .filter((o) => !o.archived_at)
      .map((o) => [o.id, o]),
  );

  return docs.map((d) => {
    const row = d.toMutableJSON();
    const contact = toContactRow(row);
    const org = contact.organization_id
      ? orgMap.get(contact.organization_id)
      : undefined;
    return {
      ...contact,
      organization_name: org?.name ?? null,
    } as ContactWithOrg;
  });
}

export async function getContact(id: string): Promise<ContactRow | null> {
  const db = await getLocalDb();
  const doc = await db.contacts.findOne(id).exec();
  return doc ? toContactRow(doc.toMutableJSON()) : null;
}

export async function createContact(
  workspaceId: string,
  input: Omit<ContactInsert, "workspace_id" | "created_by">,
): Promise<ContactRow> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in to create a contact.");

  const db = await getLocalDb(workspaceId);

  const doc = await db.contacts.insert({
    id: generateLocalId(),
    workspace_id: workspaceId,
    created_by: session.user.id,
    created_at: nowIso(),
    updated_at: nowIso(),
    _deleted: false,
    full_name: input.full_name ?? "",
    ...omitNullish(input as unknown as Record<string, unknown>),
  });

  return toContactRow(doc.toMutableJSON());
}

export async function updateContact(
  id: string,
  patch: ContactUpdate,
): Promise<ContactRow> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in to update a contact.");

  const db = await getLocalDb();
  const doc = await db.contacts.findOne(id).exec();
  if (!doc) throw new Error(`Contact not found: ${id}`);

  const { id: _id, ...safePatch } = patch;
  void _id;

  await doc.incrementalPatch({
    ...omitNullish(safePatch as unknown as Record<string, unknown>),
    updated_at: nowIso(),
  });

  return toContactRow(doc.toMutableJSON());
}

export async function archiveContact(id: string): Promise<void> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("You must be signed in to archive a contact.");

  const db = await getLocalDb();
  const doc = await db.contacts.findOne(id).exec();
  if (!doc) throw new Error(`Contact not found: ${id}`);

  await doc.incrementalPatch({
    _deleted: true,
    updated_at: nowIso(),
  });
}
