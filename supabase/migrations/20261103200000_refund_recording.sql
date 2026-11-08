-- Recording a settled refund, with the entitlements it takes back.

-- PesePay gives this integration no refund call (the sandbox contract is
-- create-order + check-order), so the money side is settled with the provider
-- out of band: support issues the refund, then records it here. Until now the
-- 'refunded' status was legal in the table but nothing could ever write it, so
-- the refunds line in platform reporting was permanently zero and a refunded
-- purchase kept the credits, storage or wallet balance it had been granted.
--
-- This function closes that gap the way the ledger already works: one
-- administrator action, one database transaction, and every entitlement the
-- payment bought is walked back in the same statement set.
--
--   * ai_credit_purchase  the credits the purchase granted are reclaimed,
--                         capped at what is still unspent (the account can
--                         never go below zero, so credits already used are a
--                         loss the caller is told about rather than a negative
--                         balance);
--   * storage_purchase    the purchased allocation stops counting immediately.
--                         Files are never deleted: over-quota bytes fall into
--                         the same grace state as an expired allocation, which
--                         is the product rule for storage that has run out.
--   * deposit             the wallet balance the deposit added is taken back,
--                         again capped at what is still there.
--   * invoice_payment     revenue event only. The document was produced and
--                         delivered, so nothing is revoked.
--
-- Credits already consumed by AI turns are reclaimed as one 'reversal' entry,
-- which keeps the credit ledger append-only and shows both the original
-- purchase and the correction against it.

alter table public.workspace_pesepay_transactions
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_reason text,
  add column if not exists refunded_by uuid references public.profiles (id) on delete set null;

-- A refunded row always carries who recorded it and why, so the status can only
-- ever come from this function and never from a bare update.
-- The captured base schema already carries this constraint; drop it so the
-- migration stays replayable against both a fresh and an existing database.
alter table public."workspace_pesepay_transactions" drop constraint if exists "workspace_pesepay_transactions_refund_shape";
alter table public.workspace_pesepay_transactions
  drop constraint if exists workspace_pesepay_transactions_refund_shape,
  add constraint workspace_pesepay_transactions_refund_shape
  check (status <> 'refunded' or (refunded_at is not null and refund_reason is not null));

create or replace function public.record_pesepay_transaction_refund(
  p_transaction_id uuid,
  p_reason text
)
returns table(status text, credits_granted bigint, credits_reclaimed bigint,
              storage_mb_revoked integer, balance_reclaimed numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transaction public.workspace_pesepay_transactions%rowtype;
  v_balance bigint;
  v_wallet_balance numeric;
  v_already bigint := 0;
  v_granted bigint := 0;
  v_reclaimed bigint := 0;
  v_revoked_mb integer := 0;
  v_balance_reclaimed numeric := 0;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_platform_admin
  ) then
    raise exception 'Platform administrator access required';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A refund needs a written reason';
  end if;

  -- One lock per payment, so two administrators recording the same refund
  -- cannot both claw back the same credits.
  perform pg_advisory_xact_lock(hashtextextended('refund:' || p_transaction_id::text, 0));

  select * into v_transaction
  from public.workspace_pesepay_transactions
  where id = p_transaction_id
  for update;
  if not found then
    raise exception 'Transaction not found';
  end if;

  -- Repeating the call is a no-op, not a second claw-back.
  if v_transaction.status = 'refunded' then
    return query select
      v_transaction.status,
      coalesce(v_transaction.credit_amount, 0)::bigint,
      0::bigint,
      0,
      0::numeric;
    return;
  end if;
  if v_transaction.status <> 'completed' then
    raise exception 'Only a completed payment can be refunded (this one is %)',
      v_transaction.status;
  end if;

  if v_transaction.kind = 'ai_credit_purchase' then
    v_granted := coalesce(v_transaction.credit_amount, 0);

    insert into public.workspace_ai_credit_accounts (workspace_id)
    values (v_transaction.workspace_id)
    on conflict (workspace_id) do nothing;

    select balance into v_balance
    from public.workspace_ai_credit_accounts
    where workspace_id = v_transaction.workspace_id
    for update;

    -- An administrator may already have reversed this grant with the credit
    -- correction tool, so count what is already gone. Without that, the two
    -- correction paths could each take the same credits.
    select coalesce(sum(-t.credits_delta), 0)::bigint into v_already
    from public.workspace_ai_credit_transactions t
    where t.workspace_id = v_transaction.workspace_id
      and t.kind = 'reversal'
      and t.related_id = v_transaction.related_id
      and t.credits_delta < 0;

    v_reclaimed := least(
      greatest(v_granted - v_already, 0),
      greatest(coalesce(v_balance, 0), 0)
    );
    if v_reclaimed > 0 then
      update public.workspace_ai_credit_accounts
      set balance = balance - v_reclaimed, updated_at = now()
      where workspace_id = v_transaction.workspace_id
      returning balance into v_balance;

      insert into public.workspace_ai_credit_transactions (
        workspace_id, actor_user_id, kind, credits_delta, balance_after,
        operation_id, description, related_id
      ) values (
        v_transaction.workspace_id, auth.uid(), 'reversal', -v_reclaimed, v_balance,
        'refund:' || v_transaction.id::text,
        'Refund of ' || v_transaction.description,
        v_transaction.related_id
      );
    end if;
  end if;

  if v_transaction.kind = 'storage_purchase' then
    -- Ends the allocation window instead of deleting anything: the quota
    -- function counts purchases where expires_at > now(), so the bytes stay
    -- available and simply stop being paid for.
    update public.workspace_storage_purchases
    set expires_at = greatest(
      starts_at + interval '1 second',
      least(expires_at, now())
    )
    where id = v_transaction.related_id
      and workspace_id = v_transaction.workspace_id
      and not included_in_base_quota
      and starts_at <= now()
      and (expires_at is null or expires_at > now())
    returning storage_mb into v_revoked_mb;
  end if;

  if v_transaction.kind = 'deposit' then
    select balance into v_wallet_balance
    from public.workspace_pesepay_wallets
    where id = v_transaction.wallet_id
    for update;

    v_balance_reclaimed := least(coalesce(v_wallet_balance, 0), v_transaction.amount);
    if v_balance_reclaimed > 0 then
      update public.workspace_pesepay_wallets
      set balance = balance - v_balance_reclaimed, updated_at = now()
      where id = v_transaction.wallet_id;
    end if;
  end if;

  update public.workspace_pesepay_transactions
  set status = 'refunded',
      refunded_at = now(),
      refund_reason = trim(p_reason),
      refunded_by = auth.uid()
  where id = v_transaction.id;

  return query select
    'refunded'::text,
    v_granted,
    v_reclaimed,
    v_revoked_mb,
    v_balance_reclaimed;
end;
$$;

-- Called straight from the billing console by a platform administrator; the
-- administrator test inside the function is what authorises it. Same deviation
-- from the service_role-only convention as reverse_workspace_ai_credits().
revoke all on function public.record_pesepay_transaction_refund(uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_pesepay_transaction_refund(uuid, text)
  to authenticated;

comment on function public.record_pesepay_transaction_refund(uuid, text) is
  'Record a refund settled with the provider and revoke what the payment granted. Platform administrators only; idempotent per payment.';
