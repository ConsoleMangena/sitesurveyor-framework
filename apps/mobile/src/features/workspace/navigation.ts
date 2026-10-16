import type { WorkspaceNavGroup, WorkspaceNavItem, AccountType } from './types';

export const personalNavGroups: WorkspaceNavGroup[] = [
  {
    items: [
      { view: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { view: 'assistant', label: 'SiteSurveyor AI', icon: 'bot' },
      { view: 'notifications', label: 'Notifications', icon: 'notifications' },
    ],
  },
  {
    label: 'WORK',
    items: [
      { view: 'schedule', label: 'Schedule', icon: 'calendar' },
      { view: 'timeTracking', label: 'Time & Expenses', icon: 'clock' },
      { view: 'assets', label: 'Assets', icon: 'asset' },
      { view: 'files', label: 'Files', icon: 'file-manager' },
      { view: 'quotes', label: 'Quotes', icon: 'document' },
    ],
  },
  {
    label: 'FINANCES',
    items: [
      { view: 'invoices', label: 'Invoices', icon: 'document' },
      { view: 'billing', label: 'Billing & Payments', icon: 'billing' },
    ],
  },
  {
    label: 'PEOPLE',
    items: [
      { view: 'teamChat', label: 'Team Chat', icon: 'chat' },
      { view: 'team', label: 'Team', icon: 'people' },
      { view: 'contacts', label: 'Contacts', icon: 'people' },
      { view: 'professionals', label: 'Hire Crew', icon: 'person-plus' },
      { view: 'jobs', label: 'Find Jobs', icon: 'briefcase' },
    ],
  },
  {
    label: 'MARKETPLACE',
    items: [{ view: 'marketplace', label: 'Marketplace', icon: 'shopping' }],
  },
  {
    label: 'ACCOUNT',
    items: [{ view: 'settings', label: 'Settings', icon: 'settings' }],
  },
];

export const businessNavGroups: WorkspaceNavGroup[] = [
  { items: personalNavGroups[0].items },
  {
    label: 'WORK',
    items: [
      { view: 'schedule', label: 'Schedule', icon: 'calendar' },
      { view: 'dispatch', label: 'Dispatch', icon: 'dispatch' },
      { view: 'timeTracking', label: 'Time & Expenses', icon: 'clock' },
      { view: 'assets', label: 'Assets', icon: 'asset' },
      { view: 'files', label: 'Files', icon: 'file-manager' },
      { view: 'quotes', label: 'Quotes', icon: 'document' },
    ],
  },
  ...personalNavGroups.slice(2),
];

export const platformAdminNavGroup: WorkspaceNavGroup = {
  label: 'PLATFORM',
  items: [
    { view: 'admin_overview', label: 'Overview', icon: 'dashboard' },
    { view: 'admin_activity', label: 'Activity', icon: 'activity' },
    { view: 'admin_users', label: 'Users', icon: 'people' },
    { view: 'admin_workspaces', label: 'Workspaces', icon: 'briefcase' },
    { view: 'admin_audit', label: 'Audit Log', icon: 'document' },
  ],
};

export function navItemsFor(
  accountType: AccountType,
  isPlatformAdmin = false,
): WorkspaceNavItem[] {
  const groups =
    accountType === 'business' ? businessNavGroups : personalNavGroups;
  const items = [...groups.flatMap((g) => g.items)];
  if (isPlatformAdmin) items.push(...platformAdminNavGroup.items);
  return items;
}
