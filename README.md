<p align="center">
  <img src="apps/web/public/logo.svg" alt="SiteSurveyor logo" width="220" />
</p>

<h1 align="center">SiteSurveyor</h1>

<p align="center">
  <strong>Your surveying reference point.</strong><br />
  An <strong>Eineva Labs</strong> product and open-source initiative for safer digital surveying.<br />
  An AI-powered, Web3-enabled workspace for planning, executing, evidencing, and settling surveying projects.
</p>

<p align="center">
  <a href="https://react.dev/"><img alt="React 19" src="https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white" /></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript 6" src="https://img.shields.io/badge/TypeScript-6-3178c6?logo=typescript&logoColor=white" /></a>
  <a href="https://solana.com/"><img alt="Solana" src="https://img.shields.io/badge/Solana-Web3-9945ff?logo=solana&logoColor=white" /></a>
  <a href="https://supabase.com/"><img alt="Supabase" src="https://img.shields.io/badge/Supabase-backend-3ecf8e?logo=supabase&logoColor=white" /></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/License-MIT-d92d20" /></a>
</p>

---

SiteSurveyor is an **Eineva Labs product and open-source initiative**. It brings the whole job into one connected workspace, giving a surveyor the complete set of tools their work demands, from the first enquiry to a settled payment, rather than a paper field book and a patchwork of disconnected systems.

Its **hybrid Web3 architecture** keeps sensitive survey content in controlled off-chain storage by default while using Solana where it adds clear value: wallet-native sign-in, USDC settlement, and tamper-evident file-hash anchors. SiteSurveyor AI can work directly with that same toolset, so a surveyor moves from a question to a verified action without leaving the workspace.

> **Development status:** the repository defaults to **Solana devnet** and **PesePay sandbox**. Devnet transactions are for development and demonstration, not production evidence or settlement. Complete a deployment security review before using live funds, production chains, or sensitive client data.

## Why Eineva Labs built SiteSurveyor

Surveying is moving from paper field books, manual hand-offs, and disconnected office systems toward digital collection, processing, and project management. That transition can improve efficiency, but cybersecurity is too often left behind. Boundary data, coordinates, plans, client records, and construction information can become exposed to breaches, tampering, and unauthorised access, while centralised workflows can make provenance and change history difficult to inspect.

Eineva Labs created SiteSurveyor as an open-source response: a framework for embracing digital fieldwork without treating security as an afterthought. The goal is one safer digital workspace for work that would otherwise depend on a paper field book and a patchwork of tools, combining practical survey operations, AI assistance, transparent integrity records, and security-conscious data management.

Open source makes the framework inspectable, adaptable, and available for surveying firms, researchers, and contributors to improve together. Blockchain is used selectively for integrity, transparency, and settlement; it is not treated as a replacement for access control, encryption, professional QA, or responsible information governance.

## Documentation

| Document | Audience | What it covers |
| --- | --- | --- |
| [Surveyor user guide](USER_GUIDE.md) | Surveyors, firm leads, operators | Daily workflows, AI, file proofs, payments, and troubleshooting |
| [System architecture & design](DESIGN.md) | Developers, architects | Components, data flows, AI tools, Solana anchoring, and design decisions |
| [Security model](SECURITY.md) | Administrators, developers, auditors | Data boundaries, controls, limitations, and production checklist |
| [Authentication guide](AUTHENTICATION.md) | Developers, administrators | Email, GitHub, and wallet sign-in, account linking, and required configuration |
| [Product brief](PRODUCT.md) | Product and design teams | Users, positioning, capabilities, principles, and constraints |
| [Web app guide](apps/web/README.md) | Frontend developers | Setup, environment, structure, testing, PWA, and build |
| [AI gateway guide](ai-gateway/README.md) | AI/platform developers | Edge Function, self-hosted fallback, MCP, models, and configuration |
| [Contributing guide](CONTRIBUTING.md) | Contributors | Setup, checks, database rules, and pull request expectations |

