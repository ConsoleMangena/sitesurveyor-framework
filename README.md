<p align="center">
  <img src="apps/web/public/logo.svg" alt="SiteSurveyor logo" width="180" />
</p>

<h1 align="center">SiteSurveyor</h1>

<p align="center"><strong>A Hybrid On-Chain/Off-Chain Architecture for Secure and Verifiable Surveying Systems</strong><br />
An open-source reference architecture.<br />
<a href="https://sitesurveyor.tech">https://sitesurveyor.tech</a> · <a href="paper/main.pdf">Preprint (PDF)</a> · DOI: 10.5281/zenodo.24288094</p>

## The problem

A survey engagement yields more than coordinates. It produces a quotation, a schedule, a crew
assignment, field observations, photographs, CAD drawings, cost records, an invoice and ultimately
payment. In common practice these artifacts are scattered across separate systems for data
collection, pricing, photo sharing, presenting results and invoicing, linked only by a project
identifier that is routinely re-entered at every boundary.

Two problems follow:

- **Operational.** The state of a job must be reconstructed from multiple partial views, and that
  reconstruction is often stale.
- **Evidential.** Once a file is delivered to a client or regulator, it is difficult to prove it
  is the same file that was produced in the field.

## What SiteSurveyor is

SiteSurveyor is an open-source, multi-tenant workspace that maintains a **continuous operational
record** of each project (jobs, quotes, invoices, evidence and payments) in a single PostgreSQL
database with row-level security. Instead of buying another tool for each stage, one workspace
holds the record end to end, and external systems are used only for capabilities the workspace
cannot provide.

It is **hybrid by default**: confidential survey content stays off-chain in the database, and
Solana is used only where database guarantees are insufficient:

- **wallet-based authentication** (Sign In With Solana alongside email and GitHub),
- **stablecoin settlement** in USDC, and
- **wallet-signed SHA-256 digests** that let a third party verify a file has not changed without
  ever seeing its contents.

An AI assistant is treated as an **operational actor**, not a chat window: it calls a typed,
allowlisted tool surface scoped to the caller's workspace, reads its own writes back before
reporting success, and requires explicit confirmation for destructive operations. An asynchronous
Python worker screens open Earth-observation imagery into ranked field targets and deliverables.

## Contributions

Following the paper, the reference architecture contributes:

1. a **tenant-scoped data core** that connects quote, project, job, evidence, cost and payment to a
   single record, enforced by PostgreSQL row-level security, not only by application code;
2. an **evidence-anchoring service** with two modes: hash-only (publishes an attachment identifier
   and a SHA-256 digest) and opt-in full-file mode (AES-256-GCM encrypted chunks under a
   user-held key, where the chain receives only a manifest hash);
3. an **allowlisted agent tool surface**, a bounded agent rather than a better agent loop, with
   schema-validated writes, read-back verification and confirmation for deletes;
4. a **satellite analysis engine** that turns open Earth-observation products into ranked field
   targets and deliverables the workspace can render; and
5. an **honest deployment and verification story**, including sandboxed and unimplemented
   components.

The workspace is motivated by surveying, but the data core is not bound to it: any practice that
must keep a private operational record and later prove what was produced can reuse these
foundations.

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
devnet** and **PesePay sandbox**, demonstration values, not production settlement.

## What an anchored digest does and does not establish

| Established | Not established |
| --- | --- |
| The presented bytes equal the digested bytes | Who produced the bytes |
| The digest existed on-chain at a slot | That the survey is correct |
| The wallet paid for and signed the statement | Legal ownership or title |
| The manifest identifies the chunk set | Confidentiality of the plaintext |

The repository states its **non-claims** plainly: it does not certify survey accuracy, it does not
make a sandbox payment settled, and it does not treat a hash as proof of authorship. Anchoring
proves that a wallet anchored a digest at a time and nothing more. Review [SECURITY.md](SECURITY.md)
before handling real client data.

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
Only `VITE_*` values reach the browser, so they must be treated as public: never put service-role
keys, seed phrases or provider secrets in `apps/web/.env`.

**Bring your own accounts.** This repository does not include a hosted instance to point at: you
supply your own Supabase project, your own Digital Earth Africa token for the satellite engine, and
your own provider keys. Nothing here reaches the maintainer's deployment, and the credentials in
`apps/web/.env` and `apps/engine/.env` are yours alone. The published service at sitesurveyor.tech
is the maintainer's own deployment and is not a shared demo.

The desktop shell packages the same web app as a native window. It needs a Rust toolchain and
the platform build tools. See the [desktop shell guide](apps/desktop/README.md).

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
| [Paper](paper/README.md) | Preprint source, Zenodo deposit metadata and build instructions |

Found a vulnerability? Report it privately as described in [SECURITY.md](SECURITY.md) rather than
opening a public issue.

## Citing

If you use SiteSurveyor in research, cite the preprint (see [CITATION.cff](CITATION.cff)):

> Mangena, C. (2026). *SiteSurveyor: A Hybrid On-Chain/Off-Chain Architecture for Secure and
> Verifiable Surveying Systems*. Zenodo. https://doi.org/10.5281/zenodo.24288094

## License

MIT, see [LICENSE](LICENSE).
