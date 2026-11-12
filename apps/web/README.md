# SiteSurveyor web app

The implemented client: a responsive React 19 + TypeScript SPA/PWA for personal, business and
platform-operator workspaces — wallet-native sign-in, surveying operations, project workflows, file
integrity and Solana anchoring, AI chat, assets, finance, the public market (search, concierge, cart,
verified checkout), a transport-hire preview and administration surfaces. There is no CAD drawing
canvas here: drawings are readable through the API and the AI tools, not editable.

Workflows: [user guide](../../USER_GUIDE.md). Boundaries: [design](../../DESIGN.md),
[security](../../SECURITY.md).

## Setup

Requires Node 22+ and a Supabase project with this schema applied. The dev server runs on **port
5174** and listens on the local network for phone testing.

```bash
npm --prefix apps/web install
cp apps/web/.env.example apps/web/.env   # then edit .env
npm run dev                              # from the repository root
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Required | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Required | Browser-safe anon or publishable key |
| `VITE_SOLANA_CLUSTER` | `devnet` | `devnet`, `testnet` or `mainnet-beta` |
| `VITE_SOLANA_RPC_URL` | Cluster public RPC | Optional custom RPC |
| `VITE_SOLANA_USDC_MINT` | Built-in cluster default | Optional SPL USDC mint override |
| `VITE_SOLANA_TREASURY_ADDRESS` | Empty | Solana payment actions stay hidden until this is set |
| `VITE_ENABLE_PLATFORM_ADMIN_SIGNUP` | Hidden | Set `true` only when the admin signup card is intended |

Every `VITE_*` value is public in the compiled bundle. Never put a service-role key, NVIDIA key,
PesePay secret, seed phrase, private key or wallet PIN in `.env`. AI models are configured in the Edge
Function or the optional [AI gateway](../../ai-gateway/README.md), never with a frontend key.

## Commands

`npm run dev` (Vite on 5174) · `npm run typecheck` · `npm run lint` · `npm test` · `npm run build`
(type-check + bundle to `dist/`) · `npm run preview`. All are available from the repository root too.

## Source map

```text
src/
├── components/     # shared UI, layout, files, finance, market, workspace
├── config/  context/  hooks/  styles/
├── features/
│   ├── admin/  ai/  settings/  workspace/   # cross-cutting: admin nav, AI, settings, access
│   ├── personal/  business/  platform/      # one shell + view registry per workspace scope
│   ├── projects/                            # project dashboard, settings, files, tool registry
│   └── phantom/  web3/                      # wallets, payments, anchors, market data
├── lib/
│   ├── auth/            # SIWS, sessions, provisioning, cached identity
│   ├── repositories/    # Supabase domain data access
│   ├── supabase/        # client + generated types
│   └── localDb/
├── pages/          # auth, public, shared, personal, business, admin
├── App.tsx         # auth state and top-level routes
└── main.tsx        # bootstrap and polyfills
```

`apps/desktop` is a Tauri (Rust) shell that packages this web frontend as a native window;
`apps/mobile` and `apps/live` remain placeholders. This package is the shared frontend.
`apps/engine` is a backend worker. The desktop shell skips the service worker and sends external
links to the system browser. Auth redirects in the desktop shell come back through the bridge pages
in `public/auth/`, which ship with this app — see the [desktop shell guide](../desktop/README.md).

## Implementation contracts

**Wallet and cluster.** `src/features/phantom/lib/config.ts` resolves cluster, RPC, mint, treasury and
Explorer URLs — keep them consistent, and read every signature or Explorer link on its recorded
cluster.

**Anchoring.** `anchor/fileAnchor.ts` writes only the versioned attachment ID and SHA-256 digest to
Memo Program v3. `anchor/fullFileAnchor.ts` is the second mode: 256 KiB chunks encrypted with
AES-256-GCM (`chunkCrypto.ts`, key wrapped by the user's passphrase) and stored with `manifest.json`
under `<workspace-id>/anchors/<operation-id>/`, with one Memo carrying file digest, manifest digest and
chunk count. Original files stay in Supabase Storage in both modes — neither writes bytes on chain.

**Data access.** Repository modules scope records by workspace and use the authenticated client.
Client-side filtering never replaces RLS or Storage authorization.

**AI.** The frontend calls the authenticated endpoint and consumes NDJSON `status`, `tool`, `delta`,
`final` and `error` events. It must not import the privileged agent runtime or hold provider secrets.

**Coming-soon tools.** `features/projects/tools/toolRegistry.ts` lists unimplemented tools. Keep their
`soon` behaviour until a real workflow exists; do not make a card look operational by changing copy.

**Market sample media.** Seed photographs must depict the item — a wrong picture teaches users to
distrust the listing. Item media lives in the `asset-media` bucket under the seed workspace prefix
`e0000000-0000-4000-8000-000000000001/`, with byte-identical local copies in `public/images/market/**`
so the demo renders when Storage is unavailable; keep the two in step. `ATTRIBUTIONS.json` records
source, author, licence, page and dimensions for every licensed image, and visible attribution is
required for CC BY and CC BY-SA. Items with no honest photograph carry no media path and fall back to
the category placeholder (`src/components/market/marketPlaceholders.ts`) — clearing the path is the
correct fix.

## Styling and accessibility

Use the existing shadcn/Radix primitives, Tailwind tokens and shadcn-admin layout language, with
SiteSurveyor red `#d92d20` as the accent rather than a competing theme. Maintain keyboard operation,
visible focus, labels, field-linked errors and 390 px layouts, and name actions and recovery clearly in
wallet, network, upload and payment errors. Product and brand contract: [PRODUCT.md](../../PRODUCT.md).

## Testing, PWA and build

Vitest + jsdom + Testing Library, with `pool: 'vmThreads'` for the Vite 8/Vitest combination; Solana
tests resolve the browser ESM build and shim `rpc-websockets` so no live subscription opens. Web
Crypto, storage, downloads, wallet providers and responsive APIs may need explicit mocks. A passing
jsdom test does not prove wallet signing, cluster confirmation, Storage policy or cross-browser layout —
verify those separately on devnet with non-production data.

The PWA auto-updates the shell and caches static assets and selected public images and Storage
objects; authenticated Supabase REST responses are `NetworkOnly`. Offline status and cached sessions
add resilience but do not make live data, AI, uploads or transactions offline-capable.

`npm run build` writes `dist/`. The host must rewrite SPA routes to `index.html` — see `nginx.conf` and
`render.yaml`. Build-time `VITE_*` values become part of the public bundle: review deployment defaults
before release.
