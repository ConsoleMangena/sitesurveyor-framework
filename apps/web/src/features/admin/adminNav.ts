import type { WorkspaceNavGroup } from "../workspace/types.ts";

export const platformAdminNavGroup: WorkspaceNavGroup = {
  label: "ADMIN",
  items: [
    { view: "admin_overview", label: "Overview", icon: "shield" },
    { view: "admin_activity", label: "Activity", icon: "activity" },
    { view: "admin_users", label: "Users", icon: "users" },
    { view: "admin_workspaces", label: "Workspaces", icon: "building" },
    { view: "admin_audit", label: "Audit Log", icon: "clipboard" },
  ],
};
