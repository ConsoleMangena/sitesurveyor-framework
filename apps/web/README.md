# SiteSurveyor web app

The implemented web client for **SiteSurveyor, an Eineva Labs product and open-source initiative**: a responsive React 19 + TypeScript single-page application and PWA for personal, business, and platform-operator workspaces.

It includes wallet-native authentication, surveying operations, project workflows, file integrity and Solana anchoring, AI chat, assets, finance, the public marketplace (search, AI concierge, cart and checkout, on-chain verified payment), a transport-hire planning preview, and administration surfaces. There is no CAD drawing canvas in this client: drawings are readable through the API and the AI tools, not editable here. The broader platform targets .NET for desktop and Java Android SDK for mobile; those native clients are not implemented yet.

For product workflows see the [Surveyor user guide](../../USER_GUIDE.md). For system boundaries see [Architecture](../../DESIGN.md) and [Security](../../SECURITY.md).

## Prerequisites

- Node.js 22 and npm.
- A Supabase project configured with the SiteSurveyor schema.
- Optional Solana wallet and NVIDIA-backed AI Edge Function for those integrations.

The development server runs on **port 5174** and listens on the local network for mobile-web testing.

## Setup

From the repository root:

```bash
npm --prefix apps/web install
cp apps/web/.env.example apps/web/.env
npm run dev
```

Or work directly in this directory:

```bash
npm install
npm run dev
```

Edit `.env` before expecting Supabase or Solana functionality to work.

## Configuration

| Variable | Default/requirement | Description |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Required | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Required | Browser-safe anon or publishable key |
| `VITE_SOLANA_CLUSTER` | `devnet` | `devnet`, `testnet`, or `mainnet-beta` |
| `VITE_SOLANA_RPC_URL` | Selected cluster's public RPC | Optional custom RPC endpoint |
| `VITE_SOLANA_USDC_MINT` | Built-in cluster default | Optional SPL USDC mint override |
| `VITE_SOLANA_TREASURY_ADDRESS` | Empty | Enables Solana payment actions when set to the intended recipient |
| `VITE_ENABLE_PLATFORM_ADMIN_SIGNUP` | Hidden | Set to `true` only when the platform-admin signup card is intended |

All `VITE_*` variables are public in the compiled JavaScript. Never put a Supabase service-role key, NVIDIA key, PesePay secret, seed phrase, private key, or wallet PIN in `.env` or another frontend variable.

AI chat is configured in Supabase Edge Functions or the optional [AI gateway](../../ai-gateway/README.md), not through a frontend model key.

## Commands

Run from `apps/web` unless noted:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite on port 5174 |
| `npm run typecheck` | Run TypeScript project checks without emitting output |
| `npm run lint` | Run ESLint across the app |
| `npm test` | Run the Vitest suite once |
| `npm run build` | Type-check and build the production bundle |
| `npm run preview` | Serve the production build locally |

