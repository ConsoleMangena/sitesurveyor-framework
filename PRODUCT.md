# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Vite + React single-page app in `apps/web`, shipped as a responsive web app with desktop-console and
mobile-web layouts. `apps/desktop` (.NET) and `apps/mobile` (Java Android) are placeholders for platform
targets, not working clients. The Python engine at `apps/engine` is a backend worker.

## Users

**Primary:** surveyors and geospatial field professionals inside a surveying firm's workspace. They
work on a laptop between site visits, run quotes, jobs, dispatch, time tracking and invoices, and
upload evidence (plans, point clouds, site photos) from phones and desktops.

**Also:** firm leads and workspace owners (pricing, team, assets, billing); clients of surveying
firms, who arrive through the public market to find and hire surveyors and compare instruments,
services and training; platform operators, who sit above both in the admin area.

## Product Purpose

An operating system for the surveying trade. It captures the work (quotes, projects, jobs,
dispatch, time and expenses, invoices), keeps the evidence (files, assets, photos, CAD), and settles
the money through separate Solana and fiat rails. The public market publishes the same profession's
instruments, professionals, jobs, firms and training, so demand and supply meet in one place.

SiteSurveyor AI queries real operational and CAD data, prepares reports, and executes allowlisted
record workflows. Solana supplies wallet-native identity, USDC settlement, and tamper-evident file
digests, while sensitive content stays off-chain by default.

Success: a field professional runs a job end to end — quote to settled invoice — without leaving the
workspace, and a client engages a surveyor without knowing the firm's internal tooling.

## Positioning

An AI-powered field-service operating system for the surveying trade that owns its own
supply-and-demand marketplace, with a Web3 trust layer for identity, settlement and evidence
integrity. The neighbouring products cannot copy that combination because each piece feeds the
others: the marketplace lists what the workspace produces, the AI works on the same records the
surveyor is editing, and the chain carries proofs and settlement rather than content.

Hybrid by default: confidential files and operational records stay off-chain while explicit
transactions and minimal SHA-256 anchor statements go to Solana.

## Operating Context

- Work is quote-to-cash: quote → dispatch or schedule → work the job → log time and expenses →
  preserve evidence → invoice → settle through crypto or fiat.
- Surveyors carry reference equipment (total stations, GNSS receivers, levels) as catalogued assets,
  so the asset list is a working tool, not a photo gallery.
- Projects group jobs, drawings, files and settings; files and photos are evidence attached to the
  work they document.
- Three scopes: personal (single operator), business (firm), and platform operator above both.
- Sign-in is wallet-native, so the audience is comfortable with self-custodied wallets.
- AI supports professional judgement; it does not replace coordinate, datum, unit, financial or
  deliverable review.

## Capabilities and Constraints

- **Operations:** quotes, jobs, dispatch, schedule, time and expenses, invoices, billing and
  payments, projects, assets, files, contacts, team chat, notifications.
- **AI:** streaming chat with history and memory, allowlisted reporting and record tools,
  quote/scheduling workflows, CAD inspection, and read-back verification for record writes.
  Drafting commands executed in a CAD canvas are a platform target; no web screen offers one.
- **Evidence:** SHA-256 hashing, integrity verification, version history, and optional
  wallet-signed Solana Memo anchors in two per-file modes — hash-only (default; only attachment ID
  and digest on-chain) and full-file (file split into ordered chunks, each encrypted in the browser
  with a fresh AES-256 key sealed under a user passphrase, stored privately; one Memo commits the
  file digest, manifest digest and chunk count). Both keep file bytes off-chain.
- **Market:** listings by category (instruments, professionals, jobs, firms, training), geo map,
  search and filters, and a terminal showing a Solana-priced index, chart, ticker and portfolio.
- **Payments:** Solana USDC and PesePay fiat rails, kept visually and behaviourally distinct so the
  two settlement paths never read as one.
- **Wallet sign-in** records account type, name and email; incomplete accounts are pre-filled into a
  finish-setup flow rather than dropped.
- **Constraints:** PesePay runs on sandbox keys only — no live charge from a development session.
  Solana targets devnet by default; wallet hand-off is Solflare on mobile, Phantom on desktop.
- **Explicitly not built:** the project-tool cards for instrument calibration, field notes and QA
  flags. They must not be described as working tools.
- **Undecided:** seat licensing, a public rate card, and what happens to stored bytes when a
  purchased storage allocation expires (files are never auto-deleted, so the cost tail outlives the
  revenue). In-app package pricing is live; its derivation is recorded in `PRICING.md`.

## Brand Commitments

- Name: SiteSurveyor, an Eineva Labs product and open-source initiative. Attribution stays visible
  in primary documentation and about surfaces.
- Logo lockup and mark are confirmed assets; do not redesign them.
- Signature red `#d92d20` is the accent. The 2026 decision is the shadcn-admin template's structure,
  component language and neutral slate palette, with red kept for brand marks, primary actions, live
  indicators and market highlights rather than a bespoke red-and-dark console theme.
- Voice: practical, field-competent, plain. Controls name their action; errors name the problem and
  the recovery.
- The public market keeps its own character (map, chart, ticker, mono data chrome) on the shared
  tokens and primitives.

## Evidence on Hand

- Real product surface inside the app: navigation, dashboards, forms, market listings, payment rails
  and error states.
- Market listings, portfolio balances and chart series are synthetic demo data generated in-app and
  labelled as such where presented as real.
- No customer testimonials, case studies, press or public pricing exist. Do not fabricate them.
- Brand artwork lives in `apps/web/public` and `apps/web/src/assets`.

## Product Principles

1. The job is the unit of work — everything hangs off a job, a quote or an invoice.
2. Evidence travels with the work and stays findable from the job it documents.
3. Two settlement paths, never one: crypto and fiat are equal citizens with distinct affordances.
4. The market is two-way — a workspace publishes into it, a visitor becomes a workspace customer.
5. One design language: shared tokens and primitives govern every surface.
6. Security travels with digitisation; efficiency and cybersecurity are designed together.
7. Open by default — MIT-licensed, with boundaries and claims kept inspectable.

## Accessibility & Inclusion

Web baseline: keyboard operability of every control, visible focus, labelled fields, error text tied
to its field, and a layout that survives 390px width. Mobile-web is a first-class target because
field work happens on phones.
