-- Two gaps on public.profiles, both invisible until a provider sign-in reached
-- them. The existing policies were created directly in the hosted database (as
-- the signup trigger had been), so they are not in the migration history
-- either; this file records them and closes the holes.
--
-- 1. There is no INSERT policy at all. The provisioning create branch and
--    repairSignInProfile both issue an upsert, which PostgREST sends as
--    INSERT ... ON CONFLICT, and the INSERT WITH CHECK is evaluated before the
--    conflict is even looked at. With no insert policy that write can never
--    succeed for a signed-in user, existing row or not.
--
-- 2. profiles_update_self's WITH CHECK freezes auth_signup_account_type
--    completely. A provider sign-in gets its profile from the database trigger,
--    which leaves that column NULL, and the app always sends at least 'personal'
--    (provisioning defaults a missing account_type to it). Filling the column in
--    was therefore refused, and /auth/callback showed the raw Postgres text:
--    new row violates row-level security policy for table "profiles".
--
-- The intent of the original guard is kept: is_platform_admin stays immutable by
-- self-update, and auth_signup_account_type may only be filled in while it is
-- still NULL, only to 'personal' or 'business', and never to 'platform_admin'.
--
-- This closes the RLS half only. A mirrored email can still collide with the
-- account that claimed it first (profiles_email_key), and no policy can make
-- that legal; apps/web/src/lib/auth/provisioning.ts drops the contested column
-- and re-writes the rest, because the session already carries the address.

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and not (
      is_platform_admin is distinct from (
        select p.is_platform_admin from public.profiles p where p.id = auth.uid()
      )
    )
    and (
      auth_signup_account_type is not distinct from (
        select p.auth_signup_account_type from public.profiles p where p.id = auth.uid()
      )
      or (
        (select p.auth_signup_account_type from public.profiles p where p.id = auth.uid()) is null
        and auth_signup_account_type in ('personal', 'business')
      )
    )
  );
