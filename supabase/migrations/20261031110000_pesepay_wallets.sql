create table if not exists public.workspace_pesepay_wallets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  currency_code text not null default 'USD' check (currency_code = 'USD'),
  balance numeric(14, 2) not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id),
  unique (id, workspace_id, user_id)
);

create table if not exists public.workspace_pesepay_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null,
  kind text not null check (kind in ('deposit', 'storage_purchase', 'invoice_payment')),
  amount numeric(14, 2) not null check (amount > 0),
  currency_code text not null default 'USD' check (currency_code = 'USD'),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  description text not null,
  pesepay_reference text,
  related_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (wallet_id, workspace_id, user_id)
    references public.workspace_pesepay_wallets (id, workspace_id, user_id) on delete cascade
);

create index if not exists workspace_pesepay_transactions_user_created_idx
  on public.workspace_pesepay_transactions (workspace_id, user_id, created_at desc);

create unique index if not exists workspace_pesepay_transactions_reference_idx
  on public.workspace_pesepay_transactions (pesepay_reference)
  where pesepay_reference is not null;

alter table public.workspace_pesepay_wallets enable row level security;
alter table public.workspace_pesepay_transactions enable row level security;

create policy "workspace_pesepay_wallets_select_own"
  on public.workspace_pesepay_wallets for select
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_pesepay_wallets.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

create policy "workspace_pesepay_transactions_select_own"
  on public.workspace_pesepay_transactions for select
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_pesepay_transactions.workspace_id
        and wm.user_id = auth.uid()
        and wm.status = 'active'
    )
  );

create or replace function public.settle_workspace_pesepay_deposit(
  p_reference text,
  p_amount numeric,
  p_currency_code text
)
returns void
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
    and kind = 'deposit'
  for update;

  if not found then
    raise exception 'Wallet deposit not found';
  end if;

  if p_amount is null
    or p_currency_code is null
    or abs(v_transaction.amount - p_amount) > 0.01
    or v_transaction.currency_code <> p_currency_code then
    raise exception 'Pesepay amount or currency does not match the wallet deposit';
  end if;

  if v_transaction.status = 'completed' then
    return;
  end if;

  update public.workspace_pesepay_wallets
  set balance = balance + v_transaction.amount,
      updated_at = now()
  where id = v_transaction.wallet_id;

  if not found then
    raise exception 'Wallet not found for deposit';
  end if;

  update public.workspace_pesepay_transactions
  set status = 'completed', completed_at = now()
  where id = v_transaction.id;
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
declare
  v_role text;
  v_storage_mb integer;
  v_amount numeric(14, 2);
  v_balance numeric(14, 2);
  v_wallet public.workspace_pesepay_wallets%rowtype;
  v_purchase public.workspace_storage_purchases%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select role::text into v_role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = p_user_id
    and status = 'active';
  if v_role is null or v_role not in ('owner', 'admin', 'finance') then
    raise exception 'Only workspace owners, admins, and finance managers can purchase storage';
  end if;

  select * into v_purchase
  from public.workspace_storage_purchases
  where id = p_request_id
  for update;

  if found then
    if v_purchase.workspace_id <> p_workspace_id
      or v_purchase.purchased_by is distinct from p_user_id
      or v_purchase.plan_id <> p_plan_id
      or v_purchase.payment_method <> 'balance' then
      raise exception 'Storage payment request is not reusable';
    end if;
    select balance into v_balance
    from public.workspace_pesepay_wallets
    where workspace_id = p_workspace_id and user_id = p_user_id;
    return query select v_purchase.id, v_balance;
    return;
  end if;

  case p_plan_id
    when '10gb' then
      v_storage_mb := 10240;
      v_amount := 5;
    when '50gb' then
      v_storage_mb := 51200;
      v_amount := 15;
    when '100gb' then
      v_storage_mb := 102400;
      v_amount := 30;
    else
      raise exception 'Unknown storage plan';
  end case;

  select * into v_wallet
  from public.workspace_pesepay_wallets
  where workspace_id = p_workspace_id and user_id = p_user_id
  for update;
  if not found or v_wallet.balance < v_amount then
    raise exception 'Insufficient PesePay balance. Add funds before purchasing storage';
  end if;

  update public.workspace_pesepay_wallets
  set balance = balance - v_amount, updated_at = now()
  where id = v_wallet.id
  returning balance into v_balance;

  insert into public.workspace_storage_purchases (
    id, workspace_id, purchased_by, plan_id, storage_mb, amount,
    currency_code, payment_method, paid_at
  ) values (
    p_request_id, p_workspace_id, p_user_id, p_plan_id, v_storage_mb, v_amount,
    'USD', 'balance', now()
  );

  update public.workspaces
  set storage_limit_mb = storage_limit_mb + v_storage_mb,
      updated_at = now()
  where id = p_workspace_id;
  if not found then
    raise exception 'Workspace not found for storage purchase';
  end if;

  insert into public.workspace_pesepay_transactions (
    id, wallet_id, workspace_id, user_id, kind, amount, currency_code,
    status, description, related_id, completed_at
  ) values (
    p_request_id, v_wallet.id, p_workspace_id, p_user_id, 'storage_purchase', v_amount, 'USD',
    'completed', v_storage_mb / 1024 || ' GB workspace storage add-on', p_request_id, now()
  );

  return query select p_request_id, v_balance;
