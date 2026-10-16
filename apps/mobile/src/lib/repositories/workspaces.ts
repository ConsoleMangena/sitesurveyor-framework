import { getMyProfile } from '@/lib/repositories/profiles';
import { supabase } from '@/lib/supabase/client';

export interface WorkspaceRow {
  id: string;
  name: string;
  type: string;
}

export interface WorkspaceMembershipSummary {
  workspaceId: string;
  workspace: WorkspaceRow;
  role: string;
}

export async function getDefaultWorkspace(): Promise<WorkspaceRow | null> {
  const profile = await getMyProfile();
  if (!profile?.default_workspace_id) return null;

  const { data, error } = await supabase
    .from('workspaces')
    .select('id,name,type')
    .eq('id', profile.default_workspace_id)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function getMyWorkspaces(): Promise<WorkspaceMembershipSummary[]> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('workspace_members')
    .select('role, status, workspace:workspaces(id,name,type)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('joined_at', { ascending: false, nullsFirst: false });

  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const r = row as unknown as {
        role: string;
        workspace: WorkspaceRow;
      };
      if (!r.workspace) return null;
      return {
        workspaceId: r.workspace.id,
        workspace: r.workspace,
        role: r.role,
      };
    })
    .filter((row): row is WorkspaceMembershipSummary => row !== null);
}
