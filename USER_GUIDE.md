# SiteSurveyor user guide

**Plan the work. Execute the survey. Preserve the evidence. Settle the job.**

SiteSurveyor is an **Eineva Labs product and open-source initiative**: an AI-powered, Web3-enabled framework for safer digital surveying. It connects daily operations—quotes, projects, crews, CAD, files, time, expenses, invoices, and payments—with Solana wallet identity and optional blockchain proofs of file integrity. Its purpose is to help surveying teams move beyond paper field books and disconnected tools without overlooking cybersecurity.

> **Privacy by default:** your original survey files stay in Supabase Storage; when you use standard hash-only anchoring, only the attachment ID and SHA-256 hash are written to Solana. A separate full-file on-chain storage model may be offered by a deployment as an explicit opt-in; it is not the default and is not implemented in the current web client.

This guide describes the implemented responsive React web application. The native platform targets are **.NET for desktop** and **Java Android SDK for mobile**, but those clients are not implemented in the repository yet. Personal and business workspaces expose slightly different navigation, and platform operators have additional administration views.

## 1. Getting started

### Choose an account type

- **Personal:** an independent surveyor managing their own work, finances, files, contacts, and professional activity.
- **Business:** a surveying firm coordinating quotes, projects, dispatch, staff, assets, billing, and marketplace activity.
- **Platform operator:** an administrative account for platform-level users, workspaces, activity, and audit functions. This is not required for normal surveying work.

### Sign in with a Solana wallet

1. Open the SiteSurveyor sign-in page.
2. Choose the available wallet flow for your device.
3. Review the Sign In With Solana message in your wallet. A signature proves control of the wallet; it is not a payment.
4. Complete the requested profile details and any finish-setup step.
5. Confirm that you enter the intended personal or business workspace.

Desktop sign-in is designed around Phantom-compatible wallet behaviour. Mobile flows support Solflare hand-off. Available options depend on the browser, wallet, and deployment configuration.

> Never share a seed phrase or private key to sign in. SiteSurveyor sign-in asks for a signature, not your recovery phrase.

### Development networks

Development deployments normally use **Solana devnet**. Devnet SOL and USDC have no production monetary value, and devnet anchors should not be presented as production evidence. Check the network shown in the app and wallet before approving any transaction.

## 2. A typical project workflow

### Step 1 — Plan and price

1. Create or select a **contact** for the client.
2. Prepare a **quote** with its line items, rates, taxes, and notes.
3. Create a **project** to group the operational record, drawings, files, and settings.
4. Review the **dashboard** for current work and financial status.
5. Identify required **assets** and team members. Business workspaces can assign and coordinate crew resources.

You can ask SiteSurveyor AI to summarise existing records or help create allowed projects, contacts, quotes, jobs, invoices, and assets. Review names, dates, quantities, rates, and coordinates before relying on the result.

### Step 2 — Prepare and execute

- Use **Dispatch** and **Schedule** to organise jobs, dates, assignments, and job events.
- Use **Projects** to work with project drawings and CAD content.
- Use **Team Chat** and **Notifications** to keep coordination beside the work.
- Record **Time & Expenses** against the relevant activity.
- Track instruments and equipment in **Assets**, including available calibration and maintenance records.

Instrument calibration, field-notes, and QA-flag cards inside the project tool area are currently marked **coming soon**. Use the implemented asset and project records for current workflows rather than treating those cards as completed tools.

### Step 3 — Keep evidence with the work

Use the **File Manager** to upload, organise, preview, download, version, restore, or permanently remove files according to your permissions.

For sensitive material:

1. Select private workspace storage rather than a public bucket.
2. Link the file to the correct project, quote, job, or other record where that option is available.
3. Keep file names and descriptions free of unnecessary confidential information.
4. Use **Verify integrity** on a hashed file to check that its current bytes still match the recorded SHA-256 digest.
5. Preserve the original file and its version history according to your firm's retention policy.

A successful integrity check detects changes relative to the recorded hash. It does not certify that the survey itself is correct.

### Step 4 — Anchor a file hash on Solana

Anchoring adds a public, tamper-evident reference for a file version without publishing the file itself.

