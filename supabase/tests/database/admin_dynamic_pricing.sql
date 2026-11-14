-- Platform-admin pricing RPC authorization, row exposure and validation.
--
-- Run with: supabase start && supabase db reset && supabase test db
--
-- STATUS: not executed yet. The development machine has no running Docker
-- daemon, so the local Postgres required by pgTAP is unavailable.
--
-- Calls without an administrator JWT fail before validating their payload.
-- Positive calls use the authenticated role and a profile stamped as a platform
-- administrator, not merely the table owner running pgTAP.

begin;
create extension if not exists pgtap;

select plan(24);

select throws_ok(
  'select public.admin_get_pricing_configuration()',
  'P0001', 'Platform administrator access required',
  'a caller without an administrator profile cannot read inactive pricing'
);
select throws_ok(
  'select public.admin_update_billing_package(null, null, null, null, null, null, null, null, null, null, null)',
  'P0001', 'Platform administrator access required',
  'a non-administrator cannot update a package'
);
select throws_ok(
  'select public.admin_update_billing_operation_rate(null, null, null, null)',
  'P0001', 'Platform administrator access required',
  'a non-administrator cannot update an operation rate'
);
select throws_ok(
  'select public.admin_update_survey_credit_rate(null, null, null, null, null, null, null)',
  'P0001', 'Platform administrator access required',
  'a non-administrator cannot update a survey formula'
);

select ok(has_function_privilege('authenticated', 'public.admin_get_pricing_configuration()', 'execute'),
  'the authenticated admin console can read the complete rate card');
select ok(has_function_privilege('authenticated',
  'public.admin_update_billing_package(text, text, text, bigint, integer, integer, numeric, numeric, numeric, boolean, integer)', 'execute'),
  'the authenticated admin console can reach the package RPC');
select ok(has_function_privilege('authenticated',
  'public.admin_update_billing_operation_rate(text, bigint, numeric, boolean)', 'execute'),
  'the authenticated admin console can reach the operation RPC');
select ok(has_function_privilege('authenticated',
  'public.admin_update_survey_credit_rate(text, text, bigint, numeric, bigint, numeric, boolean)', 'execute'),
  'the authenticated admin console can reach the survey RPC');
select ok(not has_function_privilege('anon', 'public.admin_get_pricing_configuration()', 'execute'),
  'anonymous callers cannot read the complete rate card');
select ok(not has_function_privilege('anon',
  'public.admin_update_billing_package(text, text, text, bigint, integer, integer, numeric, numeric, numeric, boolean, integer)', 'execute'),
  'anonymous callers cannot update packages');
select ok(not has_function_privilege('anon',
  'public.admin_update_billing_operation_rate(text, bigint, numeric, boolean)', 'execute'),
  'anonymous callers cannot update operation rates');
select ok(not has_function_privilege('anon',
  'public.admin_update_survey_credit_rate(text, text, bigint, numeric, bigint, numeric, boolean)', 'execute'),
  'anonymous callers cannot update survey formulas');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (
  '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated',
  'pricing-admin@example.com', '{"provider":"email","providers":["email"]}'::jsonb,
  '{"sub":"4","name":"Pricing Admin"}'::jsonb, now(), now()
);
update public.profiles set is_platform_admin = true
where id = '44444444-4444-4444-4444-444444444444';

select lives_ok($$
  do $do$
  begin
    execute 'set local role authenticated';
    execute $jwt$set local request.jwt.claims =
      '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","aud":"authenticated"}'$jwt$;
    perform public.admin_update_billing_package(
      'credits-100', '125 AI credits', 'Edited for future purchases',
      125, null, null, 6.25, 1.25, 0.22, false, 11
    );
    perform public.admin_update_billing_operation_rate('ai.chat', 3, 0.04, false);
    perform public.admin_update_survey_credit_rate(
      'water', 'Edited groundwater survey', 5, 0.00018001, 11, 0.18, false
    );
    execute 'reset role';
  end;
  $do$;
$$, 'a platform administrator can save all three types of pricing');

