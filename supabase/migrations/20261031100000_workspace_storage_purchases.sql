create table public.workspace_storage_purchases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  purchased_by uuid references auth.users (id) on delete set null,
  plan_id text not null check (plan_id in ('10gb', '50gb', '100gb')),
  storage_mb integer not null check (storage_mb > 0),
  amount numeric(12, 2) not null check (amount > 0),
  currency_code text not null check (currency_code = 'USD'),
  payment_method text not null default 'balance' check (payment_method = 'balance'),
  created_at timestamptz not null default now(),
  paid_at timestamptz not null default now()
);

create index workspace_storage_purchases_workspace_created_idx
  on public.workspace_storage_purchases (workspace_id, created_at desc);

alter table public.workspace_storage_purchases enable row level security;

create policy "workspace_storage_purchases_select_member"
  on public.workspace_storage_purchases for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_storage_purchases.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );
