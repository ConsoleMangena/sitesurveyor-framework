-- The credit cost of a survey, and the debits it causes.
--
-- Run with: supabase start && supabase db reset && supabase test db
-- (the extension is created inside the rolled-back transaction, so nothing is
-- installed permanently and no migration is needed for pgTAP).
--
-- These cover what a browser test cannot see: that the price is computed by the
-- database from the specification, that a bigger plot costs more, that a different
-- survey type costs a different amount, that the floor holds for small plots, and
-- that the debit is exactly the quoted price and is refused when the workspace
-- cannot pay it.
--
-- The web layer's reading of the quote is covered by apps/web/src/lib/surveys/pricing.test.ts.

begin;
create extension if not exists pgtap;

select plan(25);

-- ── The ground a survey covers ──

select ok(
  public.survey_surface_area_km2(0.12, -19.5) > 600
    and public.survey_surface_area_km2(0.12, -19.5) < 700,
  'the default extent covers roughly the area the engine scores'
);

select ok(
  public.survey_surface_area_km2(0.24, -19.5) > 4 * public.survey_surface_area_km2(0.12, -19.5) - 1,
  'twice the extent each way is about four times the ground'
);

select ok(
  public.survey_surface_area_km2(0.12, 0) > public.survey_surface_area_km2(0.12, -60),
  'a box at the equator covers more ground than the same box near the pole'
);

select throws_ok(
  'select public.survey_surface_area_km2(0, -19.5)',
  'P0001',
  'The study area must be between 0 and 0.5 degrees each way.',
  'a survey with no extent is refused'
);

select throws_ok(
  'select public.survey_surface_area_km2(0.12, 91)',
  'P0001',
  'Latitude must be a number between -90 and 90.',
  'a latitude off the globe is refused'
);

-- ── The quote ──

select ok(
  (public.price_satellite_survey(array['water'], 0.12, -19.5) ->> 'credits')::bigint
    = (public.price_satellite_survey(array['water'], 0.12, -19.5) ->> 'credits')::bigint,
  'quoting the same survey twice gives the same price'
);

select ok(
  (public.price_satellite_survey(array['water'], 0.24, -19.5) ->> 'credits')::bigint
    > (public.price_satellite_survey(array['water'], 0.12, -19.5) ->> 'credits')::bigint,
  'a bigger plot costs more than a smaller one'
);

select ok(
  (public.price_satellite_survey(array['minerals'], 0.12, -19.5) ->> 'credits')::bigint
    <> (public.price_satellite_survey(array['water'], 0.12, -19.5) ->> 'credits')::bigint,
  'a different survey type costs a different amount'
);

select ok(
  (public.price_satellite_survey(array['water'], 0.0005, -19.5) ->> 'credits')::bigint
    = (select minimum_credits from public.survey_credit_rates where category = 'water'),
  'a plot too small to fill the fixed cost is charged the floor'
);

select ok(
  (public.price_satellite_survey(array['water'], 0.12, -19.5) ->> 'credits')::bigint
    > (select minimum_credits from public.survey_credit_rates where category = 'water'),
  'a plot large enough to cover the fixed cost is charged more than the floor'
);

select ok(
  jsonb_array_length(public.price_satellite_survey(array['water'], 0.12, -19.5) -> 'lines') = 1,
  'the quote explains itself, one line per survey type'
);

select ok(
  (public.price_satellite_survey(array['water', 'minerals'], 0.12, -19.5) ->> 'credits')::bigint
    = (public.price_satellite_survey(array['water'], 0.12, -19.5) ->> 'credits')::bigint
    + (public.price_satellite_survey(array['minerals'], 0.12, -19.5) ->> 'credits')::bigint,
  'asking for two survey types costs what each of them costs'
);

select throws_ok(
  'select public.price_satellite_survey(array[''geothermal''], 0.12, -19.5)',
  'P0001',
  'Unknown survey category: geothermal',
  'a survey type the platform does not sell is refused'
);

select throws_ok(
  'select public.price_satellite_survey(null, 0.12, -19.5)',
  'P0001',
  'Choose at least one survey category.',
  'a survey with no type at all is refused'
);

-- ── The debit ──