select is(
  (select row(label, description, credits, amount, estimated_infrastructure_cost,
    estimated_payment_fee, active, sort_order, kind)::text
   from public.billing_packages where id = 'credits-100'),
  row('125 AI credits', 'Edited for future purchases', 125::bigint, 6.25::numeric,
    1.25::numeric, 0.22::numeric, false, 11, 'ai_credits')::text,
  'all editable package fields change while id and package kind remain fixed'
);
select is(
  (select row(credits, estimated_cost, active)::text
   from public.billing_operation_rates where operation = 'ai.chat'),
  row(3::bigint, 0.04::numeric, false)::text,
  'edited operation credits, estimated cost and active status persist'
);
select is(
  (select row(label, base_credits, per_hectare_credits, minimum_credits, estimated_cost, active)::text
   from public.survey_credit_rates where category = 'water'),
  row('Edited groundwater survey', 5::bigint, 0.00018001::numeric,
    11::bigint, 0.18::numeric, false)::text,
  'survey formulas retain eight-decimal rates and inactive status'
);
select lives_ok($$
  do $do$
  declare
    v_config jsonb;
  begin
    execute 'set local role authenticated';
    v_config := public.admin_get_pricing_configuration();
    if v_config #>> '{packages,0,label}' <> '125 AI credits'
      or (v_config #>> '{packages,0,active}')::boolean then
      raise exception 'Admin configuration omitted the inactive package';
    end if;
    execute 'reset role';
  end;
  $do$;
$$, 'an administrator reads the full configuration including an inactive package');
select throws_ok($$
  do $do$
  begin
    execute 'set local role authenticated';
    perform public.admin_update_billing_operation_rate(
      'not-an-operation', 1, 0, true
    );
    execute 'reset role';
  end;
  $do$;
$$, 'P0001', 'Billing operation rate not found',
  'an administrator cannot create an operation through the update RPC');
select throws_ok($$
  do $do$
  begin
    execute 'set local role authenticated';
    perform public.admin_update_survey_credit_rate(
      'geothermal', 'Missing', 0, 0, 0, 0, true
    );
    execute 'reset role';
  end;
  $do$;
$$, 'P0001', 'Survey credit rate not found',
  'an administrator cannot create a survey category through the update RPC');
select throws_ok($$
  do $do$
  begin
    execute 'set local role authenticated';
    perform public.admin_update_billing_package(
      'credits-100', 'Invalid entitlement', 'Invalid entitlement',
      100, 10240, 30, 5, 0, 0, true, 10
    );
    execute 'reset role';
  end;
  $do$;
$$, 'P0001', 'AI credit packages require a positive credit entitlement and no storage fields',
  'the package kind cannot be changed by supplying storage entitlements');
select throws_ok($$
  do $do$
  begin
    execute 'set local role authenticated';
    perform public.admin_update_billing_package(
      'not-a-package', 'Missing', 'Missing', 1, null, null, 1, 0, 0, true, 0
    );
    execute 'reset role';
  end;
  $do$;
$$, 'P0001', 'Billing package not found', 'an administrator cannot create a package through the update RPC');
select throws_ok($$
  do $do$
  begin
    execute 'set local role authenticated';
    perform public.admin_update_billing_package(
      'credits-100', 'Invalid price', 'Invalid price', 100, null, null,
      'NaN'::numeric, 0, 0, true, 10
    );
    execute 'reset role';
  end;
  $do$;
$$, 'P0001', 'Package price must be a positive finite amount', 'non-finite package prices are refused');
select throws_ok($$
  do $do$
  begin
    execute 'set local role authenticated';
    perform public.admin_update_survey_credit_rate(
      'water', 'Invalid formula', 0, 'NaN'::numeric, 0, 0, true
    );
    execute 'reset role';
  end;
  $do$;
$$, 'P0001', 'Survey rates and cost estimates must be nonnegative finite amounts',
  'non-finite survey rates are refused');

select * from finish();
rollback;
