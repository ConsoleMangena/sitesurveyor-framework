create table if not exists public.billing_packages (
  id text primary key,
  kind text not null check (kind in ('ai_credits', 'storage')),
  label text not null,
  description text not null,
  credits bigint check (credits is null or credits > 0),
  storage_mb integer check (storage_mb is null or storage_mb > 0),
  duration_days integer check (duration_days is null or duration_days > 0),
  amount numeric(12, 2) not null check (amount > 0),
  currency_code text not null default 'USD' check (currency_code = 'USD'),
  estimated_infrastructure_cost numeric(12, 2) not null default 0 check (estimated_infrastructure_cost >= 0),
  estimated_payment_fee numeric(12, 2) not null default 0 check (estimated_payment_fee >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'ai_credits' and credits is not null and storage_mb is null and duration_days is null)
    or (kind = 'storage' and credits is null and storage_mb is not null and duration_days is not null)
  )
);

insert into public.billing_packages (
  id, kind, label, description, credits, storage_mb, duration_days, amount,
  estimated_infrastructure_cost, estimated_payment_fee, sort_order
) values
  ('credits-100', 'ai_credits', '100 AI credits', 'For occasional AI chat and workspace analysis.', 100, null, null, 4, 0.50, 0.40, 10),
  ('credits-500', 'ai_credits', '500 AI credits', 'A lower unit price for regular professional use.', 500, null, null, 15, 3.00, 1.00, 20),
  ('credits-2000', 'ai_credits', '2,000 AI credits', 'For teams with sustained AI workloads.', 2000, null, null, 40, 12.00, 2.50, 30),
  ('10gb', 'storage', '10 GB for 30 days', 'Additional private workspace storage for 30 days.', null, 10240, 30, 2, 0.45, 0.25, 40),
  ('50gb', 'storage', '50 GB for 90 days', 'Additional private workspace storage for 90 days.', null, 51200, 90, 8, 3.75, 0.65, 50),
  ('100gb', 'storage', '100 GB for 90 days', 'Additional private workspace storage for 90 days.', null, 102400, 90, 14, 7.00, 1.00, 60);

