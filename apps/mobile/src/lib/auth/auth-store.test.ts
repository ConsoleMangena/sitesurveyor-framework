import { useAuthStore } from '@/lib/auth/auth-store';

describe('useAuthStore', () => {
  beforeEach(() =>
    useAuthStore.setState({
      user: null,
      isLoading: true,
      isAuthLoading: false,
      error: null,
      sessionExpired: false,
    }),
  );

  it('sets and clears the user, clearing errors', () => {
    useAuthStore.getState().setError('x');
    useAuthStore.getState().setUser({
      id: '1',
      workspaceId: 'w',
      name: 'A',
      email: 'a@b.c',
      company: 'C',
      accountType: 'personal',
      signupAccountType: 'personal',
      isPlatformAdmin: false,
    });
    expect(useAuthStore.getState().user?.id).toBe('1');
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('manages the session-expired flag', () => {
    useAuthStore.getState().setSessionExpired(true);
    expect(useAuthStore.getState().sessionExpired).toBe(true);
    useAuthStore.getState().dismissSessionExpired();
    expect(useAuthStore.getState().sessionExpired).toBe(false);
  });
});