end;
$$;

create or replace function public.pay_workspace_invoice_with_balance(
  p_workspace_id uuid,
  p_user_id uuid,
  p_invoice_id uuid,
  p_request_id uuid
)
returns table(payment_id uuid, remaining_balance numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_balance numeric(14, 2);
  v_wallet public.workspace_pesepay_wallets%rowtype;
  v_invoice public.invoices%rowtype;
  v_payment public.payments%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select role::text into v_role
  from public.workspace_members
  where workspace_id = p_workspace_id
    and user_id = p_user_id
    and status = 'active';
  if v_role is null or v_role not in ('owner', 'admin', 'finance') then
    raise exception 'Only workspace owners, admins, and finance managers can pay invoices from the balance';
  end if;

  select * into v_payment
  from public.payments
  where id = p_request_id
  for update;

  if found then
    if v_payment.workspace_id <> p_workspace_id
      or v_payment.created_by is distinct from p_user_id
      or v_payment.invoice_id is distinct from p_invoice_id
      or v_payment.payment_method <> 'PesePay balance' then
      raise exception 'Invoice payment request is not reusable';
    end if;
    select balance into v_balance
    from public.workspace_pesepay_wallets
    where workspace_id = p_workspace_id and user_id = p_user_id;
    return query select v_payment.id, v_balance;
    return;
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id and workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if v_invoice.status = 'paid' then
    raise exception 'Invoice is already paid';
  end if;
  if v_invoice.currency_code <> 'USD' or v_invoice.total <= 0 then
    raise exception 'Only positive USD invoices can be paid from the PesePay balance';
  end if;

  select * into v_wallet
  from public.workspace_pesepay_wallets
  where workspace_id = p_workspace_id and user_id = p_user_id
  for update;
  if not found or v_wallet.balance < v_invoice.total then
    raise exception 'Insufficient PesePay balance. Add funds before paying this invoice';
  end if;

  update public.workspace_pesepay_wallets
  set balance = balance - v_invoice.total, updated_at = now()
  where id = v_wallet.id
  returning balance into v_balance;

  insert into public.payments (
    id, workspace_id, invoice_id, amount, paid_on, payment_method,
    reference, notes, created_by
  ) values (
    p_request_id, p_workspace_id, p_invoice_id, v_invoice.total, current_date, 'PesePay balance',
    'WALLET-' || p_request_id::text,
    'Invoice ' || v_invoice.invoice_number || ' paid from PesePay balance', p_user_id
  );

  update public.invoices
  set status = 'paid', paid_at = now()
  where id = v_invoice.id;

  insert into public.workspace_pesepay_transactions (
    id, wallet_id, workspace_id, user_id, kind, amount, currency_code,
    status, description, related_id, completed_at
  ) values (
    p_request_id, v_wallet.id, p_workspace_id, p_user_id, 'invoice_payment', v_invoice.total, 'USD',
    'completed', 'Invoice ' || v_invoice.invoice_number || ' payment', p_invoice_id, now()
  );

  return query select p_request_id, v_balance;
end;
$$;

revoke all on function public.settle_workspace_pesepay_deposit(text, numeric, text)
  from public, anon, authenticated;
revoke all on function public.pay_workspace_storage_with_balance(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.pay_workspace_invoice_with_balance(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.settle_workspace_pesepay_deposit(text, numeric, text)
  to service_role;
grant execute on function public.pay_workspace_storage_with_balance(uuid, uuid, text, uuid)
  to service_role;
grant execute on function public.pay_workspace_invoice_with_balance(uuid, uuid, uuid, uuid)
  to service_role;
