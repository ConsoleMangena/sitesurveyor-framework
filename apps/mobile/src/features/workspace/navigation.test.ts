import { navItemsFor } from '@/features/workspace/navigation';

describe('navItemsFor', () => {
  it('never includes the CAD projects view', () => {
    const views = navItemsFor('personal').map((i) => i.view);
    expect(views).not.toContain('projects' as never);
  });

  it('includes invoices for personal and dispatch for business', () => {
    expect(navItemsFor('personal').map((i) => i.view)).toContain('invoices');
    expect(navItemsFor('business').map((i) => i.view)).toContain('dispatch');
  });

  it('appends admin items for platform admins', () => {
    const views = navItemsFor('personal', true).map((i) => i.view);
    expect(views).toContain('admin_overview');
  });
});
