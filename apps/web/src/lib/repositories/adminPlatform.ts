import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../supabase/client.ts";
import type { MarketplaceListingWithAsset } from "./marketplace.ts";
import type { JobRow, JobWithProject } from "./jobs.ts";
import type { ProjectRow, ProjectWithOrg } from "./projects.ts";

// Cast to generic SupabaseClient so we can query tables not in the generated schema
const adminDb = supabase as unknown as SupabaseClient;

export interface WorkspaceRowAdmin {
  id: string;
  name: string;
  type: "personal" | "business";
  slug: string | null;
  owner_user_id: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function listWorkspaces(): Promise<WorkspaceRowAdmin[]> {
  const { data, error } = await adminDb
    .from("workspaces")
    .select(
      "id, name, type, slug, owner_user_id, archived_at, created_at, updated_at",
    )
    .order("name", { ascending: true });

  if (error) throw error;
  return (data as WorkspaceRowAdmin[] | null) ?? [];
}

export async function countProfiles(): Promise<number> {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true });

  if (error) throw error;
  return count ?? 0;
}

export async function listProfilesSummary(
  userIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", unique);

  if (error) throw error;

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const label =
      (row.full_name && row.full_name.trim()) ||
      row.email ||
      `${String(row.id).slice(0, 8)}…`;
    map.set(row.id, label);
  }
  return map;
}

/* ── User Management ──────────────────────────────────────────────── */

export interface AdminProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  professional_title: string | null;
  is_platform_admin: boolean;
  auth_signup_account_type: string | null;
  created_at: string;
  updated_at: string;
}

export async function listAllProfiles(): Promise<AdminProfileRow[]> {
  const { data, error } = await adminDb
    .from("profiles")
    .select(
      "id, email, full_name, professional_title, is_platform_admin, auth_signup_account_type, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as AdminProfileRow[] | null) ?? [];
}

export async function togglePlatformAdmin(
  userId: string,
  value: boolean,
): Promise<void> {
  const { error } = await adminDb
    .from("profiles")
    .update({ is_platform_admin: value })
    .eq("id", userId);

  if (error) throw error;
}

export interface AdminProfileWithWorkspaces extends AdminProfileRow {
  workspaces: { workspace_id: string; role: string; workspace_name: string }[];
}

export async function getProfileWithWorkspaces(
  userId: string,
): Promise<AdminProfileWithWorkspaces | null> {
  const { data: profile, error: pErr } = await adminDb
    .from("profiles")
    .select(
      "id, email, full_name, professional_title, is_platform_admin, auth_signup_account_type, created_at, updated_at",
    )
    .eq("id", userId)
    .maybeSingle();

  if (pErr) throw pErr;
  if (!profile) return null;

  const { data: memberships, error: mErr } = await adminDb
    .from("workspace_members")
    .select("workspace_id, role, workspaces(name)")
    .eq("user_id", userId);

  if (mErr) throw mErr;

  const workspaces = (memberships ?? []).map((m: Record<string, unknown>) => {
    const ws = m.workspaces as { name: string } | { name: string }[] | null;
    const name = ws ? (Array.isArray(ws) ? ws[0]?.name : ws.name) : "—";
    return {
      workspace_id: m.workspace_id as string,
      role: m.role as string,
      workspace_name: name ?? "—",
    };
  });

  return { ...(profile as AdminProfileRow), workspaces };
}

/* ── Workspace Deep-Dive ──────────────────────────────────────────── */

export interface WorkspaceMemberAdmin {
  id: string;
  user_id: string;
  role: string;
  status: string;
  full_name: string | null;
  email: string | null;
}

export async function listWorkspaceMembersAdmin(
  workspaceId: string,
): Promise<WorkspaceMemberAdmin[]> {
  const { data, error } = await adminDb
    .from("workspace_members")
    .select("id, user_id, role, status")
    .eq("workspace_id", workspaceId)
    .order("role", { ascending: true });

  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  // workspace_members.user_id references auth.users (no FK to public.profiles),
  // so PostgREST cannot embed profiles here — fetch and join manually.
  const userIds = [...new Set(rows.map((row) => row.user_id as string))];
  const { data: profiles, error: profileError } = await adminDb
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  if (profileError) throw profileError;

  const profileMap = new Map(
    ((profiles ?? []) as { id: string; full_name: string | null; email: string | null }[])
      .map((p) => [p.id, p]),
  );

  return rows.map((row) => {
    const p = profileMap.get(row.user_id as string);
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      role: row.role as string,
      status: row.status as string,
      full_name: p?.full_name ?? null,
      email: p?.email ?? null,
    };
  });
}

export interface WorkspaceSummary {
  projects: number;
  assets: number;
  invoices: number;
  quotes: number;
  contacts: number;
  jobs: number;
  members: number;
}

export async function getWorkspaceSummary(
  workspaceId: string,
): Promise<WorkspaceSummary> {
  const { data, error } = await adminDb.rpc("admin_workspace_summary", {
    p_workspace_id: workspaceId,
  });

  if (error) throw error;
  return (data as WorkspaceSummary) ?? {
    projects: 0,
    assets: 0,
    invoices: 0,
    quotes: 0,
    contacts: 0,
    jobs: 0,
    members: 0,
  };
}

export async function archiveWorkspace(workspaceId: string): Promise<void> {
  const { error } = await adminDb
    .from("workspaces")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", workspaceId);

  if (error) throw error;
}

export async function unarchiveWorkspace(workspaceId: string): Promise<void> {
  const { error } = await adminDb
    .from("workspaces")
    .update({ archived_at: null })
    .eq("id", workspaceId);

  if (error) throw error;
}

/* ── Audit Log ────────────────────────────────────────────────────── */

export interface AuditLogEntry {
  id: number;
  workspace_id: string | null;
  actor_user_id: string | null;
  entity_table: string;
  entity_id: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

/* ── Global Catalog (Marketplace & Professionals) ───────────────────── */

export interface MarketplaceListing {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  price: number | null;
  currency: string | null;
  category: string | null;
  is_global: boolean;
  created_at: string;
  updated_at: string;
}

export async function listAllMarketplaceListings(): Promise<MarketplaceListingWithAsset[]> {
  const { data, error } = await adminDb
    .from("marketplace_listings")
    .select("*, assets:asset_id(status)")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as MarketplaceListingWithAsset[] | null) ?? [];
}

export async function createMarketplaceListing(
  patch: Omit<Partial<MarketplaceListing>, "id" | "created_at" | "updated_at">,
): Promise<MarketplaceListing> {
  const { data, error } = await adminDb
    .from("marketplace_listings")
    .insert({ ...patch, is_global: true })
    .select("*")
    .single();

  if (error) throw error;
  return data as MarketplaceListing;
}

export async function updateMarketplaceListing(
  id: string,
  patch: Partial<Omit<MarketplaceListing, "id" | "created_at" | "updated_at">>,
): Promise<MarketplaceListing> {
  const { data, error } = await adminDb
    .from("marketplace_listings")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as MarketplaceListing;
}

export async function deleteMarketplaceListing(id: string): Promise<void> {
  const { error } = await adminDb.from("marketplace_listings").delete().eq("id", id);
  if (error) throw error;
}

export interface Professional {
  id: string;
  workspace_id: string;
  name: string;
  title: string | null;
  bio: string | null;
  email: string | null;
  phone: string | null;
  is_global: boolean;
  created_at: string;
  updated_at: string;
}

export async function listAllProfessionals(): Promise<Professional[]> {
  const { data, error } = await adminDb
    .from("professionals")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as Professional[] | null) ?? [];
}

export async function createProfessional(
  patch: Omit<Partial<Professional>, "id" | "created_at" | "updated_at">,
): Promise<Professional> {
  const { data, error } = await adminDb
    .from("professionals")
    .insert({ ...patch, is_global: true })
    .select("*")
    .single();

  if (error) throw error;
  return data as Professional;
}

export async function updateProfessional(
  id: string,
  patch: Partial<Omit<Professional, "id" | "created_at" | "updated_at">>,
): Promise<Professional> {
  const { data, error } = await adminDb
    .from("professionals")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as Professional;
}

export async function deleteProfessional(id: string): Promise<void> {
  const { error } = await adminDb.from("professionals").delete().eq("id", id);
  if (error) throw error;
}

/* ── Cross-tenant jobs & projects (platform admin) ─────────────────── */

export async function listAllJobs(): Promise<JobWithProject[]> {
  const { data: jobRows, error: jobError } = await adminDb
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (jobError) throw jobError;

  const { data: projectRows, error: projectError } = await adminDb
    .from("projects")
    .select("id, name");

  if (projectError) throw projectError;

  const projectMap = new Map(
    (projectRows ?? []).map((p) => [p.id, p.name as string | null]),
  );

  return ((jobRows ?? []) as JobRow[]).map((job) => ({
    ...job,
    project_name: job.project_id ? (projectMap.get(job.project_id) ?? null) : null,
  })) as JobWithProject[];
}

export async function listAllProjects(): Promise<ProjectWithOrg[]> {
  const { data, error } = await adminDb
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as ProjectRow[]).map((project) => ({
    ...project,
    organization_name: null,
  })) as ProjectWithOrg[];
}

/* ── Audit Log ────────────────────────────────────────────────────── */

export async function listAuditLogs(opts: {
  limit: number;
  offset?: number;
  workspaceId?: string | null;
  action?: string | null;
}): Promise<AuditLogEntry[]> {
  const { limit, offset = 0, workspaceId = null, action = null } = opts;

  const { data, error } = await adminDb.rpc("admin_list_audit_log", {
    p_limit: limit,
    p_offset: offset,
    p_workspace_id: workspaceId,
    p_action: action,
  });

  if (error) throw error;
  return (data as AuditLogEntry[] | null) ?? [];
}
