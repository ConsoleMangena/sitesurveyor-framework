import type { WorkspaceNavGroup } from "../workspace/types";

export const personalNavGroups: WorkspaceNavGroup[] = [
  {
    items: [
      { view: "dashboard", label: "Dashboard", icon: "dashboard" },
      { view: "assistant", label: "SiteSurveyor AI", icon: "bot" },
      { view: "notifications", label: "Notifications", icon: "notifications" },
    ],
  },
  {
    label: "WORK",
    items: [
      { view: "schedule", label: "Schedule", icon: "calendar" },
      { view: "timeTracking", label: "Time & Expenses", icon: "clock" },
      { view: "projects", label: "Projects", icon: "folder" },
      { view: "assets", label: "Asset Management", icon: "asset" },
      { view: "files", label: "File Manager", icon: "file-manager" },
      { view: "quotes", label: "Quotes", icon: "document" },
    ],
  },
  {
    label: "FINANCES",
    items: [
      { view: "invoices", label: "Invoices", icon: "document" },
      { view: "billing", label: "Billing & Payments", icon: "billing" },
    ],
  },
  {
    label: "PEOPLE",
    items: [
      { view: "teamChat", label: "Team Chat", icon: "chat" },
      { view: "team", label: "Team", icon: "people" },
      { view: "contacts", label: "Contacts", icon: "people" },
      { view: "professionals", label: "Hire Crew", icon: "person-plus" },
      { view: "jobs", label: "Find Jobs", icon: "briefcase" },
    ],
  },
  {
    label: "MARKETPLACE",
    items: [
      { view: "marketplace", label: "Marketplace", icon: "shopping" },
    ],
  },
  {
    label: "ACCOUNT",
    items: [
      { view: "settings", label: "Settings", icon: "settings" },
    ],
  },
];
