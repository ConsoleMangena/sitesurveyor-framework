import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase/client';

export function loadStoredSession(): Promise<Session | null> {
  return supabase.auth.getSession().then(({ data }) => data.session ?? null);
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export async function signInWithEmail(input: { email: string; password: string }) {
  return supabase.auth.signInWithPassword(input);
}

export async function signUpWithEmail(input: {
  email: string;
  password: string;
  accountType: 'personal' | 'business';
  fullName?: string;
}) {
  return supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { account_type: input.accountType, full_name: input.fullName },
      emailRedirectTo: Linking.createURL('auth/callback'),
    },
  });
}

export async function requestPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: Linking.createURL('reset-password'),
  });
}

export async function updatePassword(newPassword: string) {
  return supabase.auth.updateUser({ password: newPassword });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export function onAuthStateChange(
  handler: (session: Session | null) => void,
): { unsubscribe: () => void } {
  const { data } = supabase.auth.onAuthStateChange((_event, session) =>
    handler(session),
  );
  return { unsubscribe: () => data.subscription.unsubscribe() };
}