-- A workspace with one active member and a known balance.
insert into auth.users (id, email, instance_id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (
  '11111111-1111-1111-1111-111111111111', 'pricing@test.local', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.workspaces (id, name, slug, type, owner_user_id)
values (
  '22222222-2222-2222-2222-222222222222', 'Pricing Test', 'pricing-test', 'personal',
  '11111111-1111-1111-1111-111111111111'
);

insert into public.workspace_members (workspace_id, user_id, role, status)
values (
  '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'owner', 'active'
);

insert into public.workspace_ai_credit_accounts (workspace_id, balance)
values ('22222222-2222-2222-2222-222222222222', 100);

select ok(
  (select credits_charged from public.charge_satellite_survey(
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'pricing-op-1',
    'Pricing test survey',
    array['water'],
    0.12,
    -19.5
  )) = (public.price_satellite_survey(array['water'], 0.12, -19.5) ->> 'credits')::bigint,
  'the workspace is charged exactly the quoted price'
);

select ok(
  (select balance from public.workspace_ai_credit_accounts
   where workspace_id = '22222222-2222-2222-2222-222222222222') = 100 - (
    public.price_satellite_survey(array['water'], 0.12, -19.5) ->> 'credits')::bigint,
  'the balance falls by the quoted price and nothing else'
);

select ok(
  (select credits_charged from public.charge_satellite_survey(
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'pricing-op-1',
    'Pricing test survey',
    array['water'],
    0.12,
    -19.5
  )) = (public.price_satellite_survey(array['water'], 0.12, -19.5) ->> 'credits')::bigint,
  'charging the same operation twice does not charge twice'
);

-- A workspace that cannot pay for the survey it asked for.
insert into public.workspaces (id, name, slug, type, owner_user_id)
values (
  '33333333-3333-3333-3333-333333333333', 'Broke Test', 'broke-test', 'personal',
  '11111111-1111-1111-1111-111111111111'
);

insert into public.workspace_members (workspace_id, user_id, role, status)
values (
  '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'owner', 'active'
);

insert into public.workspace_ai_credit_accounts (workspace_id, balance)
values ('33333333-3333-3333-3333-333333333333', 1);

select throws_ok(
  'select public.charge_satellite_survey(
    ''33333333-3333-3333-3333-333333333333'',
    ''11111111-1111-1111-1111-111111111111'',
    ''pricing-op-broke'',
    ''Pricing test survey'',
    array[''water''],
    0.12,
    -19.5
  )',
  'P0002',
  'INSUFFICIENT_AI_CREDITS',
  'a workspace that cannot pay for the survey is refused'
);

select ok(
  (select balance from public.workspace_ai_credit_accounts
   where workspace_id = '33333333-3333-3333-3333-333333333333') = 1,
  'a refused survey costs the workspace nothing'
);

-- ── Who may charge ──

select ok(
  not has_function_privilege('anon', 'public.charge_satellite_survey(uuid, uuid, text, text, text[], numeric, numeric)', 'execute'),
  'anonymous callers cannot spend a workspace''s credits'
);

select ok(
  not has_function_privilege('authenticated', 'public.charge_satellite_survey(uuid, uuid, text, text, text[], numeric, numeric)', 'execute'),
  'a signed-in member cannot spend credits directly: the edge function charges for them'
);

select ok(
  has_function_privilege('authenticated', 'public.price_satellite_survey(text[], numeric, numeric)', 'execute'),
  'a signed-in member can ask what a job will cost'
);

-- ── The refund ──

-- A survey that fails has to give back what it took, and what it took was a computed
-- price rather than a rate, so the refund has to read the amount back off the charge.
select ok(
  (select balance from public.workspace_ai_credit_accounts
   where workspace_id = '22222222-2222-2222-2222-222222222222') = 100 - (
    public.price_satellite_survey(array['water'], 0.12, -19.5) ->> 'credits')::bigint,
  'the workspace is down the quoted price before the refund'
);

select public.refund_workspace_ai_credits(
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'pricing-op-1',
  'The survey failed'
);

select ok(
  (select balance from public.workspace_ai_credit_accounts
   where workspace_id = '22222222-2222-2222-2222-222222222222') = 100,
  'a failed survey gives back exactly what it took'
);

select ok(
  (select credits_delta from public.workspace_ai_credit_transactions
   where workspace_id = '22222222-2222-2222-2222-222222222222'
     and kind = 'refund' and operation_id = 'pricing-op-1') = (
    public.price_satellite_survey(array['water'], 0.12, -19.5) ->> 'credits')::bigint,
  'the refund entry on the ledger names the same amount the charge did'
);

select * from finish();
rollback;
