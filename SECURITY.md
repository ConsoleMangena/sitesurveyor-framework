# Security model

SiteSurveyor is an **Eineva Labs product and open-source initiative** created to help surveying teams adopt digital fieldwork without overlooking cybersecurity. Survey data can expose property boundaries, critical infrastructure, precise coordinates, client identity, commercial terms, and other sensitive information. SiteSurveyor therefore uses a **hybrid security model by default**: controlled off-chain storage for confidential content, and Solana for explicit wallet authentication, settlement, and minimal integrity proofs.

> **Blockchain provides tamper-evidence, not confidentiality.** Never put unencrypted confidential survey files, client details, coordinates, private keys, seed phrases, or confidential project notes on-chain. Any optional full-file mode must encrypt sensitive content before chunking and require explicit user consent.

This document describes implemented controls, planned storage behaviour, and important limitations. It is not a security certification, legal opinion, or substitute for an independent production audit.

## 1. Security objectives

- Keep plaintext sensitive files and operational records out of public blockchain data.
- Restrict workspace data to authenticated, authorised users and services.
- Make file alterations detectable against a recorded SHA-256 digest.
- Require explicit wallet signatures for Solana transactions.
- Constrain AI tools and keep privileged provider/service keys off the browser.
- Keep development networks and sandbox payments separate from production activity.
- Preserve enough network, signature, and status metadata for reconciliation and investigation.

## 2. Data boundaries

| Data class | Intended location | Public on Solana? | Key concern |
| --- | --- | --- | --- |
| Original plans, point clouds, site photos, reports | Supabase Storage | **No** | Bucket/object authorization and sharing |
| Projects, contacts, jobs, quotes, invoices, team data | Supabase Postgres | **No** | Workspace isolation and RLS |
| AI conversations, summaries, structured memory | Supabase Postgres | **No** | User ownership, retention, provider processing |
| AI prompts and relevant tool context | Processed by configured NVIDIA NIM service | **No** | Provider policy and confidential-data governance |
| Attachment ID + SHA-256 digest | Postgres and Solana Memo when anchored | **Yes** | Public permanence and identifier/digest disclosure |
| Solana wallet address and transaction signature | Wallet, chain, and selected metadata | **Yes when used on-chain** | Address/linkability and cluster correctness |
| Solana USDC payment | Solana | **Yes** | Recipient, mint, amount, finality, and key security |
| PesePay payment data | PesePay and off-chain records | **No** | Server secrets, provider status, reconciliation |

### File-anchor privacy

The built-in anchor Memo is:

```text
ssv1:<attachment-id>:sha256:<lowercase-file-digest>
```

It does not contain the file name, file bytes, client name, project title, or coordinates. Nevertheless, the attachment ID and digest are public. A digest can also confirm that a suspected known file matches the anchored version. If even that disclosure is unacceptable for a particular workflow, do not anchor it publicly; use an approved alternative integrity-control design.

Deleting an off-chain file or database row does not remove an existing blockchain Memo. Plan retention and client disclosures accordingly.

## 3. Identity and wallet security

### Sign In With Solana

The app uses Supabase Web3 authentication and Sign In With Solana (SIWS). The wallet signs an authentication statement with a nonce; the app then loads the user's profile and workspace membership.

Controls include:

- A cryptographically generated SIWS nonce in the normal browser flow.
- Native desktop wallet SIWS where supported.
- Mobile-specific signing and Solflare hand-off behaviour.
- Protected workspace routes and account/view filtering.
- Session-expiry handling and cached-session logic for network interruptions.

Users must still inspect the domain, statement, wallet, and network context. Authentication signatures should never request a seed phrase or approve a fund transfer.

### Built-in SiteSurveyor wallet

The optional built-in wallet encrypts a generated Solana keypair with:

- PBKDF2 using SHA-256 and 250,000 iterations.
- A random salt and AES-GCM initialization vector.
- AES-256-GCM encryption using a key derived from the user's PIN.
- Ciphertext storage through the custom-wallet repository; the decrypted keypair is held by the adapter while unlocked.

This is not the same trust model as an external hardware or audited software wallet. PIN strength, endpoint security, Supabase access, recovery procedures, and implementation review remain critical. Use an appropriately reviewed external wallet for high-value production funds, and never reuse a development wallet as a production treasury.

