import { navItemsFor } from '@/features/workspace/navigation';
import { getAccessibleView } from '@/features/workspace/account';

describe('shell nav', () => {
  it('lists only views accessible to the account', () => {
    const personal = navItemsFor('personal', false).map((i) => i.view);
    const permitted = personal.filter(
      (v) => getAccessibleView('personal', v) === v,
    );
    expect(permitted).toEqual(personal);
    expect(permitted).not.toContain('dispatch');
  });
});