From the repository root, equivalent common checks are `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.

## Source map

```text
src/
├── assets/                 # Imported visual assets
├── components/             # Shared UI, layout, files, finance, market, and workspace components
├── config/                 # Frontend configuration
├── context/                # React context providers
├── features/
│   ├── admin/              # Shared platform-administration navigation and behaviour
│   ├── ai/                 # AI workspace functionality
│   ├── personal/           # Personal workspace shell, navigation, and views
│   ├── business/           # Business workspace shell, navigation, and views
│   ├── platform/           # Platform-operator workspace
│   ├── projects/           # Project dashboard, settings, files, and tool registry
│   ├── phantom/            # Wallet providers, payments, balances, and file anchors
│   ├── settings/           # Settings features
│   ├── web3/               # Solana market data and Web3 UI
│   └── workspace/          # Shared account types, access, and workspace mapping
├── hooks/                  # Shared React hooks
├── lib/
│   ├── auth/               # SIWS, sessions, account mapping, and cached identity
│   ├── repositories/       # Supabase domain data access
│   ├── supabase/           # Client and generated database types
│   └── localDb/            # Local data support
├── pages/                  # Auth, public, shared, personal, business, and admin pages
├── styles/                 # Styling support
├── App.tsx                 # Authentication state and top-level routes
└── main.tsx                # Browser bootstrap and polyfills
```

The `apps/desktop`, `apps/mobile`, and `apps/live` directories elsewhere in the repository are placeholders. This package is the implemented application. The native targets are **.NET desktop** in `apps/desktop` and **Java Android SDK** in `apps/mobile`; no native shell is currently implemented. The Python satellite survey engine at `apps/engine` is a backend worker service (see its [README](../engine/README.md)).

## Key implementation contracts

### Wallet and cluster behaviour

`src/features/phantom/lib/config.ts` resolves the selected cluster, RPC endpoint, USDC mint, treasury, and Explorer URLs. Keep those values consistent. A signature or Explorer link must always be interpreted on its recorded cluster.

`src/features/phantom/anchor/fileAnchor.ts` writes only the versioned attachment ID and SHA-256 digest to Solana Memo Program v3. `src/features/phantom/anchor/fullFileAnchor.ts` is the second mode: it splits the file into 256 KiB chunks, encrypts each one (`chunkCrypto.ts`, AES-256-GCM under a PBKDF2-SHA-256 key wrapped by the user's passphrase), stores the chunks and `manifest.json` privately under `<workspace-id>/anchors/<operation-id>/`, and writes one Memo carrying the file digest, manifest digest and chunk count. Original files remain in Supabase Storage in both modes — neither writes file bytes on chain.

### Data access

Repository modules scope records by workspace and use the authenticated Supabase client. Preserve server-side RLS and Storage authorization; client filtering is not a substitute for either.

### AI

The frontend calls the authenticated AI endpoint and consumes NDJSON status, tool, delta, final, and error events. It must not import the privileged shared agent runtime or hold provider/service-role secrets.

### Coming-soon tools

`src/features/projects/tools/toolRegistry.ts` explicitly lists unimplemented project tools. Keep their `soon` behaviour until a real workflow exists; do not make a card appear operational by changing only its copy.

### Public market sample media

The public market seed shows surveying equipment, jobs, firms, and events. Every photograph attached to a seed item has to depict that item, because a wrong picture teaches users to distrust the listing rather than the demo.

- Item media lives in the `asset-media` Storage bucket under the seed workspace prefix `e0000000-0000-4000-8000-000000000001/`. `public/images/market/**` holds byte-identical local copies so the demo still renders when Storage is unavailable; keep the two in step when a seed image changes.
- `public/images/market/ATTRIBUTIONS.json` records the source file, author, licence, page URL, and used dimensions for every image sourced under licence. Add a record whenever a seed image is replaced.
- Several seed images are freely licensed photographs from Wikimedia Commons (public domain, CC0, CC BY, and CC BY-SA). Those licences require visible attribution for the CC BY and CC BY-SA files, so the attribution record is part of the seed and is not optional.
- Items with no honest photograph carry no media path and fall back to the category placeholder from `src/components/market/marketPlaceholders.ts`. The Trimble TSC7 and Leica CS20 field controllers, the tablet sunshade bracket, and the drone mapping pilot post are in that state. Clearing a path is the correct fix; attaching an unrelated image is not.

## Styling and accessibility

- Use the existing shadcn/Radix primitives, Tailwind tokens, and shadcn-admin layout language.
- Preserve SiteSurveyor red (`#d92d20`) as the accent rather than introducing a competing theme.
- Keep public-market character while using shared tokens.
- Maintain keyboard operation, visible focus, labels, field-linked errors, and 390 px responsive layouts.
- Name actions and recovery clearly, especially for wallet, network, upload, and payment errors.

See [PRODUCT.md](../../PRODUCT.md) for the product and brand contract.

## Testing

Tests use **Vitest**, **jsdom**, and **Testing Library**.

Notable configuration:

- `pool: 'vmThreads'` supports the current Vite 8/Vitest combination.
- Solana tests resolve the browser ESM build and shim `rpc-websockets`; unit tests do not open live RPC websocket subscriptions.
- Browser APIs such as Web Crypto, storage, file downloads, wallet providers, and responsive layout APIs may require explicit mocks.
- A passing jsdom test does not prove real wallet signing, cluster confirmation, Storage policy, signed-in browser behaviour, or cross-browser layout. Verify those separately in the appropriate environment.

For affected changes, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

Use devnet and non-production data for manual Web3 checks. Do not initiate live PesePay charges from development.

## PWA and caching

The Vite PWA plugin auto-updates the application shell and caches static assets plus selected public image and public Storage responses. Authenticated Supabase REST responses are explicitly `NetworkOnly`.

Offline status and cached sessions improve resilience, but live data, AI, uploads, and blockchain transactions require network access. Do not describe the app as fully offline-capable.

## Production build

```bash
npm run build
```

The output is written to `dist/`. The host must rewrite SPA routes to `index.html`; the repository includes working patterns in `nginx.conf` and `render.yaml`.

Build-time `VITE_*` values become part of the public bundle. Review deployment defaults and generated output before release.
