# SiteSurveyor Framework

**A framework for developing surveying systems with Inkling Gateway AI automation and Solana payments.**

<p align="center">
  <a href="https://github.com/ConsoleMangena/sitesurveyor-framework/releases"><img alt="Release" src="https://img.shields.io/github/v/release/ConsoleMangena/sitesurveyor-framework?include_prereleases&style=for-the-badge&label=release&color=9945FF"></a>
  <a href="https://github.com/ConsoleMangena/sitesurveyor-framework/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/ConsoleMangena/sitesurveyor-framework?style=for-the-badge&color=9945FF"></a>
  <a href="https://github.com/ConsoleMangena/sitesurveyor-framework/commits/main"><img alt="GitHub last commit" src="https://img.shields.io/github/last-commit/ConsoleMangena/sitesurveyor-framework?style=for-the-badge&color=9945FF"></a>
  <a href="https://github.com/ConsoleMangena/sitesurveyor-framework/issues"><img alt="GitHub issues" src="https://img.shields.io/github/issues/ConsoleMangena/sitesurveyor-framework?style=for-the-badge&color=e0403c"></a>
  <a href="https://github.com/ConsoleMangena/sitesurveyor-framework/pulls"><img alt="GitHub pull requests" src="https://img.shields.io/github/issues-pr/ConsoleMangena/sitesurveyor-framework?style=for-the-badge&color=db8e00"></a>
  <a href="https://github.com/ConsoleMangena/sitesurveyor-framework/blob/main/LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge"></a>
</p>

<p align="center">
  <a href="https://www.rust-lang.org/"><img alt="Rust" src="https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white"></a>
  <a href="https://solana.com/"><img alt="Solana" src="https://img.shields.io/badge/Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white"></a>
  <a href="https://webassembly.org/"><img alt="WebAssembly" src="https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white"></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white"></a>
  <a href="https://react.dev/"><img alt="React" src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black"></a>
  <a href="https://vite.dev/"><img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white"></a>
  <a href="https://tauri.app/"><img alt="Tauri" src="https://img.shields.io/badge/Tauri-24C8DB?style=for-the-badge&logo=tauri&logoColor=white"></a>
  <a href="https://supabase.com/"><img alt="Supabase" src="https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white"></a>
  <a href="https://openclaw.ai/"><img alt="Inkling Gateway" src="https://img.shields.io/badge/Inkling Gateway-E6EDF3?style=for-the-badge&logo=ollama&logoColor=black"></a>
</p>

SiteSurveyor Framework is a complete toolset for surveyors to execute and manage projects. It combines Tauri's cross-platform performance with native AI capabilities, giving developers everything needed to ship production-grade systems. From planning to deployment, handle complex computations, secure data management, and automated workflows all within a single, extensible architecture.

What sets it apart:

- **Verifiable, tamper-evident files.** Every file gets a SHA-256 content hash when it is uploaded, so data integrity can be proven cryptographically rather than trusted blindly.
- **Direct crypto payments.** Connect a **Phantom** wallet and settle invoices in **USDC or SOL** on Solana — signed in the browser, no seed phrase ever leaves the wallet.
- **A real engineering core.** Complex computations (geometry, terrain analysis, coordinate geometry) are handled by a single Rust engine that runs identically as WebAssembly cross-platform and natively on the Tauri desktop app deterministic and tested.
- **Built for teams and tenants.** Personal, Business, and Platform Admin workspaces sit on a multi-tenant foundation with PostgreSQL Row-Level Security and role-based access control.
- **Inkling Gateway AI automation.** Use the Inkling Gateway agent stack for intelligent analysis, pattern recognition, natural language interaction, and automated decision-making across your workflows.

Built by **Eineva Incorporated**.

---

## Features

### Personal Workspace (individual developers)

**Planning & Project Management**
- Dashboard, schedule, and time tracking
- Project hub with file manager and document storage
- **File integrity** — every upload is hashed (SHA-256) so you can verify a document has not been altered since it was stored

**Core Development Tools**
- Full drafting workspace with TIN generation, contour mapping, and volume calculations (cut/fill, surface-to-surface, elevation)
- Complete coordinate geometry (COGO) toolset:
  - Forward / Inverse computations
  - Traverse computation and Bowditch adjustment, plus angular-traverse reduction (interior / deflection / angle-right) with angular-misclosure balancing
  - Levelling (Rise & Fall / HPC)
  - Bearing-bearing and distance-distance intersections
  - Three-point resection (Tienstra)
  - Stake-out / set-out (angle-right, distance and offsets from an occupied station and backsight)
  - Alignment set-out: horizontal circular curves (T, L, E, M, chord + deflection-angle stations) and vertical parabolic curves
  - Polygon area and polyline length
  - Combined scale factor reduction (ground-to-grid)
- Terrain analysis: slope-shaded DTM, aspect, true 3D surface area and whole-surface statistics
- Drawing annotation: coordinate tables, boundary bearing/distance labels and area/perimeter labels
- DXF, CSV and GeoJSON import/export

**Business Operations**
- Quotes and invoicing
- Billing with **Solana crypto payments** (USDC or SOL via Phantom)
- Contact management (CRM)

