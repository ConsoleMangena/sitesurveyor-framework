-- The signup trigger must never abort an auth.users insert.
--
-- Run with: supabase start && supabase db reset && supabase test db
-- (the extension is created inside the rolled-back transaction, so nothing is
-- installed permanently and no migration is needed for pgTAP).
--
-- STATUS: not executed yet. The development machine this was written on has no
-- running Docker daemon, so `supabase start` cannot bring up the local Postgres
-- that pgTAP needs. The collision case itself was verified against the hosted
-- database by replaying the failing insert inside `begin; ... rollback;`.

begin;
create extension if not exists pgtap;

select plan(7);

select has_trigger('auth.users', 'on_auth_user_created',
  'the repo recreates the signup trigger, so db reset bootstraps profiles and workspaces');

-- The regression: GitHub returns an email already claimed by another account's
-- profile row (a wallet account whose email was saved onto the profile only,
-- with auth.users.email still NULL). Before the guard this raised 23505 out of
-- the trigger and GoTrue reported "Database error saving new user".
insert into public.profiles (id, email, full_name)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'shared-owner@example.com',
  'Existing wallet account'
);

select lives_ok(
  $$insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'authenticated', 'authenticated', 'shared-owner@example.com',
      '{"provider":"github","providers":["github"]}'::jsonb,
      '{"sub":"12345678","email":"shared-owner@example.com","name":"GitHub Human"}'::jsonb,
      now(), now()
    )$$,
  'a signup whose email is already mirrored onto another profile still completes');

select ok(
  exists(select 1 from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'the new account gets a profile row');

select is(
  (select email from public.profiles where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  null::text,
  'the contested address is left off the mirror rather than stealing it');

select is(
  (select email from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'shared-owner@example.com',
  'the existing profile keeps the address it already had');

select ok(
  exists(
    select 1 from public.workspaces w
    join public.workspace_members m on m.workspace_id = w.id
    where m.user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'the new account gets its own workspace');

-- The unremarkable case is unchanged: a free address is still recorded.
select lives_ok(
  $$insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'authenticated', 'authenticated', 'free-address@example.com',
      '{"provider":"github","providers":["github"]}'::jsonb,
      '{"sub":"87654321","email":"free-address@example.com"}'::jsonb,
      now(), now()
    )$$,
  'a signup with an uncontested email completes');

select * from finish();
rollback;
