# Documentation audit

A claim-by-claim check of this repository's documents against its code, run on 2026-11-08.
Everything found has been fixed except the CAD gap below, which needs a product decision.

> **Correction (same day, after the payment work).** Item 1 of the CAD finding below
> said the CAD tables do not exist. They do exist in deployed projects — what was
> missing was the *migration*. `apps/web/src/lib/supabase/types.ts` is generated from a
> live database and contains `project_cad_drawings` and `project_cad_metrics`, as well
> as base tables such as `workspaces`, `projects` and `marketplace_orders` that no file
> in `supabase/migrations/` created. The real defect was that this repository could not
> rebuild its own database: the migrations were deltas over a base schema that had
> never been committed. That is now fixed — see
> [the baseline schema finding](#finding-the-base-schema-is-not-versioned-here-fixed).
> The CAD *UI* claim is still wrong; see the section below.

Sections: [CAD finding](#finding-the-cad-workspace-is-documented-but-not-present-in-this-repository) ·
[Base schema](#finding-the-base-schema-is-not-versioned-here-fixed) ·
[Related gaps](#related-gaps-found-in-the-same-audit-not-fixed) · [Fixed in this pass](#fixed-in-the-same-pass-for-reference)

## Finding: the CAD workspace is documented but not present in this repository

**Status:** open — no code or docs were changed for this finding.
**Severity:** high for docs trust; a release blocker only if a deployment advertises CAD.

### What the documentation claims

| Document | Claim |
| --- | --- |
| `README.md:81` | Capability row: "**CAD & project work** — Project drawings, layers and entities, CAD-aware AI inspection, and user-executed AI drafting commands" |
| `README.md:54` | "inspect CAD entities and layers, and prepare CAD commands" |
| `README.md:67` | Lifecycle diagram puts **CAD** in the Execute stage |
| `README.md:147` | Stack row: "CAD project models" |
| `README.md:305` | Boundary: "A user must execute CAD command blocks" |
| `DESIGN.md:24` | System-context diagram: `CAD["Project CAD workspace"]` |
| `DESIGN.md:69` | "Implemented React SPA/PWA, wallet flows, workspaces, project/CAD UI…" |
| `DESIGN.md:193` | "CAD geometry is emitted as command blocks and executed by the user in the project workspace; erase operations have an additional confirmation requirement" |
| `DESIGN.md:203` | Tool-group table: CAD group reads drawings/layers/entities and generates user-executed command blocks |
| `PRODUCT.md:61,67,68,97,123` | CAD records, "user-reviewed CAD commands", CAD inspection |
| `USER_GUIDE.md:50` | "Use **Projects** to work with project drawings and CAD content" |
| `USER_GUIDE.md:139-156` | Layer/entity prompts, "CAD commands appear in a block for you to execute", "CAD erase operations require an additional confirmation flow, and batches support undo in the project workspace" |
| `apps/web/README.md:5` | "project/CAD workflows" |
| `ai-gateway/README.md:14,162` | MCP server exposes "CAD" tools |

### What the repository actually contains

1. **No CAD schema in this repository** — corrected: the relation exists in deployed
   databases (see the correction at the top), but nothing in `supabase/migrations/`
   creates `project_cad_drawings` or any other `cad_*` relation. A deployer following
   `npm run db:push` against an empty project never gets the table.
2. **No CAD UI.** `apps/web` has no drawing canvas, no layer manager, and no command-block executor. `src/features/ai/assistantBlocks.ts` parses only `[ASK]` blocks. The single "execute CAD commands" string in the web app is prose copy in `src/pages/shared/AssistantPage.tsx:152`; nothing consumes it.
3. **`apps/live`, `apps/desktop`, `apps/mobile`** are `.gitkeep` only, so the CAD workspace is not hiding in another client.
4. **The AI tools exist but will fail at runtime.** `supabase/functions/_shared/ai-agent.ts:451-535` defines `get_cad_drawing`, `list_cad_layers`, `count_cad_entities`, `inspect_cad_entity`; the allowlist at `ai-agent.ts:170` includes `project_cad_drawings`, and `ai-agent.ts:1239-1248` and `ai-gateway/sitesurveyor-mcp/src/cad.ts:52`, `constants.ts:29`, `tools.ts:82` all read it. Against a freshly migrated database each call returns 404/empty, so the model is likely to report a missing drawing rather than a missing table.
5. **Trace of the table's real home.** `src/lib/supabase/types.ts:2872` and `:5464` (generated Supabase types) contain `project_cad_drawings` and `project_cad_metrics` with workspace/project foreign keys. That means the relation exists in whatever project the types were generated from, and its migration was never committed here.

### Options

**A. Ship the schema and the UI (large).**
- Add a migration creating `project_cad_drawings` (workspace-scoped JSONB model: `layerArray`, `points`, `linework`, `texts`, `circles`, `arcs`, `ellipses`, `hatches`, `dimensions`, `surfaces`), `project_cad_metrics`, RLS matching the workspace pattern used elsewhere, and grants.
- Add a repository module, a project CAD view, and a command-block executor with the erase confirmation and undo the guide already promises.
- Add tests for entity counting and for the erase path.

**B. Downgrade the claims (small, honest).**
- Remove every "user-executed CAD commands in the project workspace" sentence and drop the CAD capability row from `README.md`.
- Keep the AI CAD tool descriptions but add the dependency explicitly: "requires a `project_cad_drawings` schema that this repository does not create."

**C. Split the difference (recommended).**
- Ship the migration with the JSONB model plus RLS and a read-only project drawing viewer, so the AI tools can read real data.
- Move "user-executed drafting commands, erase confirmation, batch undo" to an explicit **coming soon** note, the way `features/projects/tools/toolRegistry.ts` already handles instrument calibration, field notes and QA flags.

Whichever option is chosen, the fix should land in one change: a doc that promises a screen and a tool that reads a missing table are the same defect.

## Finding: the base schema is not versioned here (fixed)

**Status:** fixed — `supabase/migrations/20260823000000_base_schema.sql`.
**Severity:** high for reproducibility and for the CAD question above.

`apps/web/src/lib/supabase/types.ts` described 80 tables; the migrations created
relations they never defined — `workspaces`, `projects`, `assets`,
`marketplace_listings`, `professionals`, `workspace_members`, `marketplace_orders`,
`project_cad_drawings` and 31 more. **39 of 80 tables (48%) had no `create table`
anywhere in this repository**, so `supabase db reset` produced a database most screens
could not query, and no environment other than the original project could be rebuilt.

### What was done

1. Captured the deployed schema (`npx supabase db dump --schema public`) into
   `20260823000000_base_schema.sql`: 80 tables, 176 RLS policies, 90 functions,
   44 triggers, 16 types, 12 views, 289 constraints, 96 indexes.
2. The dump is the schema *after* every migration, so replaying the deltas on top of it
   collided. Rather than editing history wholesale, the dump was reduced to the part no
   migration owns: the 12 views, 72 policies and 16 triggers that the deltas themselves
   create were removed from it (and their dangling grants/owners with them). Tables and
   indexes were made `if not exists`.
3. Nineteen deltas were made replayable, each with a one-line guard rather than a
   rewrite: `create table if not exists` (18), `create index if not exists` (10),
   `add column if not exists` (14), and `drop constraint if exists` before 14
   `add constraint` statements that the baseline already satisfies.
4. `supabase/config.toml` pointed `db.seed.sql_paths` at `./seed.sql`, which does not
   exist in this repository; demo data lives in migrations. It is now `[]`.

### Proof

`npx supabase start` against an empty Docker stack applied all 54 migrations with
`EXIT=0`. The rebuilt database contains 80 tables, 12 views, 176 policies and 98
functions; `public_market_listings` returns the 22 seeded listings,
`sample_market_item_keys()` returns 52 demo keys, and `market_listing_payout()` resolves
the seller workspace. The payment state machine was exercised on it as well: an
`authenticated` update to `payment_status = 'completed'` fails with *"Payments are
confirmed from the transaction, not the browser."*, and `market_order_attach_signature`
returns `submitted`.

### Found while doing it

`20261103180000_unified_auth_methods.sql` wrote to `auth.users.app_metadata`, which is
not a column on a standard Supabase `auth.users` (it is `raw_app_meta_data`). That
migration could not apply to any freshly created project, this one included; it is
fixed. Anyone applying migrations to a new project before this pass would have hit it.

### Still open

On an **existing** deployment the base schema is already present, so the baseline must
be marked as applied before `db push` (`npx supabase migration repair --status applied
20260823000000`). This is documented in `README.md` and in the file header, but it is an
ops step that has not been performed anywhere yet.

## Finding: marketplace payments trusted the browser (fixed)

**Status:** fixed in `20261108140000_market_payment_integrity.sql`,
`supabase/functions/market-verify-payment`, and `ListingPaymentPanel.tsx`.
`SECURITY.md` §9 already stated the rule — "a submitted signature is not necessarily a
confirmed transaction" — so this was a code defect, not a documentation one.

Three faults were fixed together because they share one code path:

1. The order row was inserted *after* the transfer resolved. A closed tab between
   signing and insert left the buyer paid with no record. The order is now written
   `pending` first, and cancelled (not deleted) if the wallet declines.
2. `payment_status: "completed"` was sent by the client the moment the wallet returned
   a signature. A trigger now forces `pending` on insert, `market_order_attach_signature`
   sets only `submitted`, and only the service role (the verifier, after `getTransaction`
   checks recipient, amount and finality) may write `completed` or reopen it.
3. The payout address was copied onto the listing at creation, so a seller who rotated
   their wallet was still being paid the old address. `market_listing_payout` resolves
   the seller workspace's current wallet at pay time, falling back to the listing copy.

Remaining work on this path: the verifier is new and needs deploying with
`SOLANA_RPC_URL` (and `SOLANA_USDC_MINT` if not using Circle's default mint per cluster);
until it is deployed, orders stop at `submitted` and the panel says so rather than
claiming confirmation.

## Related gaps found in the same audit (not fixed)

- **Undocumented, implemented:** transport/vehicle hire (`/transport` route, `components/transport/*`, `lib/transportHire.ts`, `transport_network` migrations) — no mention in any `.md`.
- **Undocumented:** market concierge AI (`market-chat` edge function, `MarketConcierge.tsx`, `marketChatApi.ts`); marketplace cart/checkout/orders/inquiries/reviews (`features/market/cart.ts`, `checkout.ts`, `repositories/marketplaceOrders.ts`, `marketInquiries.ts`, `marketReviews.ts`).
- **Undocumented:** Earth Observation has a nav item and a full workbench but no `README.md` capability row and no `USER_GUIDE.md` operating steps.
- **Missing from `DESIGN.md` §3:** the `satellite-survey`, `market-chat`, `delete-user` and `backfill-geocode` Edge Functions.
- **Missing from env tables:** `VITE_MOBILE_BUILD` (`apps/web/src/main.tsx:59`).

## Fixed in the same pass (for reference)

Full-file anchoring wording across `README.md`, `USER_GUIDE.md`, `PRODUCT.md`, `apps/web/README.md`, `DESIGN.md`, `SECURITY.md`; the `/auth/wallet` route row; `AnchorPlat`/`AuthTerms`/`.auth-field-row`/`.auth-group-*`; the "seven auth screens plus `/account/security`" and "two `wide` screens" counts; `[20 credits]` in the engine deployment guide; and single-model routing in `DESIGN.md` §6.