1. Connect or unlock the wallet you want to use as the anchor signer.
2. Ensure the wallet has enough SOL on the **selected cluster** to pay the network fee.
3. In File Manager, open the menu for a file that has a recorded content hash.
4. Choose **Anchor hash on Solana**.
5. Review the file, network, shortened hash, and estimated fee.
6. Approve the transaction in your wallet.
7. Wait for confirmation. The attachment record tracks pending, anchored, or failed status and retains the transaction signature.
8. Open the Solana Explorer link to inspect the transaction on the recorded network.

The Memo has this versioned form:

```text
ssv1:<attachment-id>:sha256:<lowercase-file-digest>
```

**What anchoring proves:** the connected wallet signed a transaction containing that attachment ID and digest, and Solana confirmed it on the named cluster.

**What it does not prove:** who authored the file, who owns the land, whether coordinates are accurate, or whether the document satisfies a legal or regulatory requirement.

> Solana transactions are public and effectively permanent. Never place client names, coordinates, legal descriptions, secrets, or other sensitive text in a custom on-chain memo. The built-in flow only includes the attachment ID and digest.

### Optional full-file blockchain storage

The product framework also defines a separate full-file storage model for deployments that explicitly offer it. In clearer terms, **the file is divided into ordered, verifiable data chunks and committed across multiple Solana transactions**, rather than being uploaded as one large transaction. A manifest records how those chunks fit together and links them to the complete-file integrity record so the payload can be reassembled and verified.

This mode has a fundamentally different privacy and cost profile from hash-only anchoring:

- It must be an explicit user choice, never a silent default.
- Sensitive files must be encrypted before they are chunked or committed on-chain.
- Encryption keys require an approved recovery and access-control process; deleting a database record cannot erase the on-chain chunks.
- Users must understand network fees, public permanence, reassembly requirements, and any legal or client restrictions before uploading.

**Current status:** the repository implements hash-only anchoring. Chunked full-file storage is a product direction and is not available in the current web client, so the steps above are design guidance rather than an operating procedure for a shipped feature.

### Step 5 — Invoice and settle

1. Confirm delivered work, time, expenses, and quote details.
2. Create or review the **invoice** and its line items.
3. Open **Billing & Payments** and choose the appropriate rail.
4. For **Solana USDC**, verify the cluster, recipient, amount, mint, and wallet prompt before signing. Preserve the transaction signature.
5. For **PesePay**, follow the separate fiat flow. Development deployments use sandbox behaviour and must not be treated as live payment processing.
6. Reconcile the final invoice and payment status against the confirmed transaction or provider result.

Solana and fiat are different settlement paths. Do not treat a wallet signature, a pending payment, or a sandbox reference as proof of final settlement.

## 3. Working with SiteSurveyor AI

Open **SiteSurveyor AI** from the workspace navigation. The assistant streams responses and can use allowlisted tools against real workspace data.

### Useful requests

- “Summarise open quotes and overdue invoices in this workspace.”
- “Show upcoming survey jobs and flag any missing assignments.”
- “Create a contact using these details, then confirm the saved record.”
- “Prepare a quote from the line items I provide and read back the total.”
- “List the layers in this project's CAD drawing and count points by layer.”
- “Inspect this CAD entity and report its recorded properties.”
- “Draw the coordinates I provide on the CONTROL layer, then zoom to extents.”

### What the assistant can do

- Query allowlisted project, financial, scheduling, asset, marketplace, and CAD data.
- Count and summarise records using returned tool results rather than inventing numbers.
- Create and update allowlisted operational records, with read-back verification after writes.
- Schedule work through job and job-event workflows.
- Inspect CAD layers and entities and prepare CAD commands for you to execute.
- Retain conversation history, rolling summaries, and selected durable memory.

### Safety and professional review

- Creates and updates may execute immediately; make the target record and requested change explicit.
- Permanent deletes require explicit confirmation. Prefer archiving or another reversible action where appropriate.
- CAD commands appear in a block for you to execute. CAD erase operations require an additional confirmation flow, and batches support undo in the project workspace.
- Always verify coordinates, datums, units, totals, dates, and record IDs. AI output is not a substitute for a licensed surveyor's review or an independent QA check.
- Prompts and relevant tool context are processed by the configured AI provider. Follow your client contract and organisational policy before submitting restricted information.

