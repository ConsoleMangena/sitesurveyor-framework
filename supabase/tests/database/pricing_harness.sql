-- The minimal schema the survey pricing migration needs, so it can be exercised on a
-- bare Postgres. The real database has all of this; this file stands in for it when
-- the pricing SQL is tested away from a full Supabase stack.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  instance_id uuid,
  aud text,
  role text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text,
  type text not null default 'personal',
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'owner',
  status text not null default 'active',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_operation_rates (
  operation text primary key,
  label text not null,
  credits bigint not null,
  estimated_cost numeric(12, 2) not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

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

create table if not exists public.survey_runs (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  status text not null default 'queued',
  half_deg numeric,
  categories text[],
  created_at timestamptz not null default now()
);

insert into public.billing_operation_rates (operation, label, credits, estimated_cost)
values ('satellite.survey', 'Satellite survey', 20, 0.20)
on conflict (operation) do nothing;

-- The refund path, copied from 20261103120000_billing_credits.sql. A survey that is
-- charged at a computed price has to give back exactly that price, so the function
-- has to be present to test it.
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
