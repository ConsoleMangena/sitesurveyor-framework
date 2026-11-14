-- Platform-admin price management.
--
-- These narrow, browser-callable RPCs are the only write paths the pricing
-- editor needs. Table UPDATE privileges and RLS remain closed: identifiers and
-- package kinds are immutable, values are validated in Postgres, and the admin
-- check happens on every call including reads of inactive rows.

create or replace function public.admin_get_pricing_configuration()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required';
  end if;
  return jsonb_build_object(
    'packages', coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order, p.id)
      from public.billing_packages p), '[]'::jsonb),
    'operations', coalesce((select jsonb_agg(to_jsonb(o) order by o.operation)
      from public.billing_operation_rates o), '[]'::jsonb),
    'surveys', coalesce((select jsonb_agg(to_jsonb(s) order by s.category)
      from public.survey_credit_rates s), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_update_billing_package(
  p_id text,
  p_label text,
  p_description text,
  p_credits bigint,
  p_storage_mb integer,
  p_duration_days integer,
  p_amount numeric,
  p_estimated_infrastructure_cost numeric,
  p_estimated_payment_fee numeric,
  p_active boolean,
  p_sort_order integer
)
returns public.billing_packages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_package public.billing_packages%rowtype;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required';
  end if;
  if p_id is null or p_active is null or p_sort_order is null then
    raise exception 'Package id, status and sort order are required';
  end if;
  if p_label is null or trim(p_label) = '' or p_description is null or trim(p_description) = '' then
    raise exception 'Package label and description are required';
  end if;
  if p_amount is null or p_amount <= 0
    or p_amount in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then
    raise exception 'Package price must be a positive finite amount';
  end if;
  if p_estimated_infrastructure_cost is null or p_estimated_infrastructure_cost < 0
    or p_estimated_infrastructure_cost in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    or p_estimated_payment_fee is null or p_estimated_payment_fee < 0
    or p_estimated_payment_fee in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then
    raise exception 'Cost estimates must be nonnegative finite amounts';
  end if;

  select * into v_package from public.billing_packages where id = p_id for update;
  if not found then raise exception 'Billing package not found'; end if;

  if v_package.kind = 'ai_credits'
    and (p_credits is null or p_credits < 1 or p_storage_mb is not null or p_duration_days is not null) then
    raise exception 'AI credit packages require a positive credit entitlement and no storage fields';
  end if;
  if v_package.kind = 'storage'
    and (p_storage_mb is null or p_storage_mb < 1 or p_duration_days is null or p_duration_days < 1 or p_credits is not null) then
    raise exception 'Storage packages require positive storage and duration entitlements and no credits';
  end if;

  update public.billing_packages set
    label = trim(p_label), description = trim(p_description), credits = p_credits,
    storage_mb = p_storage_mb, duration_days = p_duration_days, amount = p_amount,
    estimated_infrastructure_cost = p_estimated_infrastructure_cost,
    estimated_payment_fee = p_estimated_payment_fee, active = p_active,
    sort_order = p_sort_order, updated_at = now()
  where id = p_id
  returning * into v_package;
  return v_package;
end;
$$;

create or replace function public.admin_update_billing_operation_rate(
  p_operation text,
  p_credits bigint,
  p_estimated_cost numeric,
  p_active boolean
)
returns public.billing_operation_rates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate public.billing_operation_rates%rowtype;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required';
  end if;
  if p_operation is null or p_credits is null or p_credits < 1 or p_active is null then
    raise exception 'Operation id, positive credits and status are required';
  end if;
  if p_estimated_cost is null or p_estimated_cost < 0
    or p_estimated_cost in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then
    raise exception 'Estimated cost must be a nonnegative finite amount';
  end if;

  update public.billing_operation_rates set credits = p_credits,
    estimated_cost = p_estimated_cost, active = p_active, updated_at = now()
  where operation = p_operation
  returning * into v_rate;
  if not found then raise exception 'Billing operation rate not found'; end if;
  return v_rate;
end;
$$;

create or replace function public.admin_update_survey_credit_rate(
  p_category text,
  p_label text,
  p_base_credits bigint,
  p_per_hectare_credits numeric,
  p_minimum_credits bigint,
  p_estimated_cost numeric,
  p_active boolean
)
returns public.survey_credit_rates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate public.survey_credit_rates%rowtype;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required';
  end if;
  if p_label is null or trim(p_label) = '' or p_active is null then
    raise exception 'Survey label and status are required';
  end if;
  if p_base_credits is null or p_base_credits < 0
    or p_minimum_credits is null or p_minimum_credits < 0 then
    raise exception 'Survey base and minimum credits must be nonnegative integers';
  end if;
  if p_per_hectare_credits is null or p_per_hectare_credits < 0
    or p_per_hectare_credits in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)
    or p_estimated_cost is null or p_estimated_cost < 0
    or p_estimated_cost in ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric) then
    raise exception 'Survey rates and cost estimates must be nonnegative finite amounts';
  end if;

  update public.survey_credit_rates set label = trim(p_label),
    base_credits = p_base_credits, per_hectare_credits = p_per_hectare_credits,
    minimum_credits = p_minimum_credits, estimated_cost = p_estimated_cost,
    active = p_active, updated_at = now()
  where category = p_category
  returning * into v_rate;
  if not found then raise exception 'Survey credit rate not found'; end if;
  return v_rate;
end;
$$;

comment on table public.billing_packages is
  'AI credit and storage packages. Members read active packages; platform admins update configuration through admin_update_billing_package.';
comment on table public.billing_operation_rates is
  'AI operation credit prices. Platform admins update configuration through admin_update_billing_operation_rate.';
comment on table public.survey_credit_rates is
  'Credit cost per satellite survey type. Platform admins update formulas through admin_update_survey_credit_rate; quotes and charges share price_satellite_survey.';

revoke all on function public.admin_get_pricing_configuration() from public, anon;
revoke all on function public.admin_update_billing_package(text, text, text, bigint, integer, integer, numeric, numeric, numeric, boolean, integer) from public, anon;
revoke all on function public.admin_update_billing_operation_rate(text, bigint, numeric, boolean) from public, anon;
revoke all on function public.admin_update_survey_credit_rate(text, text, bigint, numeric, bigint, numeric, boolean) from public, anon;
grant execute on function public.admin_get_pricing_configuration() to authenticated;
grant execute on function public.admin_update_billing_package(text, text, text, bigint, integer, integer, numeric, numeric, numeric, boolean, integer) to authenticated;
grant execute on function public.admin_update_billing_operation_rate(text, bigint, numeric, boolean) to authenticated;
grant execute on function public.admin_update_survey_credit_rate(text, text, bigint, numeric, bigint, numeric, boolean) to authenticated;