## 4. Marketplace and professional network

The public market and workspace network surfaces support discovery of:

- Instruments and related products or services.
- Surveying professionals and firms.
- Open jobs and professional opportunities.
- Training and market events.

Use search, category filters, maps, and listing details to compare options. Workspace data can feed market activity so that supply and demand remain connected to delivery.

Sample or synthetic marketplace, chart, ticker, index, and portfolio content is demonstration material. Verify real counterparties, prices, availability, credentials, and terms independently.

## 5. Security habits for surveying teams

Survey evidence can reveal property boundaries, infrastructure, client identity, precise coordinates, and commercially sensitive plans. Use these practices together; no single feature is sufficient.

- Use private storage for client evidence and share only through approved access controls.
- Keep wallet recovery phrases offline and verify every signature request.
- Use strong, unique PINs for the built-in wallet and prefer an appropriately reviewed external wallet for high-value funds.
- Separate development/devnet wallets and treasury addresses from production ones.
- Restrict workspace membership and administrative access to people who need it.
- Review AI prompts for confidential data before sending them.
- Keep original evidence, hashes, versions, transaction signatures, and network labels together.
- Maintain backups and a retention/deletion policy outside the blockchain anchor.
- Review the [security model](SECURITY.md) before production use.

## 6. Offline and mobile expectations

The application is responsive and includes PWA caching plus offline-status and cached-session handling. Live workspace queries, AI calls, uploads, payment confirmation, and Solana anchoring still require network access.

Do not assume that an offline-cached screen proves that a remote write or payment completed. Reconnect and verify the saved record or transaction.

## 7. Troubleshooting

### Wallet sign-in does not complete

Confirm that the wallet is unlocked, the browser flow is supported, and any mobile hand-off returned to the same SiteSurveyor session. If the account is only partially configured, complete the finish-setup form rather than creating a second identity.

### The wallet reports a network mismatch

Check `VITE_SOLANA_CLUSTER` and the RPC endpoint in the deployment configuration. Ensure the signing and payment flow uses the same cluster. Do not switch to mainnet merely to clear a development-network warning.

### “Pay with Phantom” is unavailable

The deployment needs a Solana treasury address. The on-chain payment action is intentionally hidden when `VITE_SOLANA_TREASURY_ADDRESS` is empty. Also check the selected cluster and USDC mint.

### A file cannot be anchored

The file needs a recorded SHA-256 content hash and a connected wallet with enough SOL for the selected network's fee. If a transaction was submitted but confirmation timed out, inspect the retained signature on the correct cluster before trying again.

### Integrity verification fails

The downloaded bytes no longer match the recorded digest. Stop distributing the file as the anchored version, preserve the mismatch details, inspect version history and access records, and follow your firm's evidence-handling procedure.

### AI chat is unavailable

The deployment needs the `ai-chat` Edge Function or a configured self-hosted gateway. The browser does not hold the NVIDIA key. Administrators should check server-side secrets and model entitlement without exposing them to the frontend.

## 8. Key terms

| Term | Meaning in SiteSurveyor |
| --- | --- |
| **Web3** | Wallet-based identity, transactions, and proofs integrated into the application |
| **SIWS** | Sign In With Solana: authentication through a wallet-signed message |
| **SHA-256 hash** | A deterministic digest of a file's bytes; a changed file produces a different digest |
| **Anchor** | A wallet-signed Solana Memo transaction containing an attachment ID and file digest |
| **Devnet** | Solana's development network for testing without production-value assets |
| **USDC** | The supported SPL stablecoin for Solana payment flows |
| **RLS** | Supabase Row Level Security policies used to constrain permitted database access |
| **MCP** | Model Context Protocol, an optional interface exposing SiteSurveyor tools to compatible agent runtimes |

For implementation details, see [System architecture & design](DESIGN.md). For deployment controls and limitations, see [Security model](SECURITY.md).
