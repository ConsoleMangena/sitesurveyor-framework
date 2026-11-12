/**
 * Workspace membership roles.
 */
export type WorkspaceRole = 'owner' | 'manager' | 'member' | 'observer';

/**
 * Account type classification across SiteSurveyor.
 */
export type AccountType = 'personal' | 'business' | 'platform_admin';

/**
 * Fundamental workspace entity metadata.
 */
export interface WorkspaceDescriptor {
  id: string;
  name: string;
  slug: string;
  accountType: AccountType;
  ownerId: string;
  createdAt: string;
  updatedAt?: string;
}