create table if not exists public.billing_operation_rates (
  operation text primary key,
  credits bigint not null check (credits > 0),
  estimated_cost numeric(12, 2) not null default 0 check (estimated_cost >= 0),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.billing_operation_rates (operation, credits, estimated_cost) values
  ('ai.chat', 2, 0.02);

alter table public.billing_packages enable row level security;
alter table public.billing_operation_rates enable row level security;

create policy "billing_packages_select_active"
  on public.billing_packages for select
  to authenticated
  using (active);

create policy "billing_operation_rates_select_active"
  on public.billing_operation_rates for select
  to authenticated
  using (active);

alter table public.workspace_storage_purchases
  drop constraint if exists workspace_storage_purchases_plan_id_check,
  drop constraint if exists workspace_storage_purchases_payment_method_check;

-- The captured base schema already carries this constraint; drop it so the
-- migration stays replayable against both a fresh and an existing database.
alter table public."workspace_storage_purchases" drop constraint if exists "workspace_storage_purchases_dates_check";
alter table public."workspace_storage_purchases" drop constraint if exists "workspace_storage_purchases_payment_method_check";
alter table public.workspace_storage_purchases
  add column if not exists starts_at timestamptz not null default now(),
  add column if not exists expires_at timestamptz,
  add column if not exists included_in_base_quota boolean not null default false,
  add constraint workspace_storage_purchases_dates_check
    check (expires_at is null or expires_at > starts_at),
  add constraint workspace_storage_purchases_payment_method_check
    check (payment_method in ('balance', 'pesepay_checkout'));

update public.workspace_storage_purchases
set included_in_base_quota = true
where included_in_base_quota = false;

-- The captured base schema already carries this constraint; drop it so the
-- migration stays replayable against both a fresh and an existing database.
alter table public."workspace_storage_purchases" drop constraint if exists "workspace_storage_purchases_plan_id_fkey";
alter table public.workspace_storage_purchases
  add constraint workspace_storage_purchases_plan_id_fkey
  foreign key (plan_id) references public.billing_packages (id);

create index if not exists workspace_storage_purchases_active_idx
  on public.workspace_storage_purchases (workspace_id, starts_at, expires_at)
  where included_in_base_quota = false;

alter table public.workspace_pesepay_transactions
  drop constraint if exists workspace_pesepay_transactions_kind_check,
  drop constraint if exists workspace_pesepay_transactions_status_check,
  drop constraint if exists workspace_pesepay_transactions_currency_code_check;

-- The captured base schema already carries this constraint; drop it so the
-- migration stays replayable against both a fresh and an existing database.
alter table public."workspace_pesepay_transactions" drop constraint if exists "workspace_pesepay_transactions_kind_check";
alter table public."workspace_pesepay_transactions" drop constraint if exists "workspace_pesepay_transactions_status_check";
alter table public."workspace_pesepay_transactions" drop constraint if exists "workspace_pesepay_transactions_currency_code_check";
alter table public.workspace_pesepay_transactions
  add column if not exists package_id text references public.billing_packages (id),
  add column if not exists credit_amount bigint check (credit_amount is null or credit_amount > 0),
  add column if not exists storage_mb integer check (storage_mb is null or storage_mb > 0),
  add column if not exists duration_days integer check (duration_days is null or duration_days > 0),
  add column if not exists estimated_infrastructure_cost numeric(12, 2) not null default 0,
  add column if not exists estimated_payment_fee numeric(12, 2) not null default 0,
  add column if not exists provider_status text,
  add constraint workspace_pesepay_transactions_kind_check
    check (kind in ('deposit', 'storage_purchase', 'ai_credit_purchase', 'invoice_payment')),
  add constraint workspace_pesepay_transactions_status_check
    check (status in ('pending', 'completed', 'failed', 'cancelled', 'refunded')),
  add constraint workspace_pesepay_transactions_currency_code_check
    check (currency_code in ('USD', 'ZWL'));

create index if not exists workspace_pesepay_transactions_created_idx
  on public.workspace_pesepay_transactions (workspace_id, created_at desc, id);

create table if not exists public.workspace_ai_credit_accounts (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_ai_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('purchase', 'usage', 'refund', 'reversal', 'adjustment')),
  credits_delta bigint not null check (credits_delta <> 0),
  balance_after bigint not null check (balance_after >= 0),
  operation_id text not null,
  description text not null,
  related_id uuid,
  created_at timestamptz not null default now(),
  unique (workspace_id, kind, operation_id)
);

create index if not exists workspace_ai_credit_transactions_workspace_created_idx
  on public.workspace_ai_credit_transactions (workspace_id, created_at desc);

alter table public.workspace_ai_credit_accounts enable row level security;
alter table public.workspace_ai_credit_transactions enable row level security;

create policy "workspace_ai_credit_accounts_select_member"
  on public.workspace_ai_credit_accounts for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_ai_credit_accounts.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

create policy "workspace_ai_credit_transactions_select_member"
  on public.workspace_ai_credit_transactions for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_ai_credit_transactions.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

create or replace function public.protect_ai_credit_ledger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'AI credit ledger entries are immutable';
end;
$$;

create trigger workspace_ai_credit_transactions_immutable
  before update or delete on public.workspace_ai_credit_transactions
  for each row execute function public.protect_ai_credit_ledger();