## Why SiteSurveyor

**One operational record.** Keep the quote, project, job, crew, files, costs, and invoice connected instead of reconstructing the job across separate tools.

**AI that can use workspace tools.** Ask for operational reporting, create or update allowed records, and inspect CAD entities and layers. Responses stream in real time, and successful record writes are read back for verification.

**Proof without public exposure.** Anchor a file's SHA-256 digest on Solana without putting the original plan, point cloud, photo, or coordinates on-chain.

**Settlement that fits the job.** Keep Solana USDC and local fiat payment flows distinct, with transaction references retained against the workspace's financial records.

**A market connected to the work.** Discover instruments, professionals, firms, jobs, and training through the same platform used to deliver the work.

## The survey lifecycle

```mermaid
flowchart LR
    A["Plan<br/>Contacts · quotes · projects"] --> B["Prepare<br/>Crew · assets · schedule"]
    B --> C["Execute<br/>Dispatch · CAD · time & expenses"]
    C --> D["Evidence<br/>Files · versions · integrity checks"]
    D --> E["Settle<br/>Invoices · Solana USDC · fiat"]
    AI["SiteSurveyor AI<br/>Query · report · act · draft"] -. assists .-> A
    AI -. assists .-> C
    Solana["Solana<br/>Wallet-signed SHA-256 anchor"] -. proves .-> D
```

## Capabilities

| Area | Included in the workspace |
| --- | --- |
| Plan & price | Contacts, quotes and line items, projects, scheduling, crew planning, and operational dashboards |
| Execute | Jobs, dispatch, assignments, job events, time tracking, expenses, team chat, and notifications |
| CAD & project work | Project drawings and layers are stored per project (`project_cad_drawings`, `project_cad_metrics`) and the AI can read them — layers, entity counts, single entities. The web client has no drawing canvas or command executor yet; user-executed drafting commands are a **platform target** |
| Evidence | File manager, private/public storage options, folders, versions, soft delete and restore, SHA-256 hashing, and integrity verification |
| Web3 | Sign In With Solana, Phantom and Solflare hand-offs, an encrypted built-in wallet option, Solana USDC payments, and hash-only or full-file anchoring |
| AI | Streaming chat, conversation history and memory, allowlisted data tools, reporting, record workflows, and CAD tools |
| Finance | Invoices, billing, payment references, Solana USDC, and separate PesePay fiat flows |
| Assets | Instruments, asset details, photos, calibration records, and maintenance history |
| Earth Observation | Job-scoped satellite analysis (water, minerals, soil, hazard) through the Python engine, with client reports, map sheets and a workbench drape; the mineral run screens six deposit styles and names the commodities this sensor set cannot see |
| Marketplace | Instruments, professionals, jobs, firms, training, map discovery, filters, market detail views, an AI concierge, a shared cart that becomes one request per seller, and on-chain verified payment |
| Transport (preview) | `/transport` plans a route from coordinates, prices road distance, and shows a sample fleet. Generated vehicles, sample operators, session-only bookings — not a dispatch service |
| Administration | Personal and business workspaces plus platform-operator views for users, workspaces, activity, and audit |

Some project-tool cards (currently instrument calibration, field notes, and QA flags) are explicitly marked **coming soon** in the application. They are not presented as working capabilities.

## Security at a glance

SiteSurveyor defaults to blockchain for **integrity and settlement**, not as a public database for confidential survey records. Full-file anchoring is a separate, explicit per-file choice with a different privacy and cost profile — and even there the file bytes stay off-chain.

| Information | Primary location | Written to Solana? |
| --- | --- | --- |
| Survey plans, photos, point clouds, and other original files | Supabase Storage; full-file anchoring adds encrypted chunk copies there too | **No. Neither anchoring mode writes file bytes on chain** |
| Projects, clients, quotes, jobs, invoices, and workspace records | Supabase Postgres | **No** |
| AI conversations and operational tool results | Supabase Postgres; prompts/context processed by the configured AI provider | **No** |
| File attachment ID and lowercase SHA-256 digest | Attachment metadata and a wallet-signed Solana Memo transaction | **Yes, when hash anchoring** |
| Solana payment transaction | Solana | **Yes** |
| PesePay fiat transaction | PesePay and off-chain payment records | **No** |

