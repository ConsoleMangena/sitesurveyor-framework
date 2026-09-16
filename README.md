# SiteSurveyor Framework

**A framework for developing surveying systems with OpenClaw AI automation and Solana blockchain.**

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
  <a href="https://openclaw.ai/"><img alt="OpenClaw" src="https://img.shields.io/badge/OpenClaw-E6EDF3?style=for-the-badge&logo=ollama&logoColor=black"></a>
</p>

SiteSurveyor Framework is a complete toolset for surveyors to execute and manage projects. It combines Tauri's cross-platform performance with native blockchain integration and AI capabilities, giving developers everything needed to ship production-grade systems. From planning to deployment, handle complex computations, secure data management, and decentralized workflows all within a single, extensible architecture.

What sets it apart:

- **Your data, secured on-chain.** Handle sensitive information with confidence anchor critical files to the **Solana blockchain** for tamper-evident, verifiable, and durable security, so data integrity can be proven cryptographically rather than trusted blindly.
- **Hybrid on-chain / off-chain by choice.** You decide, per file, what goes **on-chain** (maximum security and immutability) versus **off-chain** in Supabase storage (fast and affordable). This keeps everyday work cheap while reserving the blockchain for the records that truly need it.
- **Direct on-chain payments.** Pay network gas fees directly from your wallet and settle invoices in crypto all verified on-chain through Supabase Edge Functions.
- **A real engineering core.** Complex computations (geometry, terrain analysis, coordinate geometry) are handled by a single Rust engine that runs identically as WebAssembly cross-platform and natively on the Tauri desktop app deterministic and tested.
- **Built for teams and tenants.** Personal, Business, and Platform Admin workspaces sit on a multi-tenant foundation with PostgreSQL Row-Level Security and role-based access control.
- **OpenClaw AI automation.** Use the OpenClaw agent stack for intelligent analysis, pattern recognition, natural language interaction, and automated decision-making across your workflows.

Built by **Eineva Incorporated**.

---

## Features

### Personal Workspace (individual developers)

**Planning & Project Management**
- Dashboard, schedule, and time tracking
- Project hub with file manager and document storage
- **Blockchain file security** — anchor sensitive files (CAD, coordinates, deliverables) to Solana for tamper-evident, verifiable integrity, with a per-file choice between on-chain and off-chain storage

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
- Billing with **Solana crypto payments**
- Contact management (CRM)

**Asset Management**
- Instrument/equipment tracking with calibration scheduling

**Web 3.0 & Marketplace**
- **Pay network gas fees directly from your Solana wallet** when anchoring files or settling on-chain
- **Hybrid storage** — choose, per file, between on-chain (maximum security, immutable) and off-chain Supabase storage (fast, affordable)
- Hire crew / find jobs

**OpenClaw AI & Automation**
- OpenClaw agent integration for intelligent analysis
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

### OpenClaw AI & Automation
- **Intelligent Automation** — OpenClaw agent-driven workflow optimization and decision support
- **Pattern Recognition** — Intelligent data analysis and prediction
- **Natural Language Processing** — Text analysis, document understanding, and automated tagging
- **Predictive Analytics** — Forecasting and trend analysis for project planning

---

## The Development Workflow, End to End

```
Planning ──► Development ──► Computation ──► Deployment ──► Blockchain ──► OpenClaw AI
    │            │               │               │            │                │
    │            │               │               │            │                │
    │            │      Rust     │               │            │          Solana │
  Schedule    Design      TIN & COGO      CI/CD        On-chain       Agents
  Projects    Review     Contours       Containers     payments        Automation
              Testing    Volumes        k8s            crypto tx       Prediction
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
| **Blockchain** | Solana Web3.js — on-chain file anchoring and crypto payments |
| **AI & Automation** | OpenClaw — agent-based AI and workflow automation |
| **Testing** | Vitest 4, jsdom, @testing-library/react |
| **Linting** | ESLint 9, typescript-eslint 8 |

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                    Frontend (SPA)                                   │
│  React + Vite (TypeScript 6)                                       │
│  ┌─────────────┐  ┌────────────────────────┐  ┌──────────────┐    │
│  │ WASM module  │  │ Supabase SDK           │  │  OpenClaw    │    │
│  │ survey-core  │  │ (REST / GraphQL)       │  │  Gateway     │    │
│  └─────────────┘  └───────────┬────────────┘  └──────────────┘    │
│                               │                                    │
│  ┌────────────────────────────┴────────────┐                       │
│  │    Solana Wallet Adapter (Web3.js)      │                       │
│  └─────────────────────────────────────────┘                       │
├─────────────────────────────────┬──────────────────────────────────┤
│     Tauri Desktop Shell         │                                  │
│  Rust IPC → survey-core (opt)   │                                  │
│  Rust IPC → OpenClaw gateway    │                                  │
└─────────────────────────────────┼──────────────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────────────┐
         ▼                        ▼                                ▼
┌──────────────────┐   ┌──────────────────┐   ┌────────────────────┐
│   Supabase        │   │   Supabase       │   │    Solana          │
│   PostgreSQL 17   │   │ Edge Functions   │   │   Blockchain       │
│   + RLS           │   │ (Deno / TS)      │   │                    │
│   + Storage       │   │ solana-pay-verify│   │  On-chain payments │
└──────────────────┘   └──────────────────┘   └────────────────────┘
```

