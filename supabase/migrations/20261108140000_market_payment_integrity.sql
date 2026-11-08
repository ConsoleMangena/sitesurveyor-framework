-- Marketplace payments: record before transfer, pay the current wallet, and
-- never let the browser assert that money arrived.
--
-- Three defects this closes, in the order the buyer hits them:
--
--  1. The order row was only inserted *after* the wallet transfer resolved. A
--     dropped connection, a closed tab or an RLS failure after signing left the
--     buyer paid with no record, and nothing to retry against.
--  2. `payment_status` was whatever the client sent - including "completed",
--     which was written the moment the wallet reported a signature, without
--     anybody checking the chain.
--  3. The payout address was copied onto the listing when it was created. A
--     seller who later rotated their wallet kept receiving nothing, because
--     buyers were still told to pay the old address.
--
-- Fixes: `market_listing_payout` resolves the seller workspace's *current*
-- wallet at pay time; `market_order_attach_signature` / `market_order_cancel`
-- move a pending order along and fix the status themselves; a trigger refuses
-- a client-written "completed" and refuses to reopen a completed order. Only a
-- service-role worker (see `supabase/functions/market-verify-payment`) can mark
-- a payment completed, after checking the transaction on chain.

-- ── Where should this listing be paid today? ──
-- Reads the seller workspace (not readable by a buyer under RLS) and falls back
-- to the address copied onto the listing for sellers who never set a workspace
-- wallet.
create or replace function public.market_listing_payout(p_listing_id uuid)
returns table (workspace_id uuid, wallet_address text)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.workspace_id,
    coalesce(
      nullif(w.marketplace_wallet_address, ''),
      nullif(l.seller_wallet_address, '')
    ) as wallet_address
  from public.marketplace_listings l
  left join public.workspaces w on w.id = l.workspace_id
  where l.id = p_listing_id;
$$;

comment on function public.market_listing_payout(uuid) is
  'Seller workspace and the wallet that listing should be paid to right now.';

revoke all on function public.market_listing_payout(uuid) from public;
grant execute on function public.market_listing_payout(uuid) to anon, authenticated;

-- ── Attach the signature the wallet returned ──
-- Own row, still pending, no reference yet. Status becomes "submitted": the
-- transfer exists but is *not* confirmed until the verifier says so.
create or replace function public.market_order_attach_signature(
  p_order_id uuid,
  p_signature text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if coalesce(trim(p_signature), '') = '' then
    raise exception 'A transaction signature is required.';
  end if;

  update public.marketplace_orders
     set external_payment_ref = p_signature,
         payment_status = 'submitted',
         updated_at = now()
   where id = p_order_id
     and payment_status = 'pending'
     and external_payment_ref is null
  returning payment_status into v_status;

  if v_status is null then
    raise exception 'That payment is not open for a signature (it may already be confirmed).';
  end if;

  return v_status;
end;
$$;

revoke all on function public.market_order_attach_signature(uuid, text) from public;
grant execute on function public.market_order_attach_signature(uuid, text) to authenticated;

-- ── Abandon a pending order the wallet never signed ──
-- Leaves the row behind as `cancelled` so a half-finished checkout is visible
-- rather than silently absent.
create or replace function public.market_order_cancel(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  update public.marketplace_orders
     set payment_status = 'cancelled',
         updated_at = now()
   where id = p_order_id
     and payment_status = 'pending'
     and external_payment_ref is null
  returning payment_status into v_status;

  return coalesce(v_status, 'unchanged');
end;
$$;

revoke all on function public.market_order_cancel(uuid) from public;
grant execute on function public.market_order_cancel(uuid) to authenticated;

-- ── Status is not the client's to write ──
create or replace function public.guard_marketplace_order_status()
returns trigger
language plpgsql
as $$
declare
  v_privileged boolean := current_user in ('service_role', 'postgres', 'supabase_admin');
begin
  if v_privileged then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Checkout starts pending; the signature is attached by function afterwards.
    if new.payment_status is distinct from 'pending' then
      new.payment_status := 'pending';
    end if;
    new.external_payment_ref := null;
    return new;
  end if;

  if new.payment_status = 'completed' and old.payment_status <> 'completed' then
    raise exception 'Payments are confirmed from the transaction, not the browser.';
  end if;

  if old.payment_status = 'completed' and new.payment_status <> 'completed' then
    raise exception 'A completed payment cannot be reopened.';
  end if;

  if new.external_payment_ref is distinct from old.external_payment_ref
     and old.external_payment_ref is not null then
    raise exception 'A recorded transaction signature cannot be replaced.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_marketplace_order_status on public.marketplace_orders;
create trigger guard_marketplace_order_status
  before insert or update on public.marketplace_orders
  for each row execute function public.guard_marketplace_order_status();
