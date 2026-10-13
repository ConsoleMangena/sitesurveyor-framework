import type { WorkspaceMemberRow } from "./repositories/workspaces.ts";

type WorkspaceRole = WorkspaceMemberRow["role"];

const roleRank: Record<WorkspaceRole, number> = {
  owner: 100,
  admin: 90,
  ops_manager: 70,
  finance: 60,
  sales: 60,
  technician: 40,
  viewer: 10,
};

export function hasMinimumRole(
  role: WorkspaceRole | null | undefined,
  minimumRole: WorkspaceRole,
): boolean {
  if (!role) return false;
  return roleRank[role] >= roleRank[minimumRole];
}

export function canManageTeam(role: WorkspaceRole | null | undefined): boolean {
  return hasMinimumRole(role, "admin");
}

export function canManageProjects(role: WorkspaceRole | null | undefined): boolean {
  if (!role) return false;
  return ["owner", "admin", "ops_manager", "sales"].includes(role);
}

export function canManageFinance(role: WorkspaceRole | null | undefined): boolean {
  if (!role) return false;
  return ["owner", "admin", "finance"].includes(role);
}
