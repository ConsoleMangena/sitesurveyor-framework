-- public.profiles must let a signed-in user write their own row, and only that.
--
-- Run with: supabase start && supabase db reset && supabase test db
--
-- STATUS: not executed locally. This machine has no running Docker daemon, so
-- `supabase test db` cannot start the local Postgres pgTAP needs. Every case
-- below was replayed against the hosted database inside `begin; ... rollback;`
-- with `supabase db query --linked -f`: the two positives are accepted and the
-- four escalations still raise 42501.
--
-- The gaps these tests pin:
--   1. no INSERT policy existed, so `upsert` (PostgREST sends INSERT … ON
--      CONFLICT, whose WITH CHECK is evaluated before the conflict is looked
--      at) could never succeed for a signed-in user;
--   2. profiles_update_self's WITH CHECK froze auth_signup_account_type, which
--      provider sign-ins must fill in because the signup trigger leaves it
--      NULL.
--
-- Each probe switches role inside its own DO block, so pgTAP's own bookkeeping
-- keeps running as the owner, and a failed `set local role` unwinds with the
-- subtransaction that catches it.

begin;
create extension if not exists pgtap;

select plan(10);

-- Two seeded accounts: the signed-in one with the columns a provider sign-in
-- leaves empty, and another whose row must stay untouchable.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'self@example.com', '{"provider":"github","providers":["github"]}'::jsonb,
   '{"sub":"1","name":"Self User"}'::jsonb, now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'other@example.com', '{"provider":"email","providers":["email"]}'::jsonb,
   '{"sub":"2","name":"Other User"}'::jsonb, now(), now());

update public.profiles
   set full_name = 'Self User',
       email = null,
       auth_signup_account_type = null,
       is_platform_admin = false
 where id = '11111111-1111-1111-1111-111111111111';

select has_policy('public', 'profiles', 'profiles_insert_self',
  'profiles has an INSERT policy, so an upsert can reach the conflict target');
select has_policy('public', 'profiles', 'profiles_update_self',
  'profiles keeps a self-update policy');

-- Gap 1, positive: the create branch's upsert on the caller's own id.
-- It writes full_name rather than the account type, so the gap-2 cases below
-- still start from the NULL a provider sign-in actually leaves behind.
select lives_ok($$
  do $do$
    begin
      execute 'set local role authenticated';
      execute $jwt$set local request.jwt.claims =
        '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aud":"authenticated"}'$jwt$;
      execute $ins$insert into public.profiles (id, full_name)
        values ('11111111-1111-1111-1111-111111111111', 'Self User')
        on conflict (id) do update set full_name = excluded.full_name$ins$;
      execute 'reset role';
    end;
  $do$;
$$, 'a signed-in user may upsert their own profile row');

-- Gap 1, negative: the same statement aimed at somebody else's id.
select throws_ok($$
  do $do$
    begin
      execute 'set local role authenticated';
      execute $jwt$set local request.jwt.claims =
        '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aud":"authenticated"}'$jwt$;
      execute $ins$insert into public.profiles (id, full_name)
        values ('22222222-2222-2222-2222-222222222222', 'Someone Else')
        on conflict (id) do update set full_name = excluded.full_name$ins$;
      execute 'reset role';
    end;
  $do$;
$$, '42501', 'a signed-in user may not write another account''s profile row');

-- Gap 2, positive: filling in the account type a provider sign-in left NULL.
select lives_ok($$
  do $do$
    begin
      execute 'set local role authenticated';
      execute $jwt$set local request.jwt.claims =
        '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aud":"authenticated"}'$jwt$;
      execute $upd$update public.profiles set auth_signup_account_type = 'personal'
        where id = auth.uid()$upd$;
      execute 'reset role';
    end;
  $do$;
$$, 'an empty auth_signup_account_type may be filled in by its owner');

select is(
  (select auth_signup_account_type from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'),
  'personal',
  'the filled-in account type is stored');

-- Once set it is frozen: personal <-> business is an admin-side decision.
select throws_ok($$
  do $do$
    begin
      execute 'set local role authenticated';
      execute $jwt$set local request.jwt.claims =
        '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aud":"authenticated"}'$jwt$;
      execute $upd$update public.profiles set auth_signup_account_type = 'business'
        where id = auth.uid()$upd$;
      execute 'reset role';
    end;
  $do$;
$$, '42501', 'a set auth_signup_account_type cannot be re-typed by its owner');

select throws_ok($$
  do $do$
    begin
      execute 'set local role authenticated';
      execute $jwt$set local request.jwt.claims =
        '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aud":"authenticated"}'$jwt$;
      execute $upd$update public.profiles set is_platform_admin = true
        where id = auth.uid()$upd$;
      execute 'reset role';
    end;
  $do$;
$$, '42501', 'a profile cannot promote itself to platform admin');

select throws_ok($$
  do $do$
    begin
      execute 'set local role authenticated';
      execute $jwt$set local request.jwt.claims =
        '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","aud":"authenticated"}'$jwt$;
      execute $upd$update public.profiles set auth_signup_account_type = 'platform_admin'
        where id = auth.uid()$upd$;
      execute 'reset role';
    end;
  $do$;
$$, '42501', 'the account type cannot be typed into the admin escape hatch');

select throws_ok($$
  do $do$
    begin
      execute 'set local role anon';
      execute $ins$insert into public.profiles (id, full_name)
        values ('11111111-1111-1111-1111-111111111111', 'Anonymous')
        on conflict (id) do update set full_name = excluded.full_name$ins$;
      execute 'reset role';
    end;
  $do$;
$$, '42501', 'the new INSERT policy is granted to authenticated only');

select * from finish();
rollback;
