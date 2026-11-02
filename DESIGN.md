# System architecture & design

SiteSurveyor is an **Eineva Labs product and open-source initiative** for safer digital surveying. The implemented client is a responsive React web application backed by Supabase, with Solana integrations for identity, payments, and file-integrity anchors, plus an AI agent that can inspect and act on allowlisted workspace data. .NET desktop and Java Android SDK clients are native platform targets, not current implementations.

The architecture is deliberately **hybrid by default**. Confidential survey content and operational records remain off-chain; standard Solana anchors carry only explicit transaction data and the minimal file-hash statement. A separate, explicitly enabled full-file storage model may commit encrypted, ordered chunks on-chain in the future. Neither mode treats blockchain as a substitute for confidential storage design.

## 1. Design goals

1. **Keep the job connected.** Quotes, projects, jobs, evidence, costs, invoices, and payments should form one operational record.
2. **Make AI operational, not ornamental.** The assistant uses real tools and returned records rather than generating unsupported status claims.
3. **Minimise on-chain exposure by default.** Keep original survey files and sensitive project metadata out of the standard file-anchor Memo. Require explicit consent and pre-chunk encryption for sensitive content in any full-file storage mode.
4. **Keep settlement rails distinct.** Solana USDC and PesePay fiat flows have separate configuration, behaviour, and confirmation semantics.
5. **Support field and office use.** The web UI is responsive, accessible, installable as a PWA, and explicit about offline/network state; native targets share the same product and security contracts.
6. **State limitations honestly.** Coming-soon tools, synthetic market data, development networks, planned chunked storage, and unimplemented native shells remain identifiable.
7. **Keep the framework open.** Eineva Labs develops SiteSurveyor as an inspectable, MIT-licensed framework that surveying teams and contributors can adapt and verify.

## 2. System context

```mermaid
flowchart TB
    subgraph Client["Browser / responsive PWA"]
        UI["React 19 + TypeScript"]
        WA["Solana Wallet Adapter"]
        CAD["Project CAD workspace"]
        FM["File manager + Web Crypto SHA-256"]
    end

    subgraph Supabase["Supabase platform"]
        AUTH["Auth<br/>Sign In With Solana"]
        DB["Postgres + PostgREST<br/>workspace records + RLS"]
        STORE["Storage<br/>original files"]
        AI["ai-chat Edge Function<br/>primary AI runtime"]
        SD["solana-data Edge Function<br/>RPC proxy + market cache"]
        PP["pesepay Edge Function<br/>fiat workflows"]
    end

    subgraph AIHost["Optional self-hosted AI path"]
        NODE["Node gateway<br/>static app + /api/chat"]
        MCP["SiteSurveyor MCP server<br/>optional OpenClaw path"]
    end

    SOL["Solana cluster<br/>Memo + SPL USDC"]
    NIM["NVIDIA NIM<br/>allowlisted models"]
    FIAT["PesePay<br/>sandbox in development"]

    UI --> AUTH
    UI --> DB
    FM -->|"Default: original files"| STORE
    UI --> AI
    UI --> SD
    UI --> PP
    WA --> SOL
    FM -->|"Signed SHA-256 Memo"| SOL
    FM -. "Planned opt-in: encrypted, ordered chunks" .-> SOL
    AI --> NIM
    AI --> DB
    NODE --> NIM
    NODE --> DB
    NODE -.-> MCP
    UI -.-> NODE
    SD --> SOL
    PP --> FIAT
```

## 3. Repository components

