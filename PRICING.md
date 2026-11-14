# Pricing and cost basis

Internal cost model for SiteSurveyor's paid packages. This is **not** a published
rate card: it records where each number comes from, which parts are measured, and
which parts are assumptions waiting on a provider document. The billing dashboard
quotes these figures as `Cost basis: Configurable estimates recorded at purchase
time, not reconciled actual provider invoices.` — that wording is deliberate.

Provider rates below were read from [Supabase pricing](https://supabase.com/pricing)
on 2026-11-03. Re-check before changing any price.

## Verified provider rates

| Item | Rate | Source |
| --- | --- | --- |
| Supabase Pro project | $25 / month | supabase.com/pricing |
| File storage included on Pro | 100 GB | supabase.com/pricing |
| File storage overage | $0.0213 / GB / month | supabase.com/pricing |
| Egress included on Pro | 250 GB / month | supabase.com/pricing |
| Egress overage | $0.09 / GB | supabase.com/pricing |
| Database storage overage | $0.125 / GB / month | supabase.com/pricing |

The Pro platform fee, database growth, Edge Function invocations and AI model
spend are **shared** costs: no single package owns them, so no package carries
them. They are covered by the platform subscription, and margin analysis at the
package level therefore measures marginal cost only.

## How each estimate is derived

**Storage packages**

```
gb_months   = (storage_mb / 1024) × (duration_days / 30)
infra_cost  = gb_months × $0.0213
```

- Assumption **S1** — no egress is attributed to a package. Normal workspace
  traffic sits inside the 250 GB/month already included on Pro. If the project
  starts billing egress, add `downloaded_gb × $0.09` per package.
- Assumption **S2** — the estimate covers only the paid window. SiteSurveyor never
  deletes a user's file when an allocation expires; expired bytes stop counting
  toward the quota but keep occupying storage. See the durability risk below.

**AI credit packages**

```
cost_per_credit = ai.chat rate cost / ai.chat rate credits = $0.02 / 2 = $0.01
infra_cost      = credits × $0.01
```

- Assumption **A1** — every credit is eventually redeemed. Real breakage (credits
  purchased and never spent) only improves the margin, so this is the conservative
  case.
- Assumption **A2** — `billing_operation_rates.estimated_cost` of $0.02 per chat
  turn is a placeholder. No token usage is recorded per turn today, so the number
  is not measured. Until it is, treat the AI margins below as unverified.

**Payment fees**

- Assumption **P1** — 3.5% of the package amount. **This is not verified.** The
  PesePay integration returns a captured amount but no merchant fee, and no PesePay
  rate card is available in this repository. Replace `estimated_payment_fee` with
  the contracted rate before quoting any profit figure.

**Satellite survey credit cost**

A survey is priced from the job it actually is, not from a flat rate. The rate card
is `survey_credit_rates`, one row per survey type:

```
area_km2    = survey_surface_area_km2(half_deg, latitude)
credits     = max(minimum_credits,
                   ceil(base_credits + per_hectare_credits × area_km2 × 100))
```

The area is the engine's own bounding box — a `half_deg` box either side of the
target, measured in metres at the target's latitude, which is why a survey near the
pole covers less ground than the same box at the equator.

| Survey type | Fixed | Per hectare | Floor |
| --- | --- | --- | --- |
| Groundwater (`water`) | 4 | 0.00018 | 10 |
| Soil & land capability (`soil`) | 4 | 0.00016 | 10 |
| Mineral prospectivity (`minerals`) | 6 | 0.00024 | 12 |
| Hazard & site safety (`hazard`) | 6 | 0.00022 | 12 |

At the default 13 km extent (about 668 km², 66,800 ha) these come to 17, 15, 23
and 21 credits — the same order as the flat 20-credit rate they replace, and now
proportional to the work. The floor covers the cost of reading the coverages and
writing the report, which does not shrink for a small plot.

- Assumption **S3** — the fixed cost per type is the engine's own shape of work:
  how many coverage reads it performs and how heavy the per-cell scoring is
  (the mineral engine runs a PCA and an index stack per cell; the soil engine reads
  the same coverages with one fewer factor layer). These are engineering estimates,
  not measurements.
- Assumption **S4** — imagery depth is not priced. A survey that reads more
  products costs more to run, but that depth is not yet defensibly quantifiable, so
  the price covers survey type and analysed ground only.

The price is computed by the database (`price_satellite_survey`) and the same
computation debits the workspace (`charge_satellite_survey`), so the quoted number
and the charged number cannot drift apart, and a hand-edited request cannot name
its own price. `billing_operation_rates.satellite.survey` keeps its row because
the ledger names the operation; its `credits` value is the floor of the rate card,
not the price of every survey.

**What a job must specify**

The inputs to that formula are not optional. Creating an Earth Observation job
requires the survey type, the coordinate to analyse (latitude and longitude) and
the extent of ground to cover; a job missing any of them is refused before it is
written, because it cannot be priced. The specification is stored on the job
itself as JSON in `jobs.description`:

```json
{"category":"water","latitude":-19.50487,"longitude":29.84598,"halfDeg":0.12}
```

Opening a job restores that coordinate and extent rather than falling back to
defaults, so the price shown is the price of the job as recorded. Launching a
survey re-records the specification from the form, which keeps the job's record
from contradicting the survey that was paid for. Jobs created before this
requirement carry only `{"category":"water"}`; they open with the default ground
and are priced from whatever the form then holds.

## Derived catalog

Prices are the current `billing_packages` rows, raised 25% across the catalog on
2026-11-14 (`20261114000000_package_price_increase.sql`). Contribution = price −
infra − fee.

| Package | Price | Infra (model) | Fee @ 3.5% | Contribution | Margin |
| --- | --- | --- | --- | --- | --- |
| 100 AI credits | $5.00 | $1.00 | $0.18 | $3.82 | 76% |
| 500 AI credits | $18.75 | $5.00 | $0.66 | $13.09 | 70% |
| 2,000 AI credits | $50.00 | $20.00 | $1.75 | $28.25 | 57% |
| 10 GB / 30 days | $2.50 | $0.21 | $0.09 | $2.20 | 88% |
| 50 GB / 90 days | $10.00 | $3.20 | $0.35 | $6.45 | 65% |
| 100 GB / 90 days | $17.50 | $6.39 | $0.61 | $10.50 | 60% |

Every tier stays above break-even on marginal cost even with the conservative
assumptions, and the volume tiers keep a positive margin while offering a lower
unit price (5¢, 3.75¢ and 2.5¢ per AI credit). AI credits are the thinnest at the
largest tier because the per-credit price falls faster than the (unmeasured)
per-credit cost.

## Durability risk the table does not capture

Storage is bought for a window, but the bytes are never auto-deleted. A 100 GB
allocation that expires still costs 100 × $0.0213 = $2.13 every month afterwards,
so the one-off $17.50 payment is consumed after roughly eight months of
continued storage, and the loss grows from there. Whichever way this is resolved
is a product decision that has not been taken:

- expire-and-purge after a grace period, which conflicts with the promise that the
  app never deletes a user's files, or
- a renewal price for continuing storage, which needs a recurring charge and the
  payment provider does not expose one here, or
- treat the permanent tail as a subsidy covered by AI credit margin.

Until it is decided, the recorded `estimated_infrastructure_cost` understates the
true cost of any expired storage package.

## What is configurable, and how it changes

| Control | Where | Who can change it |
| --- | --- | --- |
| Package names, descriptions, prices, sizes, credit amounts, durations, ordering and active flag | Admin → Pricing → Packages | Platform administrator |
| Credits charged per AI operation, its estimated cost and active flag | Admin → Pricing → AI operations | Platform administrator |
| Survey names, fixed cost, per-hectare rate, floor, estimated cost and active flag | Admin → Pricing → Survey formulas | Platform administrator |

The admin editor reads and saves the database rate card through the narrow RPCs in
`20261114010000_admin_dynamic_pricing.sql`. `authenticated` callers can execute
these functions, but every function independently requires `is_platform_admin()`;
ordinary table access remains SELECT-only for active rows. The full configuration,
including inactive rows, is available only through the checked admin read RPC.
Identifiers and package kinds are immutable, and these RPCs update existing rows
rather than creating or deleting catalog entries.

Edits are authoritative as soon as they are saved: they affect future purchases,
charges and quotes without requiring a frontend deployment. Package purchase and
cost estimates are copied onto transactions at fulfilment, so historical snapshots
remain unchanged. The separate `20261114000000_package_price_increase.sql`
migration installs the reviewed 25% increase as the initial catalog for this
release; later browser edits are not reapplied or overwritten by that migration.
Seed values for AI and survey rates remain documented in
`20261103120000_billing_credits.sql`, `20261103190000_pricing_cost_basis.sql` and
`20261107120000_survey_credit_pricing.sql`.

## Refunds in these numbers

PesePay gives this integration no refund call, so revenue is reported as if every
completed payment were kept until a platform administrator records the refund on
the Transactions tab. Recording one moves that payment out of revenue and into
the refunds figure, and takes back whatever the purchase still grants (unspent
credits, the remaining storage window, or the part of the deposit still in the
wallet balance).

`get_platform_financial_overview()` keeps charging the estimated payment fee and
infrastructure cost of a refunded row, on the assumption that the provider does
not return its fee and the bytes already stored were already paid for. Margins in
the table above are therefore pre-refund numbers, which is the optimistic case.

## Open items before any public rate card

1. PesePay merchant fee per currency and per rail (assumption **P1**).
2. Measured model cost per AI turn, which needs token usage recorded per turn
   (assumption **A2**).
3. Actual egress per workspace (assumption **S1**).
4. The expiry decision above (assumption **S2**).
5. Whether imagery depth should carry a surcharge on a survey (assumption **S4**).
6. Whether the $25 platform subscription, database growth and Edge Function
   invocations are charged to COGS at a stated allocation.

Until 1 and 2 land, `estimated_profit` and `Margin` in the admin report are
directional only and must not be quoted externally.
