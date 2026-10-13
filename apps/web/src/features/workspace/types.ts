export type AccountType = "personal" | "business";

/** Stored at signup (`profiles.auth_signup_account_type`); drives shell routing. */
export type SignupAccountType = "personal" | "business" | "platform_admin";

export const WORKSPACE_VIEWS = [
  "dashboard",
  "assistant",
  "teamChat",
  "notifications",
  "files",
  "quotes",
  "projects",
  "dispatch",
  "assets",
  "marketplace",
  "professionals",
  "team",
  "jobs",
  "profile",
  "schedule",
  "invoices",
  "billing",
  "contacts",
  "timeTracking",
  "admin_overview",
  "admin_activity",
  "admin_users",
  "admin_workspaces",
  "admin_audit",
  "settings",
] as const;

export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number];

const WORKSPACE_VIEW_SET: ReadonlySet<string> = new Set(WORKSPACE_VIEWS);

export function isWorkspaceView(value: unknown): value is WorkspaceView {
  return typeof value === "string" && WORKSPACE_VIEW_SET.has(value);
}

export interface UiUser {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  company: string;
  accountType: AccountType;
  signupAccountType: SignupAccountType | null;
  isPlatformAdmin: boolean;
}

export interface WorkspaceNavItem {
  view: WorkspaceView;
  label: string;
  icon: string;
}

export interface WorkspaceNavGroup {
  label?: string;
  items: WorkspaceNavItem[];
}
