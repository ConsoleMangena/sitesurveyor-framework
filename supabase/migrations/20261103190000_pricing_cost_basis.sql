-- Align package cost estimates with the model in PRICING.md.

-- The estimates shipped in 20261103120000 were written without a recorded
-- derivation: AI packages assumed roughly half the per-credit cost implied by the
-- platform's own ai.chat rate, and storage packages carried an unexplained buffer.
-- These rows now follow one stated formula against the verified Supabase overage
-- rate, so the admin report can be reconciled to a documented basis:
--
--   storage: (storage_mb / 1024) * (duration_days / 30) * $0.0213 per GB-month
--   credits: credits * $0.01, from the ai.chat rate of $0.02 per 2 credits
--   fee:     3.5% of the package amount, an explicitly unverified placeholder
--            pending the PesePay merchant rate
--
-- Historical transactions keep the estimates recorded at purchase time, so this
-- only changes how future purchases are costed.

update public.billing_packages set
  estimated_infrastructure_cost = case id
    when 'credits-100'   then 1.00
    when 'credits-500'   then 5.00
    when 'credits-2000'  then 20.00
    when '10gb'          then 0.21
    when '50gb'          then 3.20
    when '100gb'         then 6.39
    else estimated_infrastructure_cost
  end,
  estimated_payment_fee = case id
    when 'credits-100'   then 0.14
    when 'credits-500'   then 0.53
    when 'credits-2000'  then 1.40
    when '10gb'          then 0.07
    when '50gb'          then 0.28
    when '100gb'         then 0.49
    else estimated_payment_fee
  end
where id in ('credits-100', 'credits-500', 'credits-2000', '10gb', '50gb', '100gb');

comment on table public.billing_packages is
  'Sellable AI credit and storage packages. Cost estimates follow PRICING.md; RLS is SELECT-only for authenticated, so the operator changes prices by migration.';

comment on column public.billing_packages.estimated_infrastructure_cost is
  'Marginal Supabase cost at purchase time. Excludes the shared platform subscription, egress inside the Pro allowance, and any storage held after the package expires.';

comment on column public.billing_packages.estimated_payment_fee is
  'Assumed merchant fee at 3.5% pending the contracted PesePay rate; not verified.';
