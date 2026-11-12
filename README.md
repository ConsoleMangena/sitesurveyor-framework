<p align="center">
  <img src="apps/web/public/logo.svg" alt="SiteSurveyor logo" width="180" />
</p>

<h1 align="center">SiteSurveyor</h1>

<p align="center"><strong>The only workspace a surveyor needs to manage and execute a project.</strong><br />
An Eineva Labs product and open-source initiative for safer digital surveying.</p>

Surveying work usually lives in a paper field book, a spreadsheet and three disconnected systems.
SiteSurveyor keeps it in one continuous record instead: plan the job, price the quote, dispatch the
crew, collect the evidence, invoice the client — and every record stays attached to the project it
belongs to.

Sensitive survey content stays off-chain in Supabase. Solana is used only where it adds something:
wallet sign-in, USDC settlement, and a wallet-signed SHA-256 digest that proves a file has not
changed. An AI assistant can read and write the same workspace records through an allowlisted tool
set, so a question can turn into a verified action.

## What is implemented today

| Area | What you can do |
| --- | --- |
| Projects & teams | Projects, jobs, clients, quotes, invoices, crew assignment, scheduling, time and expenses |
| Evidence | File manager with versions and soft delete; hash-only or optional encrypted full-file anchoring on Solana |
| AI | Streaming chat with conversation memory and allowlisted tools over workspace data, files and CAD records |
| Surveying tools | Project CAD models (drawings, layers, entity metrics) readable by the AI, and job-scoped Earth Observation reports from the Python engine |
| Market | Instruments, professionals, firms, jobs, training and map discovery, with on-chain payment |
| Workspaces | Personal and business workspaces with row-level security, plus platform administration views |

The **web app is the shared frontend**. `apps/desktop` is a Tauri (Rust) shell that packages it as a
native window; `apps/mobile` is still a placeholder for the mobile shell. Commit defaults are **Solana
devnet** and **PesePay sandbox** — demonstration values, not production settlement.

## Repository layout

```text
apps/web/         React 19 + TypeScript PWA (the shared frontend)
apps/desktop/     Tauri (Rust) desktop shell over apps/web (Windows, macOS, Linux)
apps/mobile/      Placeholder for the Tauri (Rust) mobile shell (Android / iOS)
apps/engine/      Python satellite survey engine (worker, MCP server, CLI)
ai-gateway/       Optional self-hosted AI host + SiteSurveyor MCP tools
supabase/         Postgres schema, RLS policies and Edge Functions (AI, payments, anchoring)
scripts/ai-eval/  Deterministic AI evaluation checks
```

## Quick start

Requires Node 22.18+, a Supabase project, and (for AI chat) an NVIDIA NIM key.

```bash
npm install && npm --prefix apps/web install
cp apps/web/.env.example apps/web/.env     # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run db:push                            # apply migrations to your Supabase project
npm run dev                                # http://localhost:5174
```

Root scripts: `npm run dev`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`.
Only `VITE_*` values reach the browser, so they must be treated as public — never put service-role
keys, seed phrases or provider secrets in `apps/web/.env`.

The desktop shell packages the same web app as a native window. It needs a Rust toolchain and
the platform build tools — see the [desktop shell guide](apps/desktop/README.md).

```bash
npm --prefix apps/desktop install
npm run dev:desktop        # native window against the dev server
npm run build:desktop      # installers in apps/desktop/src-tauri/target/release/bundle
```

## Read next

| Document | Contents |
| --- | --- |
| [User guide](USER_GUIDE.md) | Day-to-day surveyor workflows |
| [Design](DESIGN.md) | Architecture, data flows and design decisions |
| [Security](SECURITY.md) | Data boundaries, two anchoring modes, deployment checklist |
| [Authentication](AUTHENTICATION.md) | Email, GitHub and wallet sign-in |
| [Product brief](PRODUCT.md) | Users, positioning and constraints |
| [Web app guide](apps/web/README.md) | Frontend setup, structure, PWA and testing |
| [Desktop shell guide](apps/desktop/README.md) | Tauri shell: toolchain, dev loop, installers |
| [Engine guide](apps/engine/README.md) | Satellite analysis worker and MCP server |
| [Contributing](CONTRIBUTING.md) | Setup, checks and pull request expectations |

Anchoring proves that a wallet anchored a digest at a time; it does not prove authorship, survey
accuracy or legal validity. Review [SECURITY.md](SECURITY.md) before handling real client data.

## License

MIT — see [LICENSE](LICENSE).