The frontend is a single-page application backed entirely by Supabase — no custom backend server. Survey geometry runs as WebAssembly cross-platform or over Tauri IPC on desktop, both from the same Rust `survey-core` crate. Solana integration handles on-chain file anchoring and crypto payment verification via Supabase Edge Functions. OpenClaw provides AI automation, natural language interactions, and intelligent analysis. Multi-tenant isolation is enforced through PostgreSQL Row-Level Security.

---

## Repository Structure

```
├── frontend/                        # React + Vite SPA
│   ├── src/
│   │   ├── main.tsx                 # Entry point (polyfills Buffer for Solana)
│   │   ├── App.tsx                  # Router & auth bootstrap
│   │   ├── pages/                   # Route-level pages
│   │   │   ├── auth/                # Login, signup, password reset
│   │   │   ├── personal/            # Personal workspace
│   │   │   ├── business/            # Business workspace
│   │   │   ├── shared/              # Contacts, invoices, quotes, projects, etc.
│   │   │   └── admin/               # Platform admin
│   │   ├── features/
│   │   │   ├── workspace/           # Workspace type definitions
│   │   │   ├── personal/            # Personal shell & navigation
│   │   │   ├── business/            # Business shell & navigation
│   │   │   ├── platform/            # Platform operator shell
│   │   │   └── projects/            # Core development tools, calculators, tool registry
│   │   ├── components/              # Shared UI (WorkspaceShell, ProtectedRoute, etc.)
│   │   ├── lib/
│   │   │   ├── supabase/            # Client + auto-generated DB types
│   │   │   ├── repositories/        # 25 data access modules
│   │   │   ├── auth/                # Zustand auth store + session management
│   │   │   ├── solana/              # Solana wallet config + provider
│   │   │   ├── payments/            # Payment verification
│   │   │   ├── openclaw/             # OpenClaw gateway integration
│   │   │   └── permissions.ts       # RBAC helpers
│   │   └── styles/                  # Hand-written CSS
│   ├── vite.config.ts               # Vite + WASM plugins, es2022 target
│   └── package.json
│
├── backend/                         # Tauri + Rust + Supabase SQL
│   ├── src/                         # Tauri app (main.rs, lib.rs, survey.rs)
│   ├── crates/
│   │   ├── survey-core/             # Pure Rust geometry (TIN, contours, volumes)
│   │   └── survey-wasm/             # wasm-bindgen bindings
│   ├── supabase/
│   │   ├── sql/                     # Schema, functions, RLS, seeds
│   │   ├── functions/
│   │   │   ├── solana-pay-verify/   # Edge Function: payment verification
│   │   │   └── openclaw-proxy/      # Edge Function: OpenClaw gateway proxy
│   │   └── config.toml
│   └── tauri.conf.json
│
├── ai-gateway/                      # OpenClaw host server (local AI stack)
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
cd frontend
npm install
npm run dev
```

### Environment

Create `frontend/.env` (see `frontend/.env.example`):

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Database

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

SQL schema is in `backend/sql/`.

### WASM Build (browser geometry engine)

```bash
cd backend/crates
bash build-wasm.sh
```

### Desktop Build (Tauri)

```bash
cd backend
cargo tauri dev
```

---

## Quality Checks

```bash
cd frontend
npm run lint       # ESLint
npm run typecheck  # TypeScript
npm run test       # Vitest
npm run build      # Production bundle
```

---

## Key Design Decisions

- **Hybrid on-chain / off-chain storage** — handles sensitive, legally significant data, so users choose per file what to anchor to Solana (tamper-evident, immutable, verifiable) versus what to keep in affordable Supabase storage. Security where it matters, low cost everywhere else.
- **Wallet-native economics** — the user's own Solana wallet pays the network gas fees for on-chain operations, keeping the platform's running costs predictable and the user in control of their data and spend.
- **Web 3.0 by default** — Solana on-chain payments and file anchoring are first-class features, not afterthoughts
- **OpenClaw AI & Automation** — the OpenClaw agent stack powers intelligent automation, natural language interaction, pattern recognition, and decision support throughout the framework
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