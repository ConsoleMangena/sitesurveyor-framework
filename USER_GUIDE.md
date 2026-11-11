# SiteSurveyor user guide

**Plan the work. Execute the survey. Preserve the evidence. Settle the job.**

This guide covers the implemented web app. Personal and business workspaces expose slightly different
navigation; platform operators see additional administration views. .NET desktop and Java Android are
platform targets, not available clients.

> **Private by default.** Original files stay in Supabase Storage. Hash-only anchoring writes only the
> attachment ID and SHA-256 digest to Solana. Full-file anchoring is a separate per-file choice and
> also keeps the file off-chain.

## 1. Getting started

**Personal** — an independent surveyor: own work, finances, files, contacts. **Business** — a firm:
quotes, projects, dispatch, staff, assets, billing. **Platform operator** — platform-level users,
workspaces, activity and audit; not needed for surveying work.

**Sign in with a wallet.** Choose the wallet flow your device offers, review the Sign In With Solana
message, and sign. A signature proves control of the wallet; it is not a payment. Complete the profile
and finish-setup steps, then confirm you landed in the intended workspace. Desktop is built around
Phantom; mobile supports Solflare hand-off. Never share a seed phrase to sign in — sign-in asks for a
signature, never a recovery phrase.

Development deployments use **Solana devnet**: devnet SOL and USDC have no monetary value and devnet
anchors are not production evidence. Check the network in the app and in your wallet before approving.

## 2. The workflow

**1. Plan and price.** Create a contact for the client, prepare a quote with line items, rates, taxes
and notes, create a project to group the record, drawings, files and settings, review the dashboard,
and identify required assets and crew. The AI can help create allowed records — check names, dates,
quantities, rates and coordinates before relying on the result.

**2. Prepare and execute.** Dispatch and Schedule organise jobs, dates, assignments and job events.
Projects hold drawings and CAD content. Team Chat and Notifications keep coordination beside the work.
Time & Expenses record effort; Assets track instruments with calibration and maintenance records.

Instrument calibration, field notes and QA flags are **coming soon** in the project tool area — use the
implemented asset and project records instead.

**3. Keep evidence with the work.** In File Manager you can upload, organise, preview, download,
version, restore or permanently delete according to your permissions. For sensitive material: use
private workspace storage, link the file to its project or job, keep names and descriptions free of
needless confidential detail, run **Verify integrity** to confirm the bytes still match the recorded
SHA-256, and preserve versions per your firm's retention policy. An integrity check detects change
relative to the hash; it does not certify that the survey is correct.

**4. Anchor a hash on Solana.** Connect the wallet you want as the anchor signer with enough SOL on the
selected cluster for the fee. In File Manager open the menu on a file that has a recorded hash, choose
**Anchor hash on Solana**, review the file, network, shortened hash and estimated fee, approve in the
wallet, and wait for confirmation — the attachment tracks pending, anchored or failed plus the
signature. The Memo is `ssv1:<attachment-id>:sha256:<file-digest>`.

Anchoring proves that wallet signed that ID and digest and the cluster confirmed it. It does not prove
authorship, land ownership, coordinate accuracy or legal sufficiency. Never put client names,
coordinates, legal descriptions or secrets in a custom memo.

**Optional full-file anchoring.** Pick **Full file** instead of **Hash only** in the same dialog and
supply a passphrase (the dialog shows the minimum length), review the chunk plan (256 KiB per chunk)
and fee, then approve one Memo transaction. Each chunk is encrypted with a fresh AES-256-GCM key
wrapped under your passphrase, and the chunks plus `manifest.json` are stored privately in workspace
storage. Solana receives one transaction with the file digest, manifest digest and chunk count — not
per-chunk digests and not the bytes. The chunk copies are only as recoverable as your passphrase:
there is no reset and no recovery service, and losing it leaves the original file and the chain record
intact but the copies unrebuildable. Verification downloads, decrypts, re-hashes each chunk against
the manifest and reassembles before offering the file. Anchors created before encryption existed are
labelled **unencrypted (legacy)**. Deleting a record removes private copies only; the Memo stays.

**Earth Observation.** A session is tied to a workspace job. Enter the target coordinate and the
observation extent (AOI) — those two inputs price the credit quote — pick the survey type and launch.
The engine classifies the imagery and the workbench drapes the result over the basemap. A mineral run
screens nine deposit styles (gold, iron ore, nickel and PGM, chromium, copper-zinc-lead, lithium
pegmatite, manganese, bauxite, REE) and lists what this sensor set cannot screen (kimberlite diamonds,
coal, gemstones) rather than scoring them. A system is only **indicated** when its top decile clears
the moderate band and the index varies across the area. **Export map sheet** produces an A4 landscape
vector PDF at the paper's true resolution (up to 320 DPI): graticule in UTM (default) or degrees,
2–12 divisions per axis rounded to a whole metre or degree step, dashed red AOI, markers and a
resolution note when imagery had to be upscaled. No commodity result is a grade, tonnage or economic
assessment.

**5. Invoice and settle.** Confirm delivered work, time, expenses and quote details, then create or
review the invoice. In Billing & Payments pick the rail: **Solana USDC** (verify cluster, recipient,
amount, mint and wallet prompt, and keep the signature) or **Card & mobile money** (a prepaid USD
balance funded by card or mobile money; sandbox in development, not live payment processing). Reconcile the invoice against the confirmed transaction
or provider result. A wallet signature, a pending payment or a sandbox reference is not proof of
settlement.

## 3. SiteSurveyor AI

The assistant streams responses and calls allowlisted tools against real workspace data. Useful
requests: summarise open quotes and overdue invoices; show upcoming jobs and flag missing assignments;
create a contact and confirm the saved record; prepare a quote and read back the total; list CAD layers
and count points by layer; inspect a CAD entity's recorded properties.

It can query allowlisted project, financial, scheduling, asset, marketplace and CAD data; count and
summarise from returned results rather than inventing numbers; create and update allowlisted records
with read-back verification; schedule work through jobs and job events; inspect CAD layers and
entities; and retain history, rolling summaries and selected memory.

Creates and updates may execute immediately — be explicit about the target record and the change.
Permanent deletes need confirmation, so prefer archiving. CAD drafting commands are not available:
the assistant reads drawings but no screen executes commands against one. Always verify coordinates,
datums, units, totals, dates and record IDs; AI output is not a substitute for a licensed surveyor or
independent QA. Prompts and tool context go to the configured AI provider — check your client contract
before submitting restricted information.

## 4. Marketplace

`/market` lists instruments, professionals, firms, open jobs and training, with search, category
filters, maps and detail views. The registry search matches exact records; the **concierge** is for
the other case — you know what the job needs, not what the listing is called ("a total station that
does reflectorless work in Harare"). The concierge is read-only, needs no account, and is limited to 8
messages per visitor per minute, 2,000 characters per message, remembering the last 8 turns.

The cart lives in this browser, so the public market and the dashboard share one basket. Checkout
sends **one request per listing** to each seller and takes no payment; money moves only after a seller
accepts, from that request's payment panel. The order is saved as **pending** before your wallet signs,
so a cancelled transaction still leaves a record; the signature attaches and moves it to
**submitted**; SiteSurveyor verifies the transfer on chain and only then marks it **completed**, paying
the seller's current workspace wallet. If the wallet declines, the order is cancelled and nothing is
charged.

Professionals and firms carry ratings and reviews. Any signed-in workspace member can review — reviews
are not limited to completed work, so treat them as community input. A fresh database ships **Sample**
rows (badged in the registry and in the detail dialog) that belong to a demo workspace and cannot
accept requests or orders.

`/transport` is a planning preview: it routes from coordinates you enter against a sample fleet. No
operator is contacted, nothing is charged, and a confirmed hire lasts only for that browser session.

## 5. Security habits

Use private storage for client evidence and share only through approved access control. Keep recovery
phrases offline and verify every signature request. Use a strong PIN for the built-in wallet and prefer
an reviewed external wallet for high-value funds. Keep devnet wallets and treasury addresses separate
from production. Restrict workspace membership and admin access. Review prompts for confidential data.
Keep originals, hashes, versions, signatures and network labels together. Maintain backups and a
retention policy outside the anchor. Read the [security model](SECURITY.md) before production use.

## 6. Offline and mobile

The app is responsive with PWA caching, offline status and cached-session handling. Live queries, AI
calls, uploads, payment confirmation and anchoring still need the network. An offline-cached screen is
never proof that a remote write or payment completed — reconnect and verify.

## 7. Troubleshooting

**Wallet sign-in does not complete** — confirm the wallet is unlocked, the browser flow is supported,
and a mobile hand-off returned to the same session. If the account is partially configured, finish the
setup form rather than creating a second identity.

**Network mismatch** — check `VITE_SOLANA_CLUSTER` and the RPC endpoint, and make sure signing and
payment use the same cluster. Do not switch to mainnet to clear a devnet warning.

**"Pay with Phantom" is unavailable** — the deployment has no Solana treasury address; the on-chain
action is hidden while `VITE_SOLANA_TREASURY_ADDRESS` is empty. Also check cluster and USDC mint.

**A file cannot be anchored** — it needs a recorded SHA-256 and a funded wallet on the selected
network. If confirmation timed out, inspect the retained signature on the correct cluster before
retrying.

**Integrity verification fails** — the bytes no longer match the digest. Stop distributing the file as
the anchored version, keep the mismatch detail, inspect version and access history, and follow your
evidence-handling procedure.

**AI chat is unavailable** — the deployment needs the `ai-chat` Edge Function or a configured gateway;
the browser holds no NVIDIA key. Admins should check server-side secrets without exposing them.

## 8. Terms

| Term | Meaning |
| --- | --- |
| Web3 | Wallet-based identity, transactions and proofs inside the app |
| SIWS | Sign In With Solana — authentication through a wallet-signed message |
| SHA-256 | Deterministic digest of a file's bytes; changed bytes give a different digest |
| Anchor | A wallet-signed Solana Memo carrying an attachment ID and file digest |
| Devnet | Solana's development network, without production-value assets |
| USDC | The supported SPL stablecoin for Solana payment flows |
| RLS | Supabase Row Level Security policies constraining database access |
| MCP | Model Context Protocol — optional interface exposing SiteSurveyor tools to agent runtimes |

Implementation detail: [DESIGN.md](DESIGN.md). Deployment controls: [SECURITY.md](SECURITY.md).
