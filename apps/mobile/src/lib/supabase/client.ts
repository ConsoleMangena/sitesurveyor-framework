import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { readSupabaseEnv } from './config';
import { getSupabaseStorage } from './storage';

const { url, anonKey } = readSupabaseEnv();

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: getSupabaseStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
