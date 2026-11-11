import type { WorkspaceNavGroup } from "../workspace/types";

export const businessNavGroups: WorkspaceNavGroup[] = [
  {
    items: [
      { view: "dashboard", label: "Dashboard", icon: "dashboard" },
      { view: "assistant", label: "SiteSurveyor AI", icon: "bot" },
      { view: "notifications", label: "Notifications", icon: "notifications" },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
      { view: "quotes", label: "Quotes", icon: "document" },
      { view: "projects", label: "Projects", icon: "folder" },
      { view: "timeTracking", label: "Time & Expenses", icon: "clock" },
      { view: "files", label: "File Manager", icon: "file-manager" },
      { view: "dispatch", label: "Dispatch", icon: "clipboard" },
      { view: "schedule", label: "Schedule", icon: "calendar" },
    ],
  },
  {
    label: "FINANCES",
    items: [{ view: "billing", label: "Billing & Payments", icon: "billing" }],
  },
  {
    label: "RESOURCES",
    items: [
      { view: "teamChat", label: "Team Chat", icon: "chat" },
      { view: "team", label: "Team", icon: "people" },
      { view: "assets", label: "Assets", icon: "asset" },
    ],
  },
  {
    label: "NETWORK",
    items: [
      { view: "jobs", label: "Job Board", icon: "briefcase" },
      { view: "professionals", label: "Hire Pros", icon: "person" },
      { view: "marketplace", label: "Marketplace", icon: "marketplace" },
    ],
  },
  {
    label: "ACCOUNT",
    items: [
      { view: "settings", label: "Settings", icon: "settings" },
    ],
  },
];
