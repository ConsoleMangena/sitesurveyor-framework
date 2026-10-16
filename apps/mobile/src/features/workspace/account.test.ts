import { getAllowedViews, getAccessibleView } from '@/features/workspace/account';

describe('account view access', () => {
  it('gives personal accounts invoices/contacts but not dispatch', () => {
    const views = getAllowedViews('personal');
    expect(views.has('invoices')).toBe(true);
    expect(views.has('contacts')).toBe(true);
    expect(views.has('dispatch')).toBe(false);
  });

  it('gives business accounts dispatch but not invoices', () => {
    const views = getAllowedViews('business');
    expect(views.has('dispatch')).toBe(true);
    expect(views.has('invoices')).toBe(false);
  });

  it('adds admin views only for platform admins', () => {
    expect(getAllowedViews('personal').has('admin_users')).toBe(false);
    expect(getAllowedViews('personal', true).has('admin_users')).toBe(true);
  });

  it('falls back to dashboard for inaccessible requests', () => {
    expect(getAccessibleView('personal', 'dispatch')).toBe('dashboard');
    expect(getAccessibleView('business', 'dispatch')).toBe('dispatch');
  });

  it('treats projects (CAD) as inaccessible on mobile', () => {
    expect(getAccessibleView('personal', 'projects' as never)).toBe('dashboard');
  });
});
