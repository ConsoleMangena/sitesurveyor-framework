-- Raise every billing package price by 25%.

-- The operator reviewed the catalog in PRICING.md and decided the package
-- prices should carry more of the platform's costs — particularly the storage
-- durability tail and the unmeasured AI model spend noted there. All six
-- packages go up by 25%, rounded to the nearest cent:
--
--   credits-100   $4.00  -> $5.00     credits-2000  $40.00 -> $50.00
--   credits-500  $15.00  -> $18.75    10gb           $2.00  -> $2.50
--   50gb           $8.00  -> $10.00    100gb         $14.00 -> $17.50
--
-- The unit price still falls with volume: 5c, 3.75c and 2.5c per AI credit.
--
-- estimated_infrastructure_cost is unchanged — it is a marginal cost derived
-- from the Supabase overage rate in PRICING.md and does not move with the sale
-- price. estimated_payment_fee is the 3.5% placeholder assumption recomputed
-- against the new amounts, still pending the contracted PesePay rate.
--
-- Historical transactions keep the estimates recorded at purchase time, so
-- this changes only how future purchases are priced and costed.

update public.billing_packages set
  amount = case id
    when 'credits-100'   then 5.00
    when 'credits-500'   then 18.75
    when 'credits-2000'  then 50.00
    when '10gb'          then 2.50
    when '50gb'          then 10.00
    when '100gb'         then 17.50
    else amount
  end,
  estimated_payment_fee = case id
    when 'credits-100'   then 0.18
    when 'credits-500'   then 0.66
    when 'credits-2000'  then 1.75
    when '10gb'          then 0.09
    when '50gb'          then 0.35
    when '100gb'         then 0.61
    else estimated_payment_fee
  end,
  updated_at = now()
where id in ('credits-100', 'credits-500', 'credits-2000', '10gb', '50gb', '100gb');