## 4. Workspace and database controls

SiteSurveyor uses authenticated Supabase access, workspace-scoped repository queries, and Row Level Security on multiple AI, marketplace, portfolio, wallet, storage-purchase, and payment tables. Additional base schema and deployment policies may exist outside the incremental migration files.

Before production, verify the complete deployed schema rather than assuming every table is protected by a migration visible in this repository:

- Every exposed table and view has the intended deny-by-default policy.
- Personal and business workspace membership is enforced server-side.
- Storage buckets and object paths enforce the same workspace boundaries as attachment metadata.
- Public market views expose only deliberately public fields.
- Platform-operator capabilities are limited to authorised accounts.
- Security-definer functions have reviewed search paths, privileges, and row exposure.
- Service-role credentials are never present in frontend code, Vite variables, logs, screenshots, or static bundles.

RLS is a necessary layer, not a complete authorization review. Test cross-workspace read, insert, update, delete, storage, and function access with real non-privileged roles.

## 5. AI trust boundaries

### Implemented safeguards

- The browser does not hold the NVIDIA key or Supabase service-role key.
- AI endpoints authenticate the user and check conversation ownership.
- Models and data tables are allowlisted.
- Tool arguments are checked against expected schemas and live database columns.
- Workspace context is applied to new business writes where applicable.
- Update/delete tools require a valid UUID; deletes require explicit confirmation.
- Insert/update results are read back before being reported as verified.
- Tool loops, round counts, history sizes, and upstream timeouts are bounded.
- CAD command blocks require user execution, with additional confirmation for erasure.

### Service-role warning

The shared AI runtime and optional gateway use a Supabase service-role key for server-side tool execution. Service-role access can bypass normal RLS. Consequently, endpoint authentication, conversation ownership checks, workspace resolution, table allowlists, record scoping, and tool implementation are critical authorization boundaries.

Do not assume RLS alone protects an AI tool call. Every new tool requires a review of:

1. Which authenticated user and workspace it serves.
2. Which rows it can read or mutate.
3. Whether user-supplied IDs can reference another workspace.
4. Whether the operation needs confirmation.
5. What sensitive data is sent to the model or returned to the browser.
6. What is logged and how success is verified.

### Prompt and model risk

AI output can be incorrect, and malicious content in records or files can attempt prompt injection. Treat model output as untrusted input to a professional workflow:

- Verify coordinates, datums, units, calculations, client details, totals, and record IDs.
- Require confirmation for destructive or externally consequential operations.
- Do not let a model invent transaction success, payment settlement, survey accuracy, or legal compliance.
- Review the AI provider's data-use, retention, regional, and contractual terms before sending restricted project context.
- Avoid placing secrets or unnecessary confidential content in prompts, memory, tool descriptions, or evaluation fixtures.

## 6. File integrity and evidence handling

The file manager calculates and records SHA-256 digests, supports integrity verification, tracks file versions, and optionally anchors a digest through a wallet-signed Solana Memo transaction.

These controls can detect byte changes relative to a digest. They do not establish:

- Who created or legally owns the file.
- Whether a survey was performed correctly.
- Whether the content is complete, authentic at capture time, or legally admissible.
- Whether the wallet owner was authorised by the client or firm.
- Whether the off-chain file will remain available.

For a defensible evidence process, combine hashes and anchors with access logs, approved signing identities, capture provenance, version history, backups, retention rules, professional QA, and the legal requirements of the relevant jurisdiction.

If verification fails, stop treating the object as the anchored version. Preserve the file and mismatch details, inspect version/access history, and follow the organisation's incident and evidence-handling procedure.

## 7. Solana transaction safety

Development defaults to **devnet**. Before approving an anchor or payment, verify:

- The application origin and wallet prompt.
- The cluster and RPC endpoint.
- The transaction type and expected Memo or SPL token operation.
- The USDC mint, amount, and treasury recipient for payments.
- The fee payer and available SOL for network fees.
- The resulting signature and confirmation on the same cluster.

A devnet signature is not mainnet proof. A submitted signature is not necessarily a confirmed transaction. A confirmed file anchor is not a payment, and a payment signature is not proof that an invoice's off-chain status was correctly reconciled.

Use a trusted production RPC strategy, explicit mainnet configuration, separate production treasury/wallet controls, and monitoring appropriate to the value and evidence involved.

## 8. Fiat payment safety

PesePay is a separate fiat rail. The current repository constraint is **sandbox-only for development**:

- Keep PesePay secrets in server-side environment/secrets management only.
- Do not print, commit, or paste credentials into documentation, tickets, logs, or chat.
- Do not initiate live charges from a development session.
- Rotate exposed or development-shared credentials before production.
- Reconcile provider callbacks/status with invoice records before reporting settlement.

Solana and PesePay confirmations must remain behaviourally and visually distinct.

## 9. Secrets and public frontend configuration

All `VITE_*` values are public build-time configuration. Safe examples include the Supabase project URL, anon/publishable key, Solana cluster, public RPC URL, USDC mint, and treasury address.

Never expose:

- `SUPABASE_SERVICE_ROLE_KEY`
- `NVIDIA_API_KEY`
- PesePay secret keys
- Wallet seed phrases or private keys
- Built-in wallet PINs
- Production database passwords or unrestricted administrative tokens

Keep real `.env` files out of source control. The repository's `.gitignore` excludes them while allowing `.env.example` templates. Review generated bundles and logs after configuration changes to ensure no privileged value was introduced.

## 10. Browser and PWA considerations

The PWA service worker caches application assets and selected public images/public storage objects. Authenticated Supabase REST calls use `NetworkOnly`, reducing the risk of serving stale private workspace API responses from the service-worker cache.

Public storage objects should still be considered public. Do not place confidential survey evidence in a public bucket merely because the surrounding page requires sign-in.

Cached sessions and offline screens are usability features, not proof of current authorization or completed remote writes. Revalidate sensitive operations after reconnecting.

## 11. Production readiness checklist

Complete and record these checks before using live client data, mainnet assets, or live payments:

### Access and data

- [ ] Review the entire deployed schema, views, functions, and storage policies—not only incremental migrations.
- [ ] Test cross-user and cross-workspace access with non-privileged accounts.
- [ ] Confirm sensitive buckets are private and sharing/download URLs follow policy.
- [ ] Configure backups, restoration tests, retention, deletion, and evidence-export procedures.
- [ ] Review public market and public storage exposure.

### AI

- [ ] Threat-model every AI tool with service-role privileges and workspace-crossing IDs.
- [ ] Configure provider retention/data-use terms and an approved confidential-data policy.
- [ ] Test prompt injection, unauthorized record access, destructive actions, and misleading success responses.
- [ ] Restrict logs and evaluation datasets so they do not leak project data or secrets.

### Web3 and payments

- [ ] Use separate reviewed production wallets, treasury addresses, RPC endpoints, and USDC mint.
- [ ] Confirm cluster consistency across sign-in UX, anchors, payments, Explorer links, and records.
- [ ] Complete a wallet/key-management review, including the optional built-in wallet and recovery process.
- [ ] Rotate sandbox or previously exposed payment credentials and enable live payments only through an approved release.
- [ ] Test pending, failed, delayed, duplicate, and reconciled transaction states.

### Application and operations

- [ ] Run typecheck, lint, unit/integration tests, production build, and relevant AI evaluation suites.
- [ ] Perform dependency, secret, static-bundle, and deployment-configuration scans.
- [ ] Configure TLS, security headers, rate limiting, monitoring, audit retention, and incident response.
- [ ] Complete an independent security review appropriate to the sensitivity and value at stake.

## 12. Explicit non-claims

Unless separately implemented and verified in a deployment, do not describe SiteSurveyor as providing:

- End-to-end encryption of all workspace data or AI prompts.
- Decentralised storage of original survey files.
- Confidential blockchain storage.
- Legal certification of document authenticity, land ownership, or survey accuracy.
- Automatic regulatory compliance.
- Fully offline AI, payments, or blockchain verification.
- Production-ready live fiat processing while using sandbox credentials.

Precise language is a security control: users must understand what is protected, where data goes, and which guarantees the system does not make.

## Reporting a security concern

Contact the repository maintainer through a private channel. Do not open a public issue containing credentials, private keys, client data, sensitive coordinates, or an exploitable proof of concept. Remove secrets from logs before sharing them, and rotate any credential that may have been exposed.