**Asset Management**
- Instrument/equipment tracking with calibration scheduling

**Marketplace**
- **Pay with your Phantom wallet** when hiring crew or settling on-chain
- Hire crew / find jobs

**Inkling Gateway AI & Automation**
- Inkling Gateway agent integration for intelligent analysis
- Automated pattern recognition and decision-making
- AI-powered workflow optimization
- Natural language CLI and chat interfaces

### Business Workspace (teams)
Everything in Personal, plus:
- **Dispatch** — assign jobs to field crews in real time
- **Team management** with role-based access (owner, admin, ops_manager, finance, sales, technician, viewer)
- Job board posting and professional hiring

### Platform Admin Workspace
- Platform-wide metrics and activity monitoring
- Cross-tenant user and workspace management
- Full audit log

### Inkling Gateway AI & Automation
- **Intelligent Automation** — Inkling Gateway agent-driven workflow optimization and decision support
- **Pattern Recognition** — Intelligent data analysis and prediction
- **Natural Language Processing** — Text analysis, document understanding, and automated tagging
- **Predictive Analytics** — Forecasting and trend analysis for project planning

---

## The Development Workflow, End to End

```
Planning ──► Development ──► Computation ──► Deployment ──► Payments ──► Inkling Gateway AI
    │            │               │               │            │                │
    │            │               │               │            │                │
    │            │      Rust     │               │            │          Solana │
  Schedule    Design      TIN & COGO      CI/CD        Phantom       Agents
  Projects    Review     Contours       Containers     payments        Automation
              Testing    Volumes        k8s            USDC / SOL      Prediction
                                                       ↓              ↓
                                         Deploy     Confirmed      Intelligent
                                                     Live          Automation
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript 6, Vite 8, Zustand (state), react-router-dom 7 |
| **Backend** | Supabase (PostgreSQL 17, RLS, Edge Functions, Storage) |
| **Desktop** | Tauri 2 (Rust) — native shell with IPC to core modules |
| **Geometry Engine** | Rust → WebAssembly for browsers; native Rust (`survey-core`) for desktop — same code, identical results |
| **Blockchain** | Solana Web3.js + Phantom wallet — USDC / SOL payments |
| **AI & Automation** | Inkling Gateway — agent-based AI and workflow automation |
| **Testing** | Vitest 4, jsdom, @testing-library/react |
| **Linting** | ESLint 9, typescript-eslint 8 |

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                    Frontend (SPA)                                   │
│  React + Vite (TypeScript 6)                                       │
│  ┌─────────────┐  ┌────────────────────────┐  ┌──────────────┐    │
│  │ WASM module  │  │ Supabase SDK           │  │  Inkling Gateway    │    │
│  │ survey-core  │  │ (REST / GraphQL)       │  │  Gateway     │    │
│  └─────────────┘  └───────────┬────────────┘  └──────────────┘    │
│                               │                                    │
│  ┌────────────────────────────┴────────────┐                       │
│  │      Phantom Wallet (Web3.js)           │                       │
│  └─────────────────────────────────────────┘                       │
├─────────────────────────────────┬──────────────────────────────────┤
│     Tauri Desktop Shell         │                                  │
│  Rust IPC → survey-core (opt)   │                                  │
│  Rust IPC → Inkling Gateway gateway    │                                  │
└─────────────────────────────────┼──────────────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────────────┐
         ▼                        ▼                                ▼
┌──────────────────┐   ┌──────────────────┐   ┌────────────────────┐
│   Supabase        │   │   Supabase       │   │    Solana          │
│   PostgreSQL 17   │   │ Edge Functions   │   │   Blockchain       │
│   + RLS           │   │ (Deno / TS)      │   │                    │
│   + Storage       │   │ ai-chat, etc.    │   │  USDC / SOL        │
└──────────────────┘   └──────────────────┘   └────────────────────┘
```

The frontend is a single-page application backed entirely by Supabase — no custom backend server. Survey geometry runs as WebAssembly cross-platform or over Tauri IPC on desktop, both from the same Rust `survey-core` crate. Solana payments are signed in the browser through the injected **Phantom** wallet (`@solana/web3.js`) and recorded against invoices in Supabase; there is no server-side payment verification function. Inkling Gateway provides AI automation, natural language interactions, and intelligent analysis. Multi-tenant isolation is enforced through PostgreSQL Row-Level Security.

---

## Repository Structure

