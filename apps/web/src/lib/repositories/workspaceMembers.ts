import { getCurrentUser } from "../auth/session.ts";
import { supabase } from "../supabase/client.ts";
import type { Tables, TablesInsert, TablesUpdate } from "../supabase/types.ts";

export type WorkspaceMemberRow = Tables<"workspace_members">;
export type WorkspaceMemberInsert = TablesInsert<"workspace_members">;
export type WorkspaceMemberUpdate = TablesUpdate<"workspace_members">;

export interface WorkspaceMemberWithProfile extends WorkspaceMemberRow {
  full_name: string | null;
  professional_title: string | null;
  promo_code: string | null;
  email: string | null;
  phone: string | null;
}

export async function listWorkspaceMembers(
  workspaceId: string,
  options?: { statuses?: WorkspaceMemberRow["status"][] },
): Promise<WorkspaceMemberWithProfile[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const statusFilter = options?.statuses ?? ["active", "invited", "suspended"];

  const { data, error } = await supabase
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("status", statusFilter)
    .order("created_at");

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const userIds = data.map((m) => m.user_id);
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, professional_title, promo_code, email, phone")
    .in("id", userIds);

  if (profileError) throw profileError;

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p]),
  );

  return data.map((member) => {
    const profile = profileMap.get(member.user_id);
    return {
      ...member,
      full_name: profile?.full_name ?? null,
      professional_title: profile?.professional_title ?? null,
      promo_code: profile?.promo_code ?? null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
    };
  });
}

export async function getWorkspaceMember(
  id: string,
): Promise<WorkspaceMemberRow | null> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createWorkspaceMember(
  workspaceId: string,
  input: Omit<WorkspaceMemberInsert, "workspace_id">,
): Promise<WorkspaceMemberRow> {
  const user = await getCurrentUser();
  if (!user)
    throw new Error("You must be signed in to add a workspace member.");

  const { data, error } = await supabase
    .from("workspace_members")
    .insert({ ...input, workspace_id: workspaceId })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function updateWorkspaceMember(
  id: string,
  patch: WorkspaceMemberUpdate,
): Promise<WorkspaceMemberRow> {
  const user = await getCurrentUser();
  if (!user)
    throw new Error("You must be signed in to update a workspace member.");

  const { data, error } = await supabase
    .from("workspace_members")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
