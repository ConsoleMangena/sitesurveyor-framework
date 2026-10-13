import { getCurrentUser } from "../auth/session.ts";
import { supabase } from "../supabase/client.ts";
import { notifyWorkspaceInvitation } from "./notificationEvents.ts";
import { addProjectMember } from "./projects.ts";

export interface WorkspaceInvitationRow {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  invitation_token: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export async function listWorkspaceInvitations(
  workspaceId: string,
): Promise<WorkspaceInvitationRow[]> {
  const { data, error } = await supabase
    .from("workspace_invitations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function inviteWorkspaceMember(input: {
  workspaceId: string;
  email: string;
  role: "admin" | "ops_manager" | "finance" | "sales" | "technician" | "viewer";
  projectId?: string;
  projectRole?: string;
}): Promise<{ invitation: WorkspaceInvitationRow; linkedToProject: boolean }> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to invite team members.");

  const normalizedEmail = input.email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("A team member email is required.");

  const { data: existingProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (profileError) throw profileError;

  let linkedToProject = false;
  if (existingProfile?.id && input.projectId) {
    await addProjectMember(
      input.workspaceId,
      input.projectId,
      existingProfile.id,
      input.projectRole ?? "member",
    );
    linkedToProject = true;
  }

  const { data, error } = await supabase
    .from("workspace_invitations")
    .upsert(
      {
        workspace_id: input.workspaceId,
        email: normalizedEmail,
        role: input.role,
        invited_by: user.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "workspace_id,email" },
    )
    .select("*")
    .single();
  if (error) throw error;

  // If the invitee already has an account, surface an in-app notification.
  if (existingProfile?.id) {
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", input.workspaceId)
      .maybeSingle();

    void notifyWorkspaceInvitation({
      workspaceId: input.workspaceId,
      invitedUserId: existingProfile.id,
      workspaceName: (workspace as { name?: string } | null)?.name ?? null,
      role: input.role,
    });
  }

  return { invitation: data, linkedToProject };
}