### Two file-storage models

**Hash-only anchoring (implemented).** The original file stays in Supabase Storage. Solana receives only its attachment ID and SHA-256 digest, providing a tamper-evident reference without publishing the file.

**Full-file anchoring (implemented, opt-in per file).** Choosing **Full file** instead of **Hash only** in the file manager divides the file into ordered, fixed-size chunks (256 KiB), encrypts each chunk in the browser with a fresh AES-256-GCM key wrapped under a passphrase the user supplies, and stores those copies plus a `manifest.json` privately in workspace storage under `<workspace-id>/anchors/<operation-id>/`. Solana receives **one** Memo transaction carrying the file digest, the manifest digest and the chunk count — never the per-chunk digests and never the bytes. Recovery downloads the chunks, decrypts them, re-hashes each one against the manifest, and reassembles the file. Losing the passphrase makes the chunk copies unrecoverable; the original file and the on-chain record are unaffected.

A hash anchor proves that a particular wallet anchored a particular digest at a particular time. It does **not** prove authorship, ownership, survey accuracy, or legal validity, and it does not encrypt the file.

Read the [security model](SECURITY.md) before deploying with real project data.

## Architecture

```mermaid
flowchart TB
    U["Surveyor / firm / client"] --> W["React 19 + TypeScript web app<br/>Responsive PWA"]

    W -->|"Sign In With Solana"| A["Supabase Auth"]
    W -->|"Workspace data + user JWT"| D["Supabase Postgres + RLS"]
    W -->|"Default: original files"| S["Supabase Storage"]
    W -->|"Wallet-signed anchors + USDC"| C["Solana RPC / cluster"]
    W -. "Planned opt-in: encrypted, ordered file chunks" .-> C

    W -->|"Authenticated chat"| E["ai-chat Edge Function"]
    E -->|"Prompts + tool context"| N["NVIDIA NIM models"]
    E -->|"Allowlisted tools"| D

    W -. "Optional self-hosted fallback" .-> G["Node AI gateway"]
    G --> N
    G --> D
    G -. "Optional OpenClaw runtime" .-> M["SiteSurveyor MCP tools"]

    W -->|"Fiat payment flows"| P["PesePay Edge Function"]
    P --> F["PesePay sandbox"]
```

The production web bundle is static and can be served by Nginx or a static host. Supabase provides the primary backend and AI runtime; the Node gateway is an optional self-hosted serving path, not an offline AI engine.

See [System architecture & design](DESIGN.md) for component responsibilities and sequence diagrams.

## Technology stack

- **Frontend:** React 19, TypeScript, Vite 8, React Router, Tailwind CSS 4, Radix UI/shadcn primitives, Zustand, and React Hook Form.
- **Geospatial & reporting:** Leaflet, GeoJSON types, CAD project models, and Recharts.
- **Web3:** Solana Web3.js, Wallet Adapter, Sign In With Solana, SPL USDC, and Memo-based file anchors.
- **Backend:** Supabase Auth, Postgres, Storage, Realtime, Row Level Security, and Edge Functions.
- **AI:** NVIDIA NIM, an allowlisted model router, streaming tool calling, structured memory, and an optional Model Context Protocol server.
- **Quality & delivery:** Vitest, Testing Library, ESLint, TypeScript project checks, Docker/Nginx, and Render static-site configuration.

## Platform targets

| Client | Technology | Current status |
| --- | --- | --- |
| Web | React 19 + TypeScript, responsive PWA | **Implemented** in `apps/web` |
| Desktop | .NET | Target platform; `apps/desktop` is reserved for the native shell |
| Mobile | Java Android SDK | Target platform; `apps/mobile` is reserved for the Android client |