```
├── apps/
│   ├── web/                         # React + Vite SPA
│   │   ├── src/
│   │   │   ├── main.tsx             # Entry point (polyfills Buffer for Solana)
│   │   │   ├── App.tsx              # Router & auth bootstrap
│   │   │   ├── pages/               # Route-level pages
│   │   │   │   ├── auth/            # Login, signup, password reset
│   │   │   │   ├── personal/        # Personal workspace
│   │   │   │   ├── business/        # Business workspace
│   │   │   │   ├── shared/          # Contacts, invoices, quotes, projects, etc.
│   │   │   │   ├── public/          # Public market page
│   │   │   │   └── admin/           # Platform admin
│   │   │   ├── features/
│   │   │   │   ├── workspace/       # Workspace type definitions
│   │   │   │   ├── personal/        # Personal shell & navigation
│   │   │   │   ├── business/        # Business shell & navigation
│   │   │   │   ├── platform/        # Platform operator shell
│   │   │   │   ├── phantom/         # Phantom wallet config, provider & payments
│   │   │   │   └── projects/        # Core development tools, calculators, tool registry
│   │   │   ├── components/          # Shared UI (WorkspaceShell, ProtectedRoute, etc.)
│   │   │   ├── lib/
│   │   │   │   ├── supabase/        # Client + auto-generated DB types
│   │   │   │   ├── repositories/    # Data access modules
│   │   │   │   ├── auth/            # Zustand auth store + session management
│   │   │   │   ├── geo/             # Geometry helpers
│   │   │   │   ├── localDb/         # Offline cache (LokiJS)
│   │   │   │   └── permissions.ts   # RBAC helpers
│   │   │   └── styles/              # Hand-written CSS
│   │   ├── vite.config.ts           # Vite + WASM plugins, es2022 target
│   │   └── package.json
│   └── desktop/                     # Tauri desktop shell + Rust
│       ├── src/                     # Tauri app (main.rs, lib.rs, survey.rs)
│       ├── crates/
│       │   ├── survey-core/         # Pure Rust geometry (TIN, contours, volumes)
│       │   └── survey-wasm/         # wasm-bindgen bindings
│       └── tauri.conf.json
│
├── ai-gateway/                      # Inkling Gateway host server (local AI stack)
├── supabase/
│   ├── migrations/                  # SQL schema, functions, RLS, seeds
│   ├── functions/
│   │   ├── ai-chat/                 # Edge Function: AI chat
│   │   ├── backfill-geocode/        # Edge Function: geocoding backfill
│   │   └── delete-user/             # Edge Function: account deletion
│   └── config.toml
├── scripts/                         # Build & dev helper scripts
├── paper/                           # Research paper
├── package.json                     # Root scripts
└── README.md
```

---

## Local Development

### Prerequisites

- Node.js 20+
- npm
- A [hosted Supabase project](https://supabase.com/dashboard)
- Rust toolchain (only for Tauri desktop or WASM builds)

### Frontend

```bash
cd apps/web
npm install
npm run dev
```

### Environment

Create `apps/web/.env` (see `apps/web/.env.example`):

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Solana payments (Phantom). TREASURY is required to show the pay button.
VITE_SOLANA_CLUSTER=devnet
VITE_SOLANA_TREASURY_ADDRESS=
```

### Database

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

SQL migrations are in `supabase/migrations/`.

### WASM Build (browser geometry engine)

```bash
cd apps/desktop/crates
bash build-wasm.sh
```

### Desktop Build (Tauri)

```bash
cd apps/desktop
cargo tauri dev
```

---

## Quality Checks

```bash
npm run lint       # ESLint
npm run typecheck  # TypeScript
npm run test       # Vitest
npm run build      # Production bundle
```

---

## Key Design Decisions

- **Content-hashed files** — every uploaded file is hashed (SHA-256) so its integrity can be verified later, without depending on a blockchain.
- **Wallet-native payments** — the user's own **Phantom** wallet signs USDC / SOL payments in the browser; the seed phrase never leaves the wallet and the platform never custodies keys.
- **Solana payments as a first-class feature** — invoices and marketplace orders can be settled on-chain, with the transaction signature recorded against the invoice in Supabase
- **Inkling Gateway AI & Automation** — the Inkling Gateway agent stack powers intelligent automation, natural language interaction, pattern recognition, and decision support throughout the framework
- **No custom backend** — all server logic is Supabase (PostgreSQL + RLS + Edge Functions)
- **One geometry engine, two runtimes** — the same Rust code runs as WASM in the browser and over Tauri IPC on desktop, guaranteeing identical results
- **Multi-tenancy via RLS** — every table carries a `workspace_id`; Row-Level Security enforces tenant isolation
- **All tools included** — the core development tools and every feature are available to all workspaces; there is no feature gating
- **Modular Architecture** — components are designed to be reusable and customizable for different use cases

---

## Links

<p align="center">
  <a href="https://github.com/ConsoleMangena/sitesurveyor-framework"><strong>GitHub</strong></a>
  ·
  <a href="https://github.com/ConsoleMangena/sitesurveyor-framework/issues">Issues</a>
  ·
  <a href="https://github.com/ConsoleMangena/sitesurveyor-framework/pulls">Pull Requests</a>
  ·
  <a href="https://github.com/ConsoleMangena/sitesurveyor-framework/discussions">Discussions</a>
  ·
  <a href="https://github.com/ConsoleMangena/sitesurveyor-framework/releases">Releases</a>
  ·
  <a href="https://github.com/ConsoleMangena/sitesurveyor-framework/blob/main/LICENSE">License</a>
</p>

<p align="center">Built by <a href="https://github.com/ConsoleMangena">Eineva Incorporated</a>. Released under the MIT License.</p>