-- Guards on the two administrator-only billing corrections.
--
-- Run with: supabase start && supabase db reset && supabase test db
-- (the extension is created inside the rolled-back transaction, so nothing is
-- installed permanently and no migration is needed for pgTAP).
--
-- These cover what a browser test cannot see: that the privilege check happens
-- in the database at all, and that it defaults to refusing the call. The
-- entitlement maths in the same functions is covered by the vitest suites that
-- drive the billing UI.
--
-- STATUS: not executed yet. The development machine this was written on has no
-- running Docker daemon, so `supabase start` cannot bring up the local Postgres
-- that pgTAP needs. Treat these as unverified until they run.

begin;
create extension if not exists pgtap;

select plan(6);

-- No JWT, therefore no profile, therefore not a platform administrator.
select throws_ok(
  'select public.record_pesepay_transaction_refund(gen_random_uuid(), ''duplicate charge, settled with provider'')',
  'P0001',
  'Platform administrator access required',
  'a signed-in non-administrator cannot record a refund'
);

select throws_ok(
  'select public.reverse_workspace_ai_credits(gen_random_uuid(), gen_random_uuid(), ''charged twice for one chat'')',
  'P0001',
  'Platform administrator access required',
  'a signed-in non-administrator cannot reverse a credit entry'
);

select throws_ok(
  'select public.record_pesepay_transaction_refund(gen_random_uuid(), null)',
  'P0001',
  'Platform administrator access required',
  'a missing reason is refused before anything else is checked'
);

-- The functions are callable from the admin console, but not anonymously and
-- not through the service-role-only path the rest of billing uses.
select ok(
  has_function_privilege('authenticated', 'public.record_pesepay_transaction_refund(uuid, text)', 'execute'),
  'authenticated administrators can reach the refund function'
);

select ok(
  not has_function_privilege('anon', 'public.record_pesepay_transaction_refund(uuid, text)', 'execute'),
  'anonymous callers cannot reach the refund function'
);

select ok(
  not has_function_privilege('anon', 'public.reverse_workspace_ai_credits(uuid, uuid, text)', 'execute'),
  'anonymous callers cannot reach the credit reversal function'
);

select * from finish();
rollback;