The current repository contains the web implementation only. Naming the native technology targets does not imply that those clients are already available.

## Repository layout

```text
sitesurveyor-framework/
├── apps/
│   ├── web/                 # Implemented responsive React application
│   ├── desktop/             # .NET desktop target; source placeholder
│   ├── mobile/              # Java Android SDK target; source placeholder
│   ├── live/                # Reserved placeholder
│   └── engine/              # Python satellite survey engine (worker + MCP + CLI)
├── ai-gateway/              # Optional Node host and AI fallback
│   └── sitesurveyor-mcp/    # MCP exposure of AI data, CAD, memory, and workflow tools
├── supabase/
│   ├── functions/           # AI, Solana-data, payments, and auth Edge Functions
│   └── migrations/          # Base schema dump + incremental schema changes, policies and seeds
├── scripts/ai-eval/         # AI evaluation and consistency checks
├── PRODUCT.md               # Product contract
├── DESIGN.md                # Architecture and design
├── AUTHENTICATION.md        # Email, GitHub, and wallet sign-in
├── SECURITY.md              # Security boundaries and deployment checklist
└── USER_GUIDE.md            # End-user workflows
```

## Quick start

### Prerequisites

- Node.js 22.18 or newer and npm (the Docker build uses Node 22; 22.18+ is required because the deterministic AI check scripts run TypeScript directly).
- A Supabase project with the repository schema and required Edge Functions.
- A Solana wallet for wallet sign-in and transaction testing. Use devnet for development.
- An NVIDIA NIM API key if you will deploy or run the AI runtime.

### 1. Install dependencies

From the repository root:

```bash
npm install
npm --prefix apps/web install
```

### 2. Configure the web app

```bash
cp apps/web/.env.example apps/web/.env
```

Set at least:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
VITE_SOLANA_CLUSTER=devnet
```

For a linked Supabase project, apply the database migrations with:

```bash
npm run db:push
```

Use your normal reviewed migration process for shared or production environments; do not reset a database containing real work.

#### The database can be rebuilt from empty

The first file in `supabase/migrations/` is `20260823000000_base_schema.sql`, a schema dump taken from the deployed project. Everything after it is an incremental change. A local or CI database can therefore be built from nothing:

```bash
npx supabase start     # boots the local stack and applies every migration
npx supabase db reset  # apply migrations again onto an empty database
```

Two consequences worth knowing:

- On an **existing** deployment the base schema is already in place, so `db push` must be told that file is done first: `npx supabase migration repair --status applied 20260823000000`. Otherwise PostgreSQL refuses to recreate existing objects.
- The baseline is history. Never edit it; schema changes belong in new, later migrations.

### 3. Start the app

```bash
npm run dev
```

Open **http://localhost:5174**. The Vite server also listens on the local network for mobile-web testing.

The frontend can run without the AI service, but AI chat requires the deployed `ai-chat` Edge Function or the optional [self-hosted AI gateway](ai-gateway/README.md).

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Browser-safe anon or publishable key; never a service-role key |
| `VITE_SOLANA_CLUSTER` | No | `devnet` by default; supports `testnet` and `mainnet-beta` |
| `VITE_SOLANA_RPC_URL` | No | Custom RPC endpoint; otherwise the selected cluster's public endpoint is used |
| `VITE_SOLANA_USDC_MINT` | No | Cluster-specific USDC mint override |
| `VITE_SOLANA_TREASURY_ADDRESS` | For Solana payments | Recipient wallet; an empty value hides the on-chain payment action |
| `VITE_ENABLE_PLATFORM_ADMIN_SIGNUP` | No | Exposes the platform-administration signup card only when explicitly enabled |

All `VITE_*` values are embedded in the browser bundle and must be treated as public. NVIDIA keys, Supabase service-role keys, PesePay secrets, wallet seed phrases, and private keys do not belong in this file.

See [web app configuration](apps/web/README.md#configuration) and [AI gateway configuration](ai-gateway/README.md#configuration) for server-side settings.

## Development commands

Run these from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run typecheck` | Run TypeScript project checks |
| `npm run lint` | Run ESLint |
| `npm test` | Run the Vitest suite once |
| `npm run test:coverage` | Run the Vitest suite with a coverage report and thresholds |
| `npm run build` | Create the production web bundle |
| `npm --prefix apps/web run preview` | Preview the production build locally |
| `npm run ai:eval` | Run the AI evaluation harness |
| `npm run ai:skills-check` | Check AI skill consistency |
| `npm run ai:memory-check` | Check AI memory behaviour |
| `npm run ai:models-check` | Check model configuration |
| `npm run ai:rounds-check` | Check tool-round behaviour |

