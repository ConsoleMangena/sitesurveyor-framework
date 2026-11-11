# Security model

SiteSurveyor uses a **hybrid security model by default**: confidential content stays in controlled
off-chain storage, and Solana carries explicit wallet authentication, settlement, and minimal
integrity proofs. Survey data can expose boundaries, critical infrastructure, precise coordinates,
client identity and commercial terms, so the default is private.

> **Blockchain provides tamper-evidence, not confidentiality.** Never put unencrypted survey files,
> client details, coordinates, private keys, seed phrases or confidential notes on-chain.

This document states implemented controls and real limitations. It is not a certification, a legal
opinion, or a substitute for an independent production audit.

## 1. Objectives

Keep plaintext files and operational records out of public chain data · restrict workspace data to
authenticated, authorised users and services · make alteration detectable against a recorded SHA-256
digest · require explicit wallet signatures · constrain AI tools and keep privileged keys off the
browser · keep devnet and sandbox activity separate from production · preserve signature, network and
status metadata for reconciliation.

## 2. Data boundaries

| Data class | Location | Public on Solana? | Key concern |
| --- | --- | --- | --- |
| Plans, point clouds, photos, reports | Supabase Storage (full-file mode adds encrypted chunk copies there) | **No** — only digests and chunk count | Bucket authorization, pre-chunk encryption, key custody |
| Projects, contacts, jobs, quotes, invoices, team | Postgres | **No** | Workspace isolation, RLS |
| AI conversations, summaries, memory | Postgres | **No** | Ownership, retention, provider processing |
| Prompts and tool context | NVIDIA NIM | **No** | Provider policy, confidential-data governance |
| Attachment ID + SHA-256 digest | Postgres + Memo when anchored | **Yes** | Public permanence, digest confirmation |
| Wallet address, transaction signature | Wallet, chain, metadata | **Yes when on-chain** | Linkability, cluster correctness |
| USDC payment | Solana | **Yes** | Recipient, mint, amount, finality, key security |
| PesePay payment data | PesePay + off-chain records | **No** | Server secrets, reconciliation |
| Satellite deliverables (GeoTIFF, PNG, GeoJSON, KMZ, HTML) | Storage `survey-deliverables`, metadata in `survey_runs` / `survey_deliverables` | **No** | Bucket authorization, workspace RLS |
| Satellite job spec (category, lat/lon, extent) | `jobs.description` JSON | **No** | Workspace isolation, pricing integrity |

**Anchor memos.** Neither form carries file name, bytes, client, project title or coordinates:

```text
ssv1:<attachment-id>:sha256:<file-digest>
ssv2:<attachment-id>:sha256:<file-digest>:<manifest-digest>:<chunk-count>
```

The attachment ID and digest are still public, and a digest can confirm that a suspected known file
matches. If that disclosure is unacceptable, do not anchor it publicly. Deleting an off-chain row
never removes an existing Memo — plan retention and client disclosure accordingly.

**Full-file chunk confidentiality.** Chunk copies are encrypted before they leave the browser: a
fresh 256-bit key per operation, AES-256-GCM with a random IV per chunk (manifest copy included), and
the key persisted only wrapped under PBKDF2-SHA-256 (250,000 iterations) from a passphrase that is
never stored, hashed for lookup, or transmitted. Manifest and on-chain digests describe the
**plaintext**, so the proof stays about the original file. Consequences: losing the passphrase makes
the chunk copies unrecoverable (the original file and the chain record remain valid); there is no
key-recovery service; records anchored before this scheme hold plaintext chunks and are labelled as
such. Anyone with storage access but no passphrase sees ciphertext; anyone with the passphrase reads
the anchored bytes.

## 3. Identity and wallets

**Sign In With Solana.** The wallet signs an authentication statement containing a cryptographically
random nonce; the app then loads profile and workspace membership. Native desktop SIWS where
supported, mobile `signMessage` with Solflare hand-off, protected routes, view filtering, session
expiry and cached-session handling for network interruptions. Users must still inspect domain,
statement, wallet and network. An authentication signature never needs a seed phrase or a transfer.

**Built-in wallet.** An optional generated Solana keypair encrypted with PBKDF2-SHA-256 (250,000
iterations), a random salt and AES-256-GCM under a user PIN; the decrypted keypair lives only in the
adapter while unlocked. This is a weaker trust model than a hardware or audited software wallet —
review it, use an external wallet for high-value funds, and never reuse a development wallet as a
production treasury.

## 4. Workspace and database controls

Authenticated Supabase access, workspace-scoped repository queries, and RLS across AI, marketplace,
portfolio, wallet, storage-purchase and payment tables. Verify the **deployed** schema before
production rather than assuming every table is covered by a migration in this repository:

- every exposed table and view is deny-by-default;
- membership is enforced server-side for both personal and business workspaces;
- buckets and object paths enforce the same boundaries as attachment metadata;
- public market views expose only deliberately public fields;
- platform-operator capabilities are limited to authorised accounts;
- `security definer` functions have reviewed search paths, privileges and row exposure;
- service-role credentials never reach frontend code, Vite variables, logs or bundles.

RLS is a necessary layer, not an authorization review. Test cross-workspace read, insert, update,
delete, storage and function access with non-privileged roles.

## 5. AI trust boundaries

**Implemented:** the browser holds no NVIDIA or service-role key · endpoints authenticate the user
and check conversation ownership · models and tables are allowlisted · tool arguments are checked
against schemas and live columns · workspace context is stamped onto new writes · update/delete need
a valid UUID and deletes need explicit confirmation · writes are read back before being reported
verified · tool loops, rounds, history and timeouts are bounded · CAD commands execute only when the
user runs them, with extra confirmation for erasure.

**Service-role warning.** The AI runtime and optional gateway use a service-role key, which can
bypass RLS. Endpoint authentication, ownership checks, workspace resolution, table allowlists, record
scoping and tool implementation *are* the authorization boundary. Every new tool needs a review of:
which user and workspace it serves · which rows it reads or mutates · whether a supplied ID can reach
another workspace · whether it needs confirmation · what data reaches the model or browser · what is
logged and how success is verified.

**Prompt and model risk.** Output can be wrong, and record or file content can attempt prompt
injection. Treat it as untrusted input: verify coordinates, datums, units, totals and record IDs,
confirm destructive or externally consequential actions, never let a model invent settlement or
compliance, and review the provider's retention and data-use terms before sending restricted context.

## 6. Evidence handling

The file manager records SHA-256 digests, verifies integrity, tracks versions, and can anchor a
digest through a wallet-signed Memo; full-file mode also encrypts chunk copies and rebuilds the bytes
to prove they still match the chain. These controls detect byte changes. They do **not** establish
authorship or ownership, correct survey work, capture-time authenticity or legal admissibility,
that the wallet owner was authorised by the client, or that the off-chain file stays available. A
defensible process combines hashes with access logs, approved signing identities, version history,
backups, retention rules, QA and local legal requirements.

If verification fails, stop treating the object as the anchored version: preserve the file and the
mismatch detail, inspect version and access history, and follow incident procedure.

## 7. Solana transaction safety

Development defaults to **devnet**. Before approving an anchor or payment, verify app origin and
wallet prompt, cluster and RPC, transaction type and expected Memo or SPL operation, USDC mint,
amount and treasury, fee payer and available SOL, then the signature and confirmation **on the same
cluster**. A devnet signature is not mainnet proof; a submitted signature is not a confirmation; an
anchor is not a payment; and a payment signature is not proof that an invoice reconciled.

**Marketplace orders enforce that in code.** Checkout writes the order as `pending` before signing,
so an abandoned tab leaves a traceable record instead of an untraceable transfer.
`market_order_attach_signature` moves it to `submitted`; the `guard_marketplace_order_status` trigger
rejects `completed` from any non-service role and refuses to reopen a completed order or replace a
recorded signature. Only `market-verify-payment` completes an order, after `getTransaction` shows the
seller wallet receiving at least the order amount on a non-failing transaction. The payout address is
resolved at pay time (`market_listing_payout`), not from the copy stored when the listing was created.

## 8. Fiat payments

PesePay is a separate rail and is **sandbox-only in development**: secrets stay server-side and out
of logs, tickets and chat; no live charge comes from a development session; credentials rotate before
production; provider callbacks reconcile against invoice records before settlement is reported.
Solana and fiat confirmations stay behaviourally and visually distinct.

**Refunds.** PesePay exposes no refund call, so the money side settles with the provider out of band
and is then recorded in-product. Both recording paths are database functions, not client writes —
`record_pesepay_transaction_refund()` and `reverse_workspace_ai_credits()` re-check
`profiles.is_platform_admin` inside `security definer` functions (the two documented exceptions to
service-role-only grants), take a `pg_advisory_xact_lock` on the corrected row so the same value
cannot be clawed back twice, and are idempotent. Reclaims are capped at the current balance and never
go negative; a storage refund ends the allocation window rather than deleting files. The credit
ledger stays append-only — a correction is a `reversal` row linked to the entry it corrects — and both
actions require a written reason of at least three characters. A refund applies only to a payment
that reached `completed`; a table check requires `refunded` rows to carry `refunded_at` and
`refund_reason`, which only the function sets.

## 9. Secrets

All `VITE_*` values are public build-time configuration: the Supabase URL, anon/publishable key,
Solana cluster, public RPC URL, USDC mint and treasury address are safe there. Never expose
`SUPABASE_SERVICE_ROLE_KEY`, `NVIDIA_API_KEY`, PesePay secret keys, seed phrases, private keys,
built-in wallet PINs, database passwords or unrestricted admin tokens. Keep real `.env` files out of
source control (`.gitignore` allows only `.env.example`), and re-check generated bundles and logs
after configuration changes.

## 10. Browser and PWA

The service worker caches app assets and selected public images; authenticated Supabase REST calls use
`NetworkOnly`, so private workspace responses are not served stale. Public storage objects are public
— never place confidential evidence in a public bucket because the surrounding page requires sign-in.
Cached sessions and offline screens are usability features, not proof of current authorisation. A
workspace session left open on a shared device keeps whatever that browser had cached; treat it as a
physical-access risk and sign out.

## 11. Production readiness checklist

Access and data — review the whole deployed schema, views and storage policies; test cross-workspace
access with non-privileged accounts; confirm sensitive buckets are private; configure backups,
restoration tests, retention and deletion; review public market and public storage exposure.

AI — threat-model every service-role tool and every ID that can cross workspaces; configure provider
retention terms and an approved confidential-data policy; test prompt injection, unauthorised access,
destructive actions and misleading success responses; keep logs and eval fixtures free of project
data.

Web3 and payments — use separate reviewed production wallets, treasury, RPC and mint; confirm cluster
consistency across sign-in, anchors, payments and Explorer links; complete a key-management review
including the built-in wallet; rehearse the full-file flow (passphrase custody, loss consequence,
chunk recovery, retention) in staging; rotate sandbox or exposed credentials and enable live payments
only via an approved release; test pending, failed, delayed, duplicate and reconciled states; agree the
refund procedure — who settles with the provider, who records it, how revoked credits and storage
windows are confirmed — **before** taking money.

Application and operations — run typecheck, lint, tests, production build and AI evaluations; scan
dependencies, secrets, the static bundle and deployment config; configure TLS, security headers, rate
limiting, monitoring, audit retention and incident response; complete an independent review
proportionate to the value at stake.

## 12. Explicit non-claims

Do not describe SiteSurveyor as providing end-to-end encryption of all workspace data or prompts;
automatic decentralised storage of original files (full-file mode keeps encrypted copies in the same
Supabase buckets — it does not replicate to a decentralised network); confidential blockchain storage
merely because a payload is chunked (only digests reach the chain); legal certification of document
authenticity, land ownership or survey accuracy; automatic regulatory compliance; fully offline AI,
payments or blockchain verification; or production-ready live fiat processing on sandbox credentials.

Precise language is a security control: users must understand what is protected, where data goes, and
which guarantees the system does not make.

## Reporting a security concern

Contact the maintainer privately. Do not open a public issue containing credentials, private keys,
client data, sensitive coordinates or an exploitable proof of concept. Strip secrets from logs before
sharing and rotate anything that may have been exposed.
