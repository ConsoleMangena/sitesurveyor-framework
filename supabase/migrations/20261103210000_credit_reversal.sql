-- Admin-only reversal for AI credit ledger entries.

-- The ledger has always allowed the kinds 'reversal' and 'adjustment', and the
-- billing UI labels them, but nothing could ever write one. Fiat refunds are not
-- the gap closed here: the PesePay integration exposes no refund endpoint, so
-- money already captured stays captured and deposits remain non-refundable.
-- What SiteSurveyor does control is its own internal accounting, so a platform
-- administrator can now correct a credit balance by appending a reversal:
--
--   * a 'usage' entry charged by mistake is credited back;
--   * a 'purchase' granted against a bad payment verification is clawed back;
--   * a 'refund' issued in error is taken back.
--
-- Reversals are appended, never edits — the ledger stays immutable and the audit
-- trail shows both the original entry and who reversed it and why.

create or replace function public.reverse_workspace_ai_credits(
  p_workspace_id uuid,
  p_transaction_id uuid,
  p_reason text
)
returns table(transaction_id uuid, remaining_balance bigint, credits_reversed bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original public.workspace_ai_credit_transactions%rowtype;
  v_existing public.workspace_ai_credit_transactions%rowtype;
  v_balance bigint;
  v_delta bigint;
  v_operation_id text;
  v_transaction_id uuid;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_platform_admin
  ) then
    raise exception 'Platform administrator access required';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A reversal needs a written reason';
  end if;

  v_operation_id := 'reverse:' || p_transaction_id::text;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || v_operation_id, 0));

  select * into v_original
  from public.workspace_ai_credit_transactions
  where id = p_transaction_id
    and workspace_id = p_workspace_id;
  if not found then
    raise exception 'AI credit entry not found in this workspace';
  end if;
  if v_original.kind not in ('purchase', 'usage', 'refund') then
    raise exception 'Only purchases, usage and refunds can be reversed';
  end if;
  -- Recording a provider refund already takes these credits back. Reversing the
  -- same purchase again would be a second claw-back of one grant.
  if v_original.kind = 'purchase' and exists (
    select 1 from public.workspace_pesepay_transactions t
    where t.id = v_original.related_id
      and t.status = 'refunded'
  ) then
    raise exception
      'That purchase was refunded; its credits were reclaimed when the refund was recorded';
  end if;

  -- Repeating a reversal is a no-op, not a second credit.
  select * into v_existing
  from public.workspace_ai_credit_transactions
  where workspace_id = p_workspace_id
    and kind = 'reversal'
    and operation_id = v_operation_id;
  if found then
    select balance into v_balance
    from public.workspace_ai_credit_accounts
    where workspace_id = p_workspace_id;
    return query select v_existing.id, v_balance, -v_existing.credits_delta;
    return;
  end if;

  insert into public.workspace_ai_credit_accounts (workspace_id)
  values (p_workspace_id)
  on conflict (workspace_id) do nothing;

  select balance into v_balance
  from public.workspace_ai_credit_accounts
  where workspace_id = p_workspace_id
  for update;

  v_delta := -v_original.credits_delta;
  if v_balance + v_delta < 0 then
    raise exception
      'Reversal would take the workspace below zero credits (% available)',
      v_balance;
  end if;

  update public.workspace_ai_credit_accounts
  set balance = balance + v_delta, updated_at = now()
  where workspace_id = p_workspace_id
  returning balance into v_balance;

  insert into public.workspace_ai_credit_transactions (
    workspace_id, actor_user_id, kind, credits_delta, balance_after,
    operation_id, description, related_id
  ) values (
    p_workspace_id, auth.uid(), 'reversal', v_delta, v_balance,
    v_operation_id, trim(p_reason), v_original.id
  ) returning id into v_transaction_id;

  return query select v_transaction_id, v_balance, abs(v_delta);
end;
$$;

-- Unlike the fulfilment and spending helpers, this one is called straight from
-- the admin console; the platform-administrator test above is what authorises it.
revoke all on function public.reverse_workspace_ai_credits(uuid, uuid, text)
  from public, anon;
grant execute on function public.reverse_workspace_ai_credits(uuid, uuid, text)
  to authenticated;

comment on function public.reverse_workspace_ai_credits(uuid, uuid, text) is
  'Append a reversing ledger entry for one AI credit entry. Platform administrators only; idempotent per reversed entry; never moves fiat money.';
