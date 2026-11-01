# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Vite + React single-page app at `apps/web`, served as a responsive web app (desktop
console plus mobile-web layouts). No native shell exists in this repository.

## Users

Primary: surveyors and geospatial field professionals working inside a surveying
firm's workspace. They sit on a laptop between site visits or in the office between
jobs, running quotes, jobs, dispatch, time tracking and invoices, and uploading
survey evidence (plans, point clouds, site photos) from phones and desktops.

Secondary audiences:

- Firm leads and workspace owners — pricing, team, assets, billing and settings.
- Clients of surveying firms — they arrive at the public market to find and hire
  surveyors, publish work, and compare instruments, services and training.
- Platform operators — the admin area covering users, workspaces, audit and growth.

## Product Purpose

SiteSurveyor runs the business of surveying: capture the work (jobs, quotes,
dispatch, time and expenses, invoices), keep the evidence (files, assets, photos,
survey tools), and settle the money (wallet and fiat payment rails). It also runs
the marketplace where the same profession publishes instruments, professionals,
open jobs, firms and training, so demand and supply meet in one place.

Success means a field professional can run a job end to end — quote, schedule,
capture, invoice, get paid — without leaving the workspace, and a client can find
and engage a surveyor without knowing the firm's internal tooling.

## Positioning

The combination no neighbouring product can truthfully copy: a field-service
operating system for the surveying trade that owns its own supply-and-demand
marketplace, with wallet-native payments (Solana) and local fiat rails (PesePay)
settling between the two. The marketplace is not a marketing page bolted onto a
tool — it is the same listing, job and instrument data the workspace produces.

## Operating Context

- Work is quote-to-cash: quote, dispatch or schedule, work the job, log time and
  expenses, raise an invoice, settle through crypto or fiat rails.
- Surveyors carry reference equipment (total stations, GNSS receivers, levels) as
  catalogued assets, so an asset list is a working tool, not a photo gallery.
- Projects group jobs, files and settings; files and photos are evidence attached
  to jobs and quotes.
- Teams inside a workspace divide into personal (single operator) and business
  (firm) scopes, and platform operators sit above both in the admin area.
- Sign-in is wallet-native (Solana sign-in), so the audience is comfortable with
  self-custodied wallets and on-chain settlement.

## Capabilities and Constraints

- Three workspace scopes: personal, business (firm), platform operator.
- Survey operations: quotes, jobs, dispatch, schedule, time and expenses,
  invoices, billing and payments, projects, assets, files, contacts, team.
- SiteSurveyor AI assistant renders workspace content as markdown blocks.
- Public market: listings by category (instruments, professionals, jobs, firms,
  training), geo map of live listings, search and category filters, and a market
  terminal showing a Solana-priced index, chart, ticker and portfolio.
- Payments: crypto (Solana) and fiat (PesePay sandbox) rails, kept visually and
  behaviourally distinct so the two settlement paths never read as one.
- Wallet sign-in supports account type, name and email; incomplete accounts are
  prefilled into a finish-setup flow rather than dropped.
- Constraints: PesePay runs on sandbox keys only — keys stay out of the repo and
  out of any printed output, are rotated before production, and no live charge is
  ever made from a development session. Solana work targets devnet; mobile
  wallet hand-off is via Solflare, desktop sign-in via Phantom.
- Undecided: pricing tiers, seat licensing and any published rate card.

## Brand Commitments

- Name: SiteSurveyor. The logo lockup and the SiteSurveyor mark are confirmed
  assets and are not to be redesigned.
- Signature red (#d92d20) is the brand accent. The 2026 visual decision is the
  shadcn-admin (satnaing) template's structure, component language and neutral
  slate palette, with the red retained as the accent — brand marks, primary
  actions, live indicators and market highlights — rather than a bespoke
  red-and-dark console theme.
- Voice: practical, field-competent, plain. Controls name their action; errors
  name the problem and the recovery.
- The public market keeps its own character (map, chart, ticker, mono data
  chrome) but is rebuilt on the template's tokens and primitives.

## Evidence on Hand

- Real product surface and copy inside the app: navigation, dashboards, forms,
  market listings, billing rails and error states.
- Market listings, portfolio balances and chart series are synthetic demo data
  generated in-app. They are demonstration material and must be labelled as such
  in any surface that presents them as real.
- No published customer testimonials, case studies, press or public pricing
  exist in this repository. Future work must not fabricate them.
- Logo and brand artwork exist in the app's assets.

## Product Principles

1. The job is the unit of work. Everything a surveyor does hangs off a job, a
   quote or an invoice, not off a feature tour.
2. Evidence travels with the work. Files, photos and assets belong to the job
   they document, and stay findable from there.
3. Two settlement paths, never one. Crypto and fiat are equal citizens with
   distinct affordances.
4. The market is two-way. A workspace publishes into the market; a market
   visitor becomes a customer in a workspace.
5. One design language. The template's structure and primitives govern every
   surface; a surface that keeps its character still uses the shared tokens.

## Accessibility & Inclusion

Web platform baseline: keyboard operability of every control, visible focus,
labelled fields, error text tied to its field, and layout that survives 390px
width. Mobile-web layouts are a first-class target because field work happens
on phones.
