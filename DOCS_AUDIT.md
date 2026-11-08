# Documentation audit

A claim-by-claim check of this repository's documents against its code, run on 2026-11-08.
Everything found has been fixed except the CAD gap below, which needs a product decision.

Sections: [CAD finding](#finding-the-cad-workspace-is-documented-but-not-present-in-this-repository) ·
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

1. **No CAD schema.** None of the 50 files in `supabase/migrations/` creates `project_cad_drawings` or any other `cad_*` relation; `grep -rn "project_cad" supabase/migrations/` returns nothing. A deployer following `npm run db:push` therefore never gets the table.
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

## Related gaps found in the same audit (not fixed)

- **Undocumented, implemented:** transport/vehicle hire (`/transport` route, `components/transport/*`, `lib/transportHire.ts`, `transport_network` migrations) — no mention in any `.md`.
- **Undocumented:** market concierge AI (`market-chat` edge function, `MarketConcierge.tsx`, `marketChatApi.ts`); marketplace cart/checkout/orders/inquiries/reviews (`features/market/cart.ts`, `checkout.ts`, `repositories/marketplaceOrders.ts`, `marketInquiries.ts`, `marketReviews.ts`).
- **Undocumented:** Earth Observation has a nav item and a full workbench but no `README.md` capability row and no `USER_GUIDE.md` operating steps.
- **Missing from `DESIGN.md` §3:** the `satellite-survey`, `market-chat`, `delete-user` and `backfill-geocode` Edge Functions.
- **Missing from env tables:** `VITE_MOBILE_BUILD` (`apps/web/src/main.tsx:59`).

## Fixed in the same pass (for reference)

Full-file anchoring wording across `README.md`, `USER_GUIDE.md`, `PRODUCT.md`, `apps/web/README.md`, `DESIGN.md`, `SECURITY.md`; the `/auth/wallet` route row; `AnchorPlat`/`AuthTerms`/`.auth-field-row`/`.auth-group-*`; the "seven auth screens plus `/account/security`" and "two `wide` screens" counts; `[20 credits]` in the engine deployment guide; and single-model routing in `DESIGN.md` §6.