create or replace function public.fulfil_workspace_package_purchase(
  p_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.workspace_pesepay_transactions%rowtype;
  v_balance bigint;
  v_ledger_id uuid;
  v_purchase_id uuid;
begin
  select * into v_transaction
  from public.workspace_pesepay_transactions
  where id = p_transaction_id
    and kind in ('ai_credit_purchase', 'storage_purchase')
  for update;

  if not found then
    raise exception 'Package purchase not found';
  end if;
  if v_transaction.status = 'refunded' then
    raise exception 'A refunded purchase cannot be fulfilled again';
  end if;
  if v_transaction.status = 'completed' and v_transaction.related_id is not null then
    return v_transaction.related_id;
  end if;

  if v_transaction.kind = 'ai_credit_purchase' then
    if v_transaction.credit_amount is null then
      raise exception 'AI credit purchase snapshot is incomplete';
    end if;

    insert into public.workspace_ai_credit_accounts (workspace_id)
    values (v_transaction.workspace_id)
    on conflict (workspace_id) do nothing;

    update public.workspace_ai_credit_accounts
    set balance = balance + v_transaction.credit_amount,
        updated_at = now()
    where workspace_id = v_transaction.workspace_id
    returning balance into v_balance;

    insert into public.workspace_ai_credit_transactions (
      workspace_id, actor_user_id, kind, credits_delta, balance_after,
      operation_id, description, related_id
    ) values (
      v_transaction.workspace_id, v_transaction.user_id, 'purchase',
      v_transaction.credit_amount, v_balance,
      'package:' || v_transaction.id::text,
      v_transaction.description, v_transaction.id
    ) returning id into v_ledger_id;

    update public.workspace_pesepay_transactions
    set status = 'completed', related_id = v_ledger_id,
        completed_at = coalesce(completed_at, now())
    where id = v_transaction.id;
    return v_ledger_id;
  end if;

  if v_transaction.storage_mb is null or v_transaction.duration_days is null then
    raise exception 'Storage purchase snapshot is incomplete';
  end if;

  insert into public.workspace_storage_purchases (
    id, workspace_id, purchased_by, plan_id, storage_mb, amount,
    currency_code, payment_method, paid_at, starts_at, expires_at,
    included_in_base_quota
  ) values (
    v_transaction.id, v_transaction.workspace_id, v_transaction.user_id,
    v_transaction.package_id, v_transaction.storage_mb, v_transaction.amount,
    v_transaction.currency_code,
    case when v_transaction.pesepay_reference is null then 'balance' else 'pesepay_checkout' end,
    now(), now(), now() + make_interval(days => v_transaction.duration_days), false
  )
  on conflict (id) do nothing
  returning id into v_purchase_id;

  if v_purchase_id is null then
    v_purchase_id := v_transaction.id;
  end if;

  update public.workspace_pesepay_transactions
  set status = 'completed', related_id = v_purchase_id,
      completed_at = coalesce(completed_at, now())
  where id = v_transaction.id;
  return v_purchase_id;
end;
$$;

create or replace function public.settle_workspace_package_purchase(
  p_reference text,
  p_amount numeric,
  p_currency_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.workspace_pesepay_transactions%rowtype;
begin
  select * into v_transaction
  from public.workspace_pesepay_transactions
  where pesepay_reference = p_reference
    and kind in ('ai_credit_purchase', 'storage_purchase')
  for update;

  if not found then
    raise exception 'Package purchase not found';
  end if;
  if p_amount is null
    or p_currency_code is null
    or abs(v_transaction.amount - p_amount) > 0.01
    or v_transaction.currency_code <> p_currency_code then
    raise exception 'Pesepay amount or currency does not match the package purchase';
  end if;

  return public.fulfil_workspace_package_purchase(v_transaction.id);
end;
$$;

create or replace function public.pay_workspace_package_with_balance(
  p_workspace_id uuid,
  p_user_id uuid,
  p_package_id text,
  p_request_id uuid
)
returns table(purchase_id uuid, remaining_balance numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_package public.billing_packages%rowtype;
  v_wallet public.workspace_pesepay_wallets%rowtype;
  v_existing public.workspace_pesepay_transactions%rowtype;
  v_balance numeric(14, 2);
  v_related_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select role::text into v_role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = p_user_id
    and status = 'active';
  if v_role is null or v_role not in ('owner', 'admin', 'finance') then
    raise exception 'Only workspace owners, admins, and finance managers can purchase packages';
  end if;

  select * into v_existing
  from public.workspace_pesepay_transactions
  where id = p_request_id
  for update;

  if found then
    if v_existing.workspace_id <> p_workspace_id
      or v_existing.user_id <> p_user_id
      or v_existing.package_id is distinct from p_package_id
      or v_existing.pesepay_reference is not null
      or v_existing.status <> 'completed' then
      raise exception 'Package payment request is not reusable';
    end if;
    select balance into v_balance
    from public.workspace_pesepay_wallets
    where workspace_id = p_workspace_id and user_id = p_user_id;
    return query select v_existing.related_id, v_balance;
    return;
  end if;

  select * into v_package
  from public.billing_packages
  where id = p_package_id and active;
  if not found then
    raise exception 'Unknown or inactive package';
  end if;

  select * into v_wallet
  from public.workspace_pesepay_wallets
  where workspace_id = p_workspace_id and user_id = p_user_id
  for update;
  if not found or v_wallet.balance < v_package.amount then
    raise exception 'Insufficient PesePay balance. Add funds or use PesePay checkout';
  end if;

  update public.workspace_pesepay_wallets
  set balance = balance - v_package.amount, updated_at = now()
  where id = v_wallet.id
  returning balance into v_balance;

  insert into public.workspace_pesepay_transactions (
    id, wallet_id, workspace_id, user_id, kind, amount, currency_code,
    status, description, package_id, credit_amount, storage_mb, duration_days,
    estimated_infrastructure_cost, estimated_payment_fee
  ) values (
    p_request_id, v_wallet.id, p_workspace_id, p_user_id,
    case when v_package.kind = 'ai_credits' then 'ai_credit_purchase' else 'storage_purchase' end,
    v_package.amount, v_package.currency_code, 'pending', v_package.label,
    v_package.id, v_package.credits, v_package.storage_mb, v_package.duration_days,
    v_package.estimated_infrastructure_cost, v_package.estimated_payment_fee
  );

  v_related_id := public.fulfil_workspace_package_purchase(p_request_id);
  return query select v_related_id, v_balance;
end;
$$;

create or replace function public.pay_workspace_storage_with_balance(
  p_workspace_id uuid,
  p_user_id uuid,
  p_plan_id text,
  p_request_id uuid
)
returns table(purchase_id uuid, remaining_balance numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select * from public.pay_workspace_package_with_balance(
    p_workspace_id, p_user_id, p_plan_id, p_request_id
  );
end;
$$;

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
declare
  v_rate public.billing_operation_rates%rowtype;
  v_balance bigint;
  v_existing public.workspace_ai_credit_transactions%rowtype;
  v_transaction_id uuid;
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

  insert into public.workspace_ai_credit_accounts (workspace_id)
  values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  select balance into v_balance
  from public.workspace_ai_credit_accounts
  where workspace_id = p_workspace_id
  for update;
  if v_balance < v_rate.credits then
    raise exception using errcode = 'P0002', message = 'INSUFFICIENT_AI_CREDITS';
  end if;

  update public.workspace_ai_credit_accounts
  set balance = balance - v_rate.credits, updated_at = now()
  where workspace_id = p_workspace_id
  returning balance into v_balance;

  insert into public.workspace_ai_credit_transactions (
    workspace_id, actor_user_id, kind, credits_delta, balance_after,
    operation_id, description
  ) values (
    p_workspace_id, p_user_id, 'usage', -v_rate.credits, v_balance,
    p_operation_id, coalesce(nullif(p_description, ''), p_operation)
  ) returning id into v_transaction_id;

  return query select v_transaction_id, v_balance, v_rate.credits;
end;
$$;

create or replace function public.refund_workspace_ai_credits(
  p_workspace_id uuid,
  p_user_id uuid,
  p_operation_id text,
  p_reason text
)
returns table(transaction_id uuid, remaining_balance bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage public.workspace_ai_credit_transactions%rowtype;
  v_existing public.workspace_ai_credit_transactions%rowtype;
  v_balance bigint;
  v_transaction_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_operation_id, 0));

  select * into v_usage
  from public.workspace_ai_credit_transactions
  where workspace_id = p_workspace_id
    and kind = 'usage'
    and operation_id = p_operation_id
  for update;
  if not found then
    raise exception 'AI usage transaction not found';
  end if;
  if v_usage.actor_user_id is distinct from p_user_id then
    raise exception 'Not authorised to refund this AI operation';
  end if;

  select * into v_existing
  from public.workspace_ai_credit_transactions
  where workspace_id = p_workspace_id
    and kind = 'refund'
    and operation_id = p_operation_id;
  if found then
    select balance into v_balance
    from public.workspace_ai_credit_accounts
    where workspace_id = p_workspace_id;
    return query select v_existing.id, v_balance;
    return;
  end if;

  update public.workspace_ai_credit_accounts
  set balance = balance - v_usage.credits_delta, updated_at = now()
  where workspace_id = p_workspace_id
  returning balance into v_balance;

  insert into public.workspace_ai_credit_transactions (
    workspace_id, actor_user_id, kind, credits_delta, balance_after,
    operation_id, description, related_id
  ) values (
    p_workspace_id, p_user_id, 'refund', -v_usage.credits_delta, v_balance,
    p_operation_id, coalesce(nullif(p_reason, ''), 'AI operation failed'), v_usage.id
  ) returning id into v_transaction_id;

  return query select v_transaction_id, v_balance;
end;
$$;

create or replace function public.workspace_storage_limit_bytes(p_workspace_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select (
    coalesce((select w.storage_limit_mb from public.workspaces w where w.id = p_workspace_id), 0)::bigint
    + coalesce((
        select sum(sp.storage_mb)
        from public.workspace_storage_purchases sp
        where sp.workspace_id = p_workspace_id
          and not sp.included_in_base_quota
          and sp.starts_at <= now()
          and (sp.expires_at is null or sp.expires_at > now())
      ), 0)::bigint
  ) * 1048576;
$$;

create or replace function public.get_workspace_storage_usage(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_used_bytes bigint;
  v_file_count integer;
  v_limit_bytes bigint;
  v_limit_mb numeric;
  v_purchased_mb numeric;
  v_expiring_mb numeric;
  v_next_expiry timestamptz;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' and not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
  ) then
    raise exception 'Not authorised to inspect this workspace storage';
  end if;

  select coalesce(sum(coalesce(nullif(o.metadata ->> 'size', '')::bigint, 0)), 0)
  into v_used_bytes
  from storage.objects o
  where o.bucket_id in ('workspace-private', 'workspace-public')
    and o.name like p_workspace_id::text || '/%';

  select count(*)::integer into v_file_count
  from public.attachments a
  where a.workspace_id = p_workspace_id;

  v_limit_bytes := public.workspace_storage_limit_bytes(p_workspace_id);
  v_limit_mb := v_limit_bytes / 1048576.0;

  select
    coalesce(sum(sp.storage_mb), 0)::numeric,
    coalesce(sum(sp.storage_mb) filter (
      where sp.expires_at is not null and sp.expires_at <= now() + interval '7 days'
    ), 0)::numeric,
    min(sp.expires_at)
  into v_purchased_mb, v_expiring_mb, v_next_expiry
  from public.workspace_storage_purchases sp
  where sp.workspace_id = p_workspace_id
    and not sp.included_in_base_quota
    and sp.starts_at <= now()
    and (sp.expires_at is null or sp.expires_at > now());

  return jsonb_build_object(
    'used_bytes', v_used_bytes,
    'file_count', v_file_count,
    'limit_mb', round(v_limit_mb, 2),
    'base_limit_mb', v_limit_mb - coalesce(v_purchased_mb, 0),
    'purchased_storage_mb', coalesce(v_purchased_mb, 0),
    'expiring_storage_mb', coalesce(v_expiring_mb, 0),
    'next_storage_expiration', v_next_expiry,
    'used_mb', round(v_used_bytes / 1048576.0, 2),
    'percent', case when v_limit_bytes = 0 then 0 else round((v_used_bytes::numeric / v_limit_bytes * 100), 1) end,
    'over_quota', v_used_bytes > v_limit_bytes,
    'upload_allowed', v_used_bytes < v_limit_bytes
  );
end;
$$;

create or replace function public.enforce_workspace_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_used_bytes bigint;
  v_limit_bytes bigint;
  v_old_bytes bigint := 0;
  v_new_bytes bigint;
begin
  if new.bucket_id not in ('workspace-private', 'workspace-public') then
    return new;
  end if;

  begin
    v_workspace_id := (string_to_array(new.name, '/'))[1]::uuid;
  exception when invalid_text_representation then
    return new;
  end;

  select coalesce(sum(coalesce(nullif(o.metadata ->> 'size', '')::bigint, 0)), 0)
  into v_used_bytes
  from storage.objects o
  where o.bucket_id in ('workspace-private', 'workspace-public')
    and o.name like v_workspace_id::text || '/%';

  if tg_op = 'UPDATE'
    and old.bucket_id in ('workspace-private', 'workspace-public')
    and old.name like v_workspace_id::text || '/%' then
    v_old_bytes := coalesce(nullif(old.metadata ->> 'size', '')::bigint, 0);
  end if;
  v_new_bytes := coalesce(nullif(new.metadata ->> 'size', '')::bigint, 0);
  v_limit_bytes := public.workspace_storage_limit_bytes(v_workspace_id);

  if greatest(0, v_used_bytes - v_old_bytes) + v_new_bytes > v_limit_bytes then
    raise exception using
      errcode = 'P0002',
      message = 'STORAGE_QUOTA_EXCEEDED: New uploads are paused. Existing files are retained; renew storage or remove files before uploading.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_workspace_storage_quota on storage.objects;
create trigger enforce_workspace_storage_quota
  before insert or update of bucket_id, name, metadata on storage.objects
  for each row execute function public.enforce_workspace_storage_quota();

create or replace function public.get_workspace_billing_overview(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_credits_used bigint;
  v_total_spent numeric;
  v_total_spent_zwl numeric;
  v_wallet_balance numeric;
  v_successful_purchases bigint;
  v_pending_payments bigint;
  v_failed_payments bigint;
  v_storage jsonb;
begin
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'Not authorised to inspect this workspace billing';
  end if;

  select coalesce(ca.balance, 0), coalesce(u.used, 0)
  into v_balance, v_credits_used
  from (select 1) seed
  left join public.workspace_ai_credit_accounts ca on ca.workspace_id = p_workspace_id
  left join (
    select -sum(t.credits_delta) as used
    from public.workspace_ai_credit_transactions t
    where t.workspace_id = p_workspace_id and t.kind = 'usage'
  ) u on true;

  select
    coalesce(sum(t.amount) filter (
      where t.status = 'completed' and t.currency_code = 'USD'
        and t.kind in ('storage_purchase', 'ai_credit_purchase', 'invoice_payment')
    ), 0),
    coalesce(sum(t.amount) filter (
      where t.status = 'completed' and t.currency_code = 'ZWL'
        and t.kind in ('storage_purchase', 'ai_credit_purchase', 'invoice_payment')
    ), 0),
    count(*) filter (
      where t.status = 'completed' and t.kind in ('storage_purchase', 'ai_credit_purchase', 'invoice_payment')
    ),
    count(*) filter (where t.status = 'pending'),
    count(*) filter (where t.status in ('failed', 'cancelled'))
  into v_total_spent, v_total_spent_zwl, v_successful_purchases, v_pending_payments, v_failed_payments
  from public.workspace_pesepay_transactions t
  where t.workspace_id = p_workspace_id;

  select coalesce(sum(w.balance), 0) into v_wallet_balance
  from public.workspace_pesepay_wallets w
  where w.workspace_id = p_workspace_id;

  v_storage := public.get_workspace_storage_usage(p_workspace_id);
  return jsonb_build_object(
    'ai_credit_balance', v_balance,
    'ai_credits_used', v_credits_used,
    'wallet_balance', v_wallet_balance,
    'total_spent', v_total_spent,
    'total_spent_zwl', v_total_spent_zwl,
    'currency_code', 'USD',
    'successful_purchases', v_successful_purchases,
    'pending_payments', v_pending_payments,
    'failed_payments', v_failed_payments,
    'storage', v_storage
  );
end;
$$;

create or replace function public.get_platform_financial_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_gross numeric;
  v_refunds numeric;
  v_fees numeric;
  v_infrastructure numeric;
  v_transactions bigint;
  v_successful bigint;
  v_ai_credit_units bigint;
  v_storage_mb bigint;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_platform_admin
  ) then
    raise exception 'Platform administrator access required';
  end if;

  select
    coalesce(sum(t.amount) filter (
      where t.status = 'completed' and t.currency_code = 'USD'
        and t.kind in ('storage_purchase', 'ai_credit_purchase', 'invoice_payment')
    ), 0),
    coalesce(sum(t.amount) filter (where t.status = 'refunded' and t.currency_code = 'USD'), 0),
    coalesce(sum(t.estimated_payment_fee) filter (
      where t.status in ('completed', 'refunded') and t.currency_code = 'USD'
    ), 0),
    coalesce(sum(t.estimated_infrastructure_cost) filter (
      where t.status in ('completed', 'refunded') and t.currency_code = 'USD'
    ), 0),
    count(*),
    count(*) filter (where t.status = 'completed'),
    coalesce(sum(t.credit_amount) filter (where t.status = 'completed' and t.kind = 'ai_credit_purchase'), 0),
    coalesce(sum(t.storage_mb) filter (where t.status = 'completed' and t.kind = 'storage_purchase'), 0)
  into v_gross, v_refunds, v_fees, v_infrastructure, v_transactions, v_successful, v_ai_credit_units, v_storage_mb
  from public.workspace_pesepay_transactions t;

  return jsonb_build_object(
    'gross_revenue', v_gross,
    'refunds', v_refunds,
    'payment_fees', v_fees,
    'infrastructure_costs', v_infrastructure,
    'estimated_profit', v_gross - v_refunds - v_fees - v_infrastructure,
    'transaction_volume', v_transactions,
    'successful_orders', v_successful,
    'ai_credits_sold', v_ai_credit_units,
    'storage_mb_sold', v_storage_mb,
    'currency_code', 'USD',
    'cost_basis', 'Configurable estimates recorded at purchase time, not reconciled actual provider invoices.'
  );
end;
$$;

revoke all on function public.fulfil_workspace_package_purchase(uuid) from public, anon, authenticated;
revoke all on function public.settle_workspace_package_purchase(text, numeric, text) from public, anon, authenticated;
revoke all on function public.pay_workspace_package_with_balance(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.pay_workspace_storage_with_balance(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.spend_workspace_ai_credits(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.refund_workspace_ai_credits(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.workspace_storage_limit_bytes(uuid) from public, anon, authenticated;

grant execute on function public.fulfil_workspace_package_purchase(uuid) to service_role;
grant execute on function public.settle_workspace_package_purchase(text, numeric, text) to service_role;
grant execute on function public.pay_workspace_package_with_balance(uuid, uuid, text, uuid) to service_role;
grant execute on function public.pay_workspace_storage_with_balance(uuid, uuid, text, uuid) to service_role;
grant execute on function public.spend_workspace_ai_credits(uuid, uuid, text, text, text) to service_role;
grant execute on function public.refund_workspace_ai_credits(uuid, uuid, text, text) to service_role;
grant execute on function public.workspace_storage_limit_bytes(uuid) to service_role;
grant execute on function public.get_workspace_storage_usage(uuid) to authenticated;
grant execute on function public.get_workspace_billing_overview(uuid) to authenticated;
grant execute on function public.get_platform_financial_overview() to authenticated;
