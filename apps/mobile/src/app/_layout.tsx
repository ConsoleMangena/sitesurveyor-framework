import '@/lib/supabase/client';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query/query-client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { mapAppUserToUiUser } from '@/features/workspace/account';
import { getCurrentAppUserWithDiagnostics } from '@/lib/auth/app-user';
import { onAuthStateChange } from '@/lib/auth/session';

export default function RootLayout() {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      const { context } = await getCurrentAppUserWithDiagnostics();
      if (!active) return;
      setUser(mapAppUserToUiUser(context));
      setLoading(false);
    }

    hydrate();

    const { unsubscribe } = onAuthStateChange(async (session) => {
      if (!session) {
        setUser(null);
        setLoading(false);
        return;
      }
      const { context } = await getCurrentAppUserWithDiagnostics();
      setUser(mapAppUserToUiUser(context));
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [setUser, setLoading]);

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