| Component | Responsibility |
| --- | --- |
| `apps/web` | Implemented React SPA/PWA, wallet flows, workspaces, project/CAD UI, file manager, market, and finance screens |
| `supabase/functions/ai-chat` | Authenticated primary AI endpoint; streams NDJSON events and invokes the shared agent core |
| `supabase/functions/_shared` | Model routing, agent tools, memory, skills, workflows, and shared AI behaviour |
| `supabase/functions/solana-data` | Public Solana RPC proxy and cached market snapshots |
| `supabase/functions/pesepay` | Server-side PesePay payment operations |
| `supabase/migrations` | Incremental database tables, views, RLS policies, functions, and marketplace seed changes |
| `ai-gateway` | Optional Node static host and self-hosted `/api/chat` fallback using the same agent contract |
| `ai-gateway/sitesurveyor-mcp` | MCP server exposing equivalent data, CAD, memory, and workflow tools over stdio |
| `scripts/ai-eval` | Evaluation and consistency checks for models, memory, skills, and tool rounds |
| `apps/desktop`, `apps/mobile`, `apps/live` | Reserved directories for the .NET desktop and Java Android SDK targets plus a live shell; none is implemented, so the web client is the only shipped surface |

## 4. Frontend architecture

### Workspace shells

`WorkspaceRouter` selects one of three shells from the authenticated profile:

- **Personal:** independent professional workflows.
- **Business:** firm operations, dispatch, staff, and shared resources.
- **Platform operator:** administrative views in addition to the applicable workspace behaviour.

Navigation is view-driven inside the workspace shell. Access filtering determines which views an account can open, while the public `/market` route remains available outside the authenticated workspace.

### Main frontend boundaries

| Boundary | Examples |
| --- | --- |
| `features/personal`, `features/business`, `features/platform` | Account-specific navigation, view registries, and shells |
| `features/projects` | Project dashboard, settings, file integration, and project-tool registry |
| `features/phantom`, `features/web3` | Wallet providers, Solana balances, payments, file anchors, and market feeds |
| `features/ai` | AI workspace interactions |
| `pages/shared` | Cross-account pages such as files, billing, settings, and AI message rendering |
| `lib/repositories` | Supabase data access and domain-specific persistence |
| `lib/auth` | Wallet authentication, session restoration, profile/workspace mapping, and cached user handling |
| `components/ui`, `components/layout` | Shared shadcn/Radix primitives and application layout |

### UI language

The product follows the shadcn-admin structure and neutral slate component language, retaining SiteSurveyor red (`#d92d20`) as the accent for brand marks, primary actions, live indicators, and market highlights. The public market may keep its map/chart/ticker character but uses shared tokens and primitives.

The baseline is keyboard-operable controls, visible focus, labelled fields, field-associated errors, and layouts that remain usable at 390 px width. Mobile web is a first-class field target, not a separate native application.

## 5. Authentication and account mapping

```mermaid
sequenceDiagram
    actor U as Surveyor
    participant B as Web app
    participant W as Solana wallet
    participant A as Supabase Auth
    participant D as Supabase database

    U->>B: Choose wallet sign-in
    B->>W: SIWS request with statement and nonce
    W-->>U: Display signature request
    U->>W: Approve signature
    W-->>B: Signed authentication result
    B->>A: signInWithWeb3
    A-->>B: Authenticated session
    B->>D: Load profile, default workspace, memberships
    D-->>B: Account and workspace context
    B-->>U: Personal, business, or operator shell
```

Desktop behaviour prefers native wallet SIWS where available. Mobile/Mobile Wallet Adapter behaviour can use `signMessage`, with Solflare hand-off support. A cryptographically random nonce is generated for SIWS.

After authentication, the app loads the profile and workspace with retries to tolerate trigger lag. Cached session/user data supports offline presentation, but it must not be interpreted as proof that new remote operations succeeded.

## 6. AI agent architecture

### Runtime paths

**Primary:** the browser calls the `ai-chat` Supabase Edge Function with the user's bearer token. The function authenticates the user, verifies conversation ownership, resolves workspace context, persists turns, invokes the shared agent, and streams NDJSON events.

**Fallback:** the Node gateway exposes the same `/api/chat` request/event contract and serves the built SPA. It also authenticates the Supabase user and checks conversation ownership. It is an alternate host, not local/offline inference; NVIDIA and Supabase remain remote dependencies.

**Optional OpenClaw path:** the gateway can delegate to an OpenClaw agent configured with the SiteSurveyor MCP server. This path is buffered, whereas the shared inline agent streams deltas.

### Agent event contract

