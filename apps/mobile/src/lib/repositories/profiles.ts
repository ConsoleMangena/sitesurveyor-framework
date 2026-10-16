import { supabase } from '@/lib/supabase/client';

export interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  is_platform_admin: boolean | null;
  auth_signup_account_type: string | null;
  default_workspace_id: string | null;
}

export async function getMyProfile(): Promise<ProfileRow | null> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id,email,full_name,is_platform_admin,auth_signup_account_type,default_workspace_id',
    )
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  return (data as ProfileRow) ?? null;
}