Before submitting a change, run at least `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` for affected web functionality.

### Continuous integration

`.github/workflows/ci.yml` runs seven jobs on every push to `main` and every pull request: web checks (typecheck, lint, tests, build), the Python engine tests, the MCP server tests, the Deno `_shared` tests, the deterministic AI checks, a deploy hook, and **Migrations apply from empty** — which boots the Supabase stack, applies every migration to a bare PostgreSQL, asserts the tables and views the app queries exist, and proves that a client cannot mark its own marketplace order `completed`. That last job is what keeps the base schema honest: it fails if a migration stops applying from scratch.

## Docker

Build and serve the production SPA through Nginx. The Supabase URL and anon key
are required build arguments — the build fails without them, so a local image
can never silently point at another project:

```bash
export VITE_SUPABASE_URL=https://your-project-ref.supabase.co
export VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
docker compose up --build
```

Or with plain Docker:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
  -t sitesurveyor-web .
```

Open **http://localhost:8080**. Supply deployment-specific values through your
local environment rather than treating repository defaults as your own
production configuration. `VITE_SOLANA_CLUSTER`, `VITE_SOLANA_RPC_URL`,
`VITE_SOLANA_USDC_MINT`, and `VITE_SOLANA_TREASURY_ADDRESS` remain optional.

## Current boundaries

- This repository currently implements the **responsive React web application/PWA**. **.NET desktop** and **Java Android SDK mobile** are platform targets; their directories remain placeholders.
- Anchoring ships in two modes, chosen per file: **hash-only** (the default) and **full-file**. Both keep file bytes in Supabase Storage; only the file digest, the manifest digest and the chunk count reach Solana.
- Solana development defaults to **devnet**. A transaction on one cluster cannot be treated as proof on another; preserve the recorded network and signature.
- The AI gateway still needs network access to NVIDIA and Supabase. “Fallback” means an alternate host, not offline inference.
- AI output requires professional review; destructive operations have confirmation safeguards. CAD data can be read by the AI today, but no web screen executes drafting commands - that is a platform target.
- Marketplace sample content and synthetic chart/portfolio data are demonstration material, not verified public market evidence. Seeded rows are labelled **Sample** in the market.
- `/transport` is a planning preview: the fleet is generated from static constants, bookings are held in memory for the session, and no operator is contacted or charged.
- Marketplace reviews are open to any signed-in workspace member; they are not restricted to completed work.
- Blockchain anchoring does not replace access control, encryption, backups, retention policy, professional QA, or legal records management. Full-file storage additionally requires pre-chunk encryption for sensitive content and explicit user consent.

## Contributing

Keep product claims tied to implemented behaviour, preserve the distinction between default private off-chain storage, public hash proofs, and the opt-in full-file mode, and update the relevant guide when a workflow or configuration changes. Follow the [Code of Conduct](CODE_OF_CONDUCT.md) and the [contributing guide](CONTRIBUTING.md), then run the checks above before submitting changes.

## License

SiteSurveyor is an **Eineva Labs product and open-source initiative**, available under the [MIT License](LICENSE).