```text
{"type":"status", "phase":"..."}
{"type":"tool", "name":"..."}
{"type":"delta", "text":"..."}
{"type":"final", "text":"..."}
{"type":"error", "message":"..."}
```

### Model and tool controls

- Models are restricted by a shared allowlist in `supabase/functions/_shared/models.ts`.
- Task-complexity scoring selects an allowed model and tool-round budget.
- The agent has explicit read and write table allowlists.
- Live Supabase OpenAPI schema information helps the model use actual columns.
- Write payloads are checked against the schema; unknown columns are rejected or removed according to the tool path.
- The caller's workspace is stamped onto new business records when applicable.
- Insert and update results are read back and marked as verified before the assistant reports success.
- Update and delete tools require a valid record UUID.
- Permanent deletes require `confirmed=true` after an explicit user confirmation.
- Repeated identical calls and total tool rounds are capped; upstream calls have timeouts.
- Conversation history is bounded, older turns can be summarised, and structured memory can retain selected durable facts.

The assistant's current product behaviour allows ordinary creates and updates to proceed immediately, while destructive deletes require confirmation. CAD geometry is emitted as command blocks and executed by the user in the project workspace; erase operations have an additional confirmation requirement.

### Tool groups

| Group | Tools/behaviour |
| --- | --- |
| Schema & query | Inspect columns, query allowlisted tables, count matching records |
| Operational writes | Insert, update, or explicitly confirmed delete on allowlisted tables |
| Finance workflows | Create quotes from line items; close eligible overdue invoices |
| Scheduling | Schedule jobs and produce assignment warnings/results |
| CAD | Read drawings, list layers, count entities, inspect entities, and generate user-executed command blocks |
| Memory | Remember or forget structured conversation facts |

The MCP server mirrors this tool surface for compatible hosts. Any change to tool contracts should keep the shared Edge/Node agent and MCP definitions aligned and run the AI consistency checks.

## 7. File integrity and Solana anchoring

### Storage model

Original file bytes are uploaded to Supabase Storage, and attachment metadata is stored in Postgres. The browser uses Web Crypto to calculate a lowercase hexadecimal SHA-256 digest. Integrity verification downloads the current object, recomputes the digest, and compares it with the recorded value.

### Anchor transaction

Only the following statement is placed in the Solana Memo:

```text
ssv1:<attachment-id>:sha256:<lowercase-content-hash>
```

The transaction uses Solana Memo Program v3 and is signed and fee-paid by the connected wallet. It is a classic, non-versioned transaction for compatibility with the built-in wallet adapter.

```mermaid
sequenceDiagram
    actor U as Surveyor
    participant F as File manager
    participant D as Supabase metadata/storage
    participant W as Wallet
    participant S as Solana cluster

    U->>F: Choose “Anchor hash on Solana”
    F->>D: Read attachment ID + recorded SHA-256
    F->>S: Request latest blockhash / estimate fee
    F->>W: Send Memo transaction for signature
    W-->>U: Show transaction approval
    U->>W: Approve
    W->>S: Submit signed transaction
    S-->>F: Transaction signature
    F->>D: Record pending signature + network
    F->>S: Poll signature status
    alt Confirmed
        F->>D: Save anchored status + timestamp
        F-->>U: Show Explorer link
    else Failed or timed out
        F->>D: Save failed status where applicable
        F-->>U: Show recovery guidance
    end
```

The Memo is self-describing so a chain reader can associate the proof with an attachment without publishing the file. In this implemented hash-only mode, the original file remains off-chain. A hash proves byte equivalence only; it does not establish provenance, ownership, correctness, or regulatory acceptance.

### Full-file chunked storage model (planned)

The product framework also defines an optional full-file on-chain model. This is not implemented in the current web client and must not be inferred from the existing `fileAnchor.ts` flow.

Where enabled, the intended behaviour is:

1. The user explicitly selects full-file storage and reviews the cluster, permanence, privacy, and cost implications.
2. Sensitive content is encrypted before any chunk is created or transmitted. Key custody and recovery are part of the storage design, not an afterthought.
3. The payload is divided into ordered, verifiable chunks sized for Solana transaction constraints; a large file is not treated as one blockchain transaction.
4. Chunks are committed separately. A manifest records the complete-payload integrity value, chunk order, chunk integrity values, and transaction references needed for retrieval.
5. During retrieval, the client resolves the manifest, fetches and verifies the chunks, reassembles the payload, verifies the complete-file integrity record, and decrypts it where applicable.

Hash-only anchoring and full-file storage must remain separate user choices, configuration paths, UI labels, and threat models. Full-file mode requires dedicated implementation and security review before it can be described as available.

## 8. Payments

### Solana USDC

The frontend reads cluster, RPC, USDC mint, and treasury configuration from `VITE_SOLANA_*` values. The recipient treasury must be configured before the on-chain payment action is shown. Wallet-signed SPL token transactions settle on the selected Solana cluster, and signatures/network details provide reconciliation references.

Development defaults to devnet. Mainnet configuration must be an explicit deployment decision, with matching RPC, mint, treasury, wallet, and operational controls.

### PesePay fiat

Fiat operations run through the PesePay Edge Function and off-chain payment records. The current development constraint is sandbox-only: secrets stay server-side, no live charge is initiated from development, and keys require rotation before production.

The UI and documentation must never blur a pending Solana transaction, a sandbox fiat transaction, and a settled production payment.

## 9. Data classification by location

| Data | Supabase Auth/Postgres | Supabase Storage | AI provider | Solana | PesePay |
| --- | --- | --- | --- | --- | --- |
| Account/workspace profile | Yes | No | Only relevant supplied context | Wallet address may be public through transactions | Only required payment context |
| Operational records | Yes | No | Relevant query/tool context | No | Payment-related subset where applicable |
| Original survey files | Metadata only | Yes by default | Only if explicitly supplied through an AI workflow | **No by default; encrypted chunks only in the planned opt-in full-file mode** | No |
| File SHA-256 + attachment ID | Yes | No | Only if supplied | **Yes, on anchor** | No |
| AI conversations/memory | Yes | No | Prompt/history/tool context | No | No |
| Solana transaction | Signature/status metadata | No | Only if supplied | Yes | No |
| Fiat transaction | Payment metadata | No | Only if supplied | No | Yes |

This table describes intended system flow, not a certification of every possible custom integration. New tools and workflows must update the data-flow review.

## 10. PWA and network behaviour

The Vite PWA configuration caches application assets and selected public image/storage assets. Authenticated Supabase REST responses use `NetworkOnly` so sensitive or current workspace data is not served from a stale service-worker cache.

The application also provides offline status, cached-session restoration, and cached user mapping. These measures improve resilience; they do not make AI, live queries, uploads, or blockchain transactions offline-capable.

## 11. Deployment shapes

### Static host

`render.yaml` builds `apps/web`, publishes `apps/web/dist`, and rewrites application routes to `index.html`. Supabase Edge Functions and external providers remain separate services.

### Docker/Nginx

The multi-stage Dockerfile builds the web app in Node 22 Alpine and serves the static output with Nginx. `docker-compose.yml` exposes it on port 8080. Frontend build arguments become public browser configuration and must never include server secrets.

### Self-hosted AI gateway

The optional Node gateway serves the same static bundle and `/api/chat`. It requires server-side NVIDIA and Supabase service-role configuration and a built MCP artifact at startup. See [AI gateway guide](ai-gateway/README.md).

## 12. Verification strategy

- TypeScript project checks for compile-time contracts.
- ESLint for frontend code quality and hooks rules.
- Vitest + Testing Library for repositories, wallet helpers, file anchors, pages, and UI behaviour.
- Solana browser-ESM and RPC shims in tests to avoid live websocket/network requirements.
- Production build to catch bundling and PWA issues.
- AI evaluation scripts for model, skill, memory, and tool-round behaviour.
- Separate deployment checks for RLS, Storage policies, Edge Function authorization, cluster consistency, and payment reconciliation.

See [Security model](SECURITY.md) for the production security gate and [Web app guide](apps/web/README.md) for commands.
