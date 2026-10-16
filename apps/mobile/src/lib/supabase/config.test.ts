import { readSupabaseEnv } from '@/lib/supabase/config';

describe('readSupabaseEnv', () => {
  it('returns trimmed url and anon key', () => {
    const env = {
      EXPO_PUBLIC_SUPABASE_URL: ' https://x.supabase.co ',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: ' anon ',
    };
    expect(readSupabaseEnv(env)).toEqual({
      url: 'https://x.supabase.co',
      anonKey: 'anon',
    });
  });

  it('throws when the url is missing', () => {
    expect(() =>
      readSupabaseEnv({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon' }),
    ).toThrow('Missing EXPO_PUBLIC_SUPABASE_URL');
  });

  it('throws when the anon key is missing', () => {
    expect(() =>
      readSupabaseEnv({ EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' }),
    ).toThrow('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY');
  });
});
