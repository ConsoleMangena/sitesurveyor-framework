-- What a survey costs, priced from the job it actually is.
--
-- Until now every survey cost 20 credits: one rate in `billing_operation_rates` for
-- whatever the request happened to be. A five-kilometre plot and a fifty-kilometre
-- district cost the same, and so did a groundwater survey and a mineral survey, which
-- is not a price -- it is a flat rate pretending to be one. The work behind a survey
-- scales with the ground it covers (six coverages read across a 30 m grid, then maps,
-- a KMZ and a set of zone polygons rendered from the result) and with which engine does
-- the scoring, so the price now scales the same way.
--
-- The rate card lives in `survey_credit_rates` because that is where an operator can
-- read it: one row per survey type, with the fixed cost of running that engine and the
-- marginal cost of every hectare it analyses. The maths itself is a function, not a
-- formula scattered across a form, so the number the reader is quoted and the number
-- the workspace is charged are the same number by construction.
--
-- The quote is computed on the server. The browser may ask what a job will cost, but it
-- cannot say what it costs: `charge_satellite_survey` prices the request itself and
-- debits exactly that, so a hand-edited request buys the survey it asked for and no
-- more.

-- ── The rate card ──

create table public.survey_credit_rates (
  -- The queue argument and the `survey_runs.categories` value, not the dossier key:
  -- this is what a request names, and the dossier spelling is the engine's.
  category text primary key check (category in ('water', 'minerals', 'soil', 'hazard')),
  label text not null,
  -- What running this engine costs before any ground is scored: the coverages it
  -- reads, the report it writes.
  base_credits bigint not null check (base_credits >= 0),
  -- What every hectare of analysed ground adds. The engine scores a 30 m grid, so this
  -- is really a price per cell (one hectare is about 111 cells).
  per_hectare_credits numeric(14,8) not null default 0 check (per_hectare_credits >= 0),
  -- The floor for this survey type. A plot small enough to be covered by a single
  -- cached raster still costs six coverage reads and a rendered report, so the
  -- marginal rate cannot be allowed to fall to nothing.
  minimum_credits bigint not null check (minimum_credits >= 0),
  -- Marginal cost at $0.01 per credit, the rate PRICING.md derives from `ai.chat`.
  -- Recorded per run on the ledger entry, so the platform's own margin report can be
  -- reconciled against the work done.
  estimated_cost numeric(12, 2) not null default 0 check (estimated_cost >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.survey_credit_rates is
  'Credit cost per satellite survey type: a fixed cost for the engine plus a rate per hectare of analysed ground. Read-only for members; the operator changes prices by migration.';

comment on column public.survey_credit_rates.minimum_credits is
  'Floor for one survey of this type. Reached by small plots, where the fixed cost of reading the coverages dominates the area.';

-- The numbers below are the engine's own shape of work, priced against the old flat
-- rate of 20 credits at the default 13 km extent (about 670 km2, 67,000 ha):
--
--   water     4 + 0.00018/ha   the aquifer scoring and borehole siting run on the
--                              coverages already downloaded, over the whole grid
--   soil      4 + 0.00016/ha   land capability zoning reads the same coverages and
--                              scores the same cells with one fewer factor layer
--   minerals  6 + 0.00024/ha   spectral anomaly detection runs a PCA and an index
--                              stack per cell, the heaviest per-cell work here
--   hazard    6 + 0.00022/ha   multi-hazard overlay carries slope, rainfall and
--                              geology factors together
--
-- At the default extent those come to 17, 15, 22 and 20 credits -- the same order as
-- the flat rate they replace, and now proportional to the work.
insert into public.survey_credit_rates (
  category, label, base_credits, per_hectare_credits, minimum_credits, estimated_cost
) values
  ('water', 'Groundwater survey', 4, 0.00018, 10, 0.17),
  ('minerals', 'Mineral prospectivity survey', 6, 0.00024, 12, 0.22),
  ('soil', 'Soil & land capability survey', 4, 0.00016, 10, 0.15),
  ('hazard', 'Hazard & site safety survey', 6, 0.00022, 12, 0.20);

alter table public.survey_credit_rates enable row level security;

create policy "survey_credit_rates_select_active"
  on public.survey_credit_rates for select
  to authenticated
  using (active);

-- ── Pricing ──

-- The ground a survey covers.
--
-- The engine builds a bounding box `half_deg` either side of the target and floors it
-- to whole 30 m cells in the local UTM zone. The area below is the same box measured on
-- the ground: a degree of longitude is shorter the further you are from the equator,
-- which is exactly why a "one degree" survey is not a fixed amount of work.
create or replace function public.survey_surface_area_km2(
  p_half_deg numeric,
  p_latitude numeric
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_half numeric;
  v_lat numeric;
  v_width_m numeric;
  v_height_m numeric;
begin
  v_half := coalesce(p_half_deg, 0);
  v_lat := coalesce(p_latitude, 0);

  if v_half <= 0 or v_half > 0.5 then
    raise exception 'The study area must be between 0 and 0.5 degrees each way.';
  end if;
  if v_lat < -90 or v_lat > 90 then
    raise exception 'Latitude must be a number between -90 and 90.';
  end if;

  -- The mean metres in a degree of longitude at this latitude, and the mean metres in
  -- a degree of latitude. Both are the same spherical constants the engine's own
  -- extent labels are built from.
  v_width_m := 2 * v_half * 111320 * cos(radians(v_lat));
  v_height_m := 2 * v_half * 110574;

  return round((v_width_m * v_height_m) / 1000000, 3);
end;
$$;

comment on function public.survey_surface_area_km2(numeric, numeric) is
  'Ground area of a survey bounding box in km2, measured the way the engine measures it: a half-degree box each way, in metres, at the latitude of the target.';

-- The quote for one job.
--
-- One function, so the price the reader sees and the price the workspace pays cannot
-- drift apart. It returns the whole breakdown rather than a total, because a total
-- with no explanation is a number a reader has to trust.
create or replace function public.price_satellite_survey(
  p_categories text[],
  p_half_deg numeric,
  p_latitude numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_area_km2 numeric;
  v_area_ha numeric;
  v_total bigint := 0;
  v_line jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_category text;
  v_rate public.survey_credit_rates%rowtype;
  v_credits bigint;
  v_area_credits numeric;
begin
  if p_categories is null or array_length(p_categories, 1) is null then
    raise exception 'Choose at least one survey category.';
  end if;

  v_area_km2 := public.survey_surface_area_km2(p_half_deg, p_latitude);
  v_area_ha := v_area_km2 * 100;

  foreach v_category in array p_categories loop
    select * into v_rate
    from public.survey_credit_rates
    where category = v_category and active;
    if not found then
      raise exception 'Unknown survey category: %', v_category;
    end if;

    -- The marginal cost of the ground, before the floor is applied.
    v_area_credits := v_rate.per_hectare_credits * v_area_ha;
    v_credits := greatest(
      v_rate.minimum_credits,
      ceil(v_rate.base_credits + v_area_credits)::bigint
    );

    v_total := v_total + v_credits;

    v_line := jsonb_build_object(
      'category', v_rate.category,
      'label', v_rate.label,
      'base_credits', v_rate.base_credits,
      'area_credits', round(v_area_credits, 2),
      'credits', v_credits,
      'minimum_credits', v_rate.minimum_credits
    );
    v_rows := v_rows || jsonb_build_array(v_line);
  end loop;

  return jsonb_build_object(
    'credits', v_total,
    'surface_area_km2', v_area_km2,
    'surface_area_ha', round(v_area_ha, 1),
    'half_deg', p_half_deg,
    'latitude', p_latitude,
    'categories', p_categories,
    'lines', v_rows
  );
end;
$$;

comment on function public.price_satellite_survey(text[], numeric, numeric) is
  'The credit cost of a survey, priced from its survey types and the ground they cover. Readable by any signed-in member so the form can quote a job before it is queued.';

-- ── Charging an amount instead of a rate ──

-- The ledger's debit, with the amount decided by the caller.
--
-- The five-argument `spend_workspace_ai_credits` below reads the amount out of
-- `billing_operation_rates`, which is right for a chat turn and wrong for a survey: the
-- price of a survey depends on the job, so it is computed by `charge_satellite_survey`
-- and handed in here. The amount is not taken on trust -- the operation still has to be
-- a registered, active one, so this cannot be used to charge an operation that does not
-- exist. It is a separate name rather than an overload so the generated API types can
-- tell the two apart.
create or replace function public.spend_workspace_ai_credits_with_amount(
  p_workspace_id uuid,
  p_user_id uuid,
  p_operation_id text,
  p_operation text,
  p_description text,
  p_credits bigint
)
returns table(transaction_id uuid, remaining_balance bigint, credits_charged bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate public.billing_operation_rates%rowtype;
  v_balance bigint;
  v_existing public.workspace_ai_credit_transactions%rowtype;
  v_transaction_id uuid;
  v_amount bigint;
begin
  if p_operation_id is null or length(p_operation_id) > 160 then
    raise exception 'A valid AI operation ID is required';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'Not authorised to spend workspace AI credits';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_operation_id, 0));

  select * into v_existing
  from public.workspace_ai_credit_transactions
  where workspace_id = p_workspace_id
    and kind = 'usage'
    and operation_id = p_operation_id;

  if found then
    if v_existing.actor_user_id is distinct from p_user_id then
      raise exception 'AI operation ID is not reusable by another user';
    end if;
    select balance into v_balance
    from public.workspace_ai_credit_accounts
    where workspace_id = p_workspace_id;
    return query select v_existing.id, v_balance, -v_existing.credits_delta;
    return;
  end if;

  select * into v_rate
  from public.billing_operation_rates
  where operation = p_operation and active;
  if not found then
    raise exception 'AI operation is not configured for billing';
  end if;

  v_amount := coalesce(p_credits, v_rate.credits);
  if v_amount is null or v_amount <= 0 then
    raise exception 'AI operation is not configured for billing';
  end if;

  insert into public.workspace_ai_credit_accounts (workspace_id)
  values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  select balance into v_balance
  from public.workspace_ai_credit_accounts
  where workspace_id = p_workspace_id
  for update;
  if v_balance < v_amount then
    raise exception using errcode = 'P0002', message = 'INSUFFICIENT_AI_CREDITS';
  end if;

  update public.workspace_ai_credit_accounts
  set balance = balance - v_amount, updated_at = now()
  where workspace_id = p_workspace_id
  returning balance into v_balance;

  insert into public.workspace_ai_credit_transactions (
    workspace_id, actor_user_id, kind, credits_delta, balance_after,
    operation_id, description
  ) values (
    p_workspace_id, p_user_id, 'usage', -v_amount, v_balance,
    p_operation_id, coalesce(nullif(p_description, ''), p_operation)
  ) returning id into v_transaction_id;

  return query select v_transaction_id, v_balance, v_amount;
end;
$$;

-- The original entry point, unchanged for its callers: the amount comes from the
-- operation's rate row, exactly as it always did.
create or replace function public.spend_workspace_ai_credits(
  p_workspace_id uuid,
  p_user_id uuid,
  p_operation_id text,
  p_operation text,
  p_description text
)
returns table(transaction_id uuid, remaining_balance bigint, credits_charged bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select * from public.spend_workspace_ai_credits_with_amount(
    p_workspace_id, p_user_id, p_operation_id, p_operation, p_description, null
  );
end;
$$;

-- ── Charging a survey ──

-- Price the request and pay for it, in one statement.
--
-- The quote is computed here rather than accepted from the caller, so the amount
-- debited is the amount this job is worth. The description on the ledger entry names
-- the survey and the ground it covered, because a credit ledger a reader cannot
-- reconcile to a job is a ledger they have to trust.
create or replace function public.charge_satellite_survey(
  p_workspace_id uuid,
  p_user_id uuid,
  p_operation_id text,
  p_description text,
  p_categories text[],
  p_half_deg numeric,
  p_latitude numeric
)
returns table(transaction_id uuid, remaining_balance bigint, credits_charged bigint, quote jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote jsonb;
  v_credits bigint;
  v_area_km2 numeric;
  v_charge record;
begin
  v_quote := public.price_satellite_survey(p_categories, p_half_deg, p_latitude);
  v_credits := (v_quote ->> 'credits')::bigint;
  v_area_km2 := (v_quote ->> 'surface_area_km2')::numeric;

  select * into v_charge
  from public.spend_workspace_ai_credits_with_amount(
    p_workspace_id,
    p_user_id,
    p_operation_id,
    'satellite.survey',
    coalesce(
      nullif(p_description, ''),
      format(
        'Satellite survey · %s km2 · %s credit%s',
        round(v_area_km2, 1),
        v_credits,
        case when v_credits = 1 then '' else 's' end
      )
    ),
    v_credits
  );

  return query select v_charge.transaction_id, v_charge.remaining_balance, v_charge.credits_charged, v_quote;
end;
$$;

comment on function public.charge_satellite_survey(uuid, uuid, text, text, text[], numeric, numeric) is
  'Prices a survey from its own specification and debits the workspace for exactly that amount. Service role only: it is the only path that spends credits for a survey.';

-- ── What a run was quoted ──

-- The quote travels with the run, so a reader months later can see what the survey
-- covered and what it cost, and the number can be reconciled against the ledger entry
-- that paid for it.
alter table public.survey_runs
  add column quoted_credits bigint check (quoted_credits is null or quoted_credits > 0),
  add column surface_area_km2 numeric(12, 3) check (surface_area_km2 is null or surface_area_km2 > 0),
  add column credit_quote jsonb;

comment on column public.survey_runs.quoted_credits is
  'Credits charged for this run, priced from the survey types and the ground they covered.';

comment on column public.survey_runs.surface_area_km2 is
  'Ground the run analysed, in square kilometres.';

comment on column public.survey_runs.credit_quote is
  'The full price breakdown for the run: one line per survey type with its fixed cost, its area cost and the credits it came to.';

-- The operation stays registered, because the ledger names it. Its credit count is now
-- the floor a survey can cost -- the smallest charge the rate card can produce -- rather
-- than the price of every survey.
update public.billing_operation_rates
set credits = 10, estimated_cost = 0.10, active = true, updated_at = now()
where operation = 'satellite.survey';

comment on table public.billing_operation_rates is
  'Credit rate per AI operation. For a fixed-price operation (ai.chat) the credits column is the price. For a priced-by-specification operation (satellite.survey) it is the floor, and the real price comes from survey_credit_rates.';

-- ── Privileges ──

revoke all on function public.survey_surface_area_km2(numeric, numeric) from public, anon;
revoke all on function public.price_satellite_survey(text[], numeric, numeric) from public, anon;
revoke all on function public.spend_workspace_ai_credits_with_amount(uuid, uuid, text, text, text, bigint) from public, anon, authenticated;
revoke all on function public.charge_satellite_survey(uuid, uuid, text, text, text[], numeric, numeric) from public, anon, authenticated;

grant execute on function public.survey_surface_area_km2(numeric, numeric) to authenticated, service_role;
grant execute on function public.price_satellite_survey(text[], numeric, numeric) to authenticated, service_role;
grant execute on function public.spend_workspace_ai_credits_with_amount(uuid, uuid, text, text, text, bigint) to service_role;
grant execute on function public.charge_satellite_survey(uuid, uuid, text, text, text[], numeric, numeric) to service_role;
