import { getCurrentUser } from "../auth/session.ts";
import { getMyProfile } from "./profiles.ts";
import { supabase } from "../supabase/client.ts";
import type { Tables } from "../supabase/types.ts";

export type WorkspaceRow = Tables<"workspaces">;

function normalizeWorkspaceError(error: unknown): Error {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unable to complete the workspace action.";

  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("only available for business workspaces") ||
    normalizedMessage.includes("only available for business workspace")
  ) {
    return new Error(
      "This feature is only available for business accounts. Switch to a business workspace to continue.",
    );
  }

  if (normalizedMessage.includes("invitation is invalid or expired")) {
    return new Error(
      "This invitation is no longer valid. Ask the workspace owner to send a new invitation.",
    );
  }

  if (
    normalizedMessage.includes(
      "invitation email does not match the signed-in user",
    )
  ) {
    return new Error(
      "This invitation was sent to a different email address. Sign in with the invited email and try again.",
    );
  }

  return error instanceof Error ? error : new Error(message);
}
export type WorkspaceMemberRow = Tables<"workspace_members">;

type WorkspaceMemberWithWorkspace = {
  workspaces: WorkspaceRow | WorkspaceRow[] | null;
};

export interface WorkspaceMembershipSummary {
  membershipId: string;
  workspaceId: string;
  role: WorkspaceMemberRow["role"];
  status: WorkspaceMemberRow["status"];
  joinedAt: string | null;
  workspace: WorkspaceRow;
}

function normalizeWorkspaceJoin(
  row: WorkspaceMemberWithWorkspace,
): WorkspaceRow | null {
  if (!row.workspaces) return null;
  return Array.isArray(row.workspaces)
    ? (row.workspaces[0] ?? null)
    : row.workspaces;
}

export async function getMyWorkspaces(): Promise<WorkspaceMembershipSummary[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("workspace_members")
    .select("id, workspace_id, role, status, joined_at, workspaces!inner(*)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: false, nullsFirst: false });

  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const workspace = normalizeWorkspaceJoin(
        row as unknown as WorkspaceMemberWithWorkspace,
      );
      if (!workspace) return null;

      return {
        membershipId: row.id,
        workspaceId: row.workspace_id,
        role: row.role,
        status: row.status,
        joinedAt: row.joined_at,
        workspace,
      } satisfies WorkspaceMembershipSummary;
    })
    .filter((row): row is WorkspaceMembershipSummary => row !== null);
}

export async function getDefaultWorkspace(): Promise<WorkspaceRow | null> {
  const profile = await getMyProfile();
  if (!profile?.default_workspace_id) return null;

  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", profile.default_workspace_id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getWorkspaceById(
  workspaceId: string,
): Promise<WorkspaceRow | null> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) throw normalizeWorkspaceError(error);
  return data;
}

export async function getMarketplaceWallet(
  workspaceId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("marketplace_wallet_address")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) throw normalizeWorkspaceError(error);
  return data?.marketplace_wallet_address ?? null;
}

export async function updateMarketplaceWallet(
  workspaceId: string,
  address: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("workspaces")
    .update({ marketplace_wallet_address: address })
    .eq("id", workspaceId);

  if (error) throw normalizeWorkspaceError(error);
}

export async function switchDefaultWorkspace(
  targetWorkspaceId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("set_default_workspace", {
    target_workspace_id: targetWorkspaceId,
  });

  if (error) throw normalizeWorkspaceError(error);
  return Boolean(data);
}

export async function createBusinessWorkspace(input: {
  name: string;
  slug?: string | null;
}): Promise<WorkspaceRow> {
  const rpcArgs =
    input.slug == null
      ? { workspace_name: input.name }
      : {
          workspace_name: input.name,
          workspace_slug: input.slug,
        };

  const { data, error } = await supabase.rpc(
    "create_business_workspace",
    rpcArgs,
  );

  if (error) throw normalizeWorkspaceError(error);
  if (!data) throw new Error("Workspace creation did not return an ID.");

  const workspace = await getWorkspaceById(data);
  if (!workspace)
    throw new Error("Workspace was created but could not be loaded.");

  return workspace;
}

export async function acceptWorkspaceInvitation(
  token: string,
): Promise<WorkspaceRow> {
  const { data, error } = await supabase.rpc("accept_workspace_invitation", {
    target_invitation_token: token,
  });

  if (error) throw normalizeWorkspaceError(error);
  if (!data)
    throw new Error("Invitation acceptance did not return a workspace ID.");

  const workspace = await getWorkspaceById(data);
  if (!workspace)
    throw new Error("Workspace was joined but could not be loaded.");

  return workspace;
}

export async function getMyWorkspaceMembership(
  workspaceId: string,
): Promise<WorkspaceMemberRow | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}
