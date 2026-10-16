export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export function readSupabaseEnv(
  env: Record<string, string | undefined> = process.env,
): SupabaseEnv {
  const url = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url) throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL');
  if (!anonKey) throw new Error('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY');
  return { url, anonKey };
}
