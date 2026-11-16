# Authentication

One account, three ways in — **email**, **GitHub**, and a **crypto wallet** (Ethereum SIWE or Solana
SIWS). All three resolve to the same Supabase Auth user, so profiles, files, AI credits, storage and
transaction history are never re-keyed. From **Account → Security** a signed-in user links or unlinks
methods, guarded so at least one way back in always remains. Private keys never leave the wallet and
are never stored in this repository.

| Route | Screen | Purpose |
| --- | --- | --- |
| `/login` | `pages/auth/SignInPage.tsx` | Email + password, GitHub, wallet entry |
| `/signup` | `pages/auth/SignUpPage.tsx` | Registration (name, account type, company, email, password) |
| `/forgot-password`, `/reset-password` | `ForgotPasswordPage`, `ResetPasswordPage` | Request and set a new password |
| `/verify-email` | `VerifyEmailPage.tsx` | Confirmation pending / resend |
| `/auth/callback` | `AuthCallbackPage.tsx` | OAuth and email-link landing, then routes onward |
| `/account/security` | `AccountSecurityPage.tsx` | Protected; method list and link/unlink |

All screens share `components/auth/AuthShell.tsx` plus `GitHubButton.tsx` and `AccountSecurity.tsx`.

## 1. How a sign-in completes

Every path runs the same two steps before the router may move:

1. **Authenticate** with Supabase Auth (`signInWithPassword`, `signInWithOAuth`, `signInWithEthereum`,
   `signInWithSolana`).
2. **Provision** via `lib/auth/provisioning.ts` → `ensureAccountProvisioned`. `mapAppUserToUiUser`
   refuses a session without `full_name`, `email`, `auth_signup_account_type` or a workspace, so this
   guarantees all four exist. It is idempotent, only fills empty profile columns (never overwrites a
   value with empty metadata), mirrors into `user_metadata` only when something is missing (an
   unconditional `updateUser` would emit `USER_UPDATED` and double every login), and calls
   `create_business_workspace` only for business accounts with no workspace. Personal workspaces are
   created by a database trigger on the profile row — there is no `create_personal_workspace` RPC.

Blockers are typed, not parsed: `EMAIL_REQUIRED` (no address on the session — e.g. GitHub "keep my
email private"; UI asks for one), `DETAILS_REQUIRED` (brand-new account with no name; UI asks for
details), `PROFILE_UNREADABLE` (profile write failed; retry or support).

## 2. Data model

`supabase/migrations/20261103180000_unified_auth_methods.sql` — everything is `SECURITY DEFINER` and
callable by `service_role` only; the browser never touches these tables directly.

| Object | Purpose |
| --- | --- |
| `linked_wallets` | Wallet addresses linked to a user (chain, address, label) |
| `auth_nonces` | Single-use SIWE/SIWS challenges (`purpose`, `expires_at`, `consumed_at`) |
| `prune_auth_nonces()` | Removes expired rows |
| `sync_auth_providers()` | Keeps `linked_wallets` in step with `auth.identities` |
| `link_web3_identity()` / `unlink_web3_identity()` | Add or remove a `web3` identity |
| `link_email_identity()` / `unlink_email_signin()` | Add or remove the `email` identity row |
| `remaining_signin_methods(user_id)` | Server-side last-method guard |

The method list in the UI comes from `user.identities` (`email`, `github`, `web3:<chain>:<address>`),
not from a local table — the same source Auth uses to decide what can sign in.

## 3. Edge Function `web3-auth`

`supabase/functions/web3-auth/index.ts` with `verify_jwt = false`: it validates the bearer token itself
and rate-limits per IP.

| Action | Caller | Notes |
| --- | --- | --- |
| `nonce` | anonymous | Issues a single-use challenge (`siwe_link` / `siws_link`) |
| `consume` | anonymous | Atomic consume; returns the payload used for unlink proof |
| `link` | signed-in | Verifies the signature, then links the wallet identity |
| `unlink` | signed-in | Needs fresh proof: `nonce` → sign → `consume` → `unlink` (valid 5 min) |
| `link_email`, `unlink_email` | signed-in | Confirm the address, create or remove the `email` identity (guarded) |

SIWE/SIWS policy, all of which must pass: parse → `domain` matches the URI host → `allowedDomains`
(localhost bypassed) → `allowedOrigins` exact match → `issuedAt` / `expiration` / `notBefore` skew
(±60 s, max validity 5 min). Shared code is in `supabase/functions/_shared/` (`siwe.ts`,
`web3-verify.ts`, `rate_limit.ts`, `supabase.ts`).

## 4. Client modules

| Module | Responsibility |
| --- | --- |
| `lib/auth/email-auth.ts` | Sign-up, sign-in, reset, set/change password, verify, resend, add email + password |
| `lib/auth/oauth.ts` | GitHub sign-in / link / unlink (`linkIdentity`, `unlinkIdentity`) |
| `lib/auth/web3-auth.ts` | `Web3AuthError` with stable codes, the six edge actions, SIWE sign-in |
| `lib/auth/ethereum-wallet.ts` | EIP-6963 discovery, `personal_sign`, chain id, rejection detection |
| `lib/auth/siwe.ts` | Byte-compatible EIP-4361 message builder |
| `lib/auth/provisioning.ts`, `methods.ts`, `auth-errors.ts` | Provisioning, method list and link/unlink wrappers, user-facing error formatting |

Password policy: sign-in accepts any non-empty password so existing short-password accounts are not
locked out; sign-up and reset require at least 8 characters including a letter.

### Redirect targets

Every redirect-based flow (GitHub, email confirmation, password reset) ends at one URL. In the browser
that URL is this origin plus the app path — `/auth/callback`, `/reset-password`, `/verify-email`.

In the desktop shell the flow is finished by the **system browser**, which knows nothing about the
app's window, and GoTrue will only redirect that browser to a URL the Supabase project allowlists.
The shell's own origin — `http://tauri.localhost` — is one a browser can never reach, so it cannot be
allowlisted. The browser is therefore sent to a **bridge page on the hosted web build**, and that
page forwards the URL to the app over its registered `sitesurveyor://app` protocol:

```text
app → system browser → GitHub → Supabase → https://sitesurveyor.tech/auth/desktop-callback.html?code=…
    → sitesurveyor://app/auth/callback?code=… → operating system → app → /auth/callback?code=…
```

The bridge lives in `apps/web/public/auth/` and is deployed with the web build. It works because the
web origin is already in the allowlist (`https://sitesurveyor.tech/*`); **no custom-scheme allowlist
entry is needed**. The page copies the query and fragment across verbatim and never reads the code —
the code is only usable with the PKCE verifier held by the desktop window.

| Flow | Browser | Desktop shell |
| --- | --- | --- |
| GitHub sign-in / link | `<origin>/auth/callback` | `<web origin>/auth/desktop-callback.html` → `sitesurveyor://app/auth/callback` |
| Email confirmation | `<origin>/auth/callback` | `<web origin>/auth/desktop-callback.html` → `sitesurveyor://app/auth/callback` |
| Password reset | `<origin>/reset-password` | `<web origin>/auth/desktop-reset.html` → `sitesurveyor://app/reset-password` |

There is one bridge page per flow rather than one page with a destination parameter, so a crafted
link cannot make the bridge forward somewhere unexpected. The web origin comes from
`VITE_PUBLIC_APP_URL` (default `https://sitesurveyor.tech`); `apps/web/src/lib/platform.ts` builds
the targets and `apps/desktop/src-tauri/src/lib.rs` routes the deep links back in.

**Deploy the web app after changing the bridge**, or the browser will land on a 404 instead of
handing the flow back. Setting the site URL to the web origin in the Supabase dashboard is not
enough on its own: GoTrue falls back to the site URL root when a redirect target is not allowlisted,
which loses the callback entirely.

A recovery link sent outside the app — the Supabase dashboard's "Send recovery email", or any direct
`resetPasswordForEmail` call — carries no `redirectTo`, so it lands on the site URL root instead of
`/reset-password`. `components/auth/RecoveryRedirect.tsx` catches that arrival on any route (URL
markers, the buffered session, or the `PASSWORD_RECOVERY` event) and routes it to `/reset-password`,
so those links work without a redirect target. Prefer requesting recovery from `/forgot-password`,
which sets the target explicitly.

## 5. Security properties

| Threat | Defence |
| --- | --- |
| Replay of a wallet challenge | Single-use nonces consumed atomically in the database, 5-minute expiry, signature bound to the nonce |
| Forged SIWE message | Signature verified server-side (EIP-191 / secp256k1 recovery) in the edge function, never in the browser |
| Wrong site signing | `domain` ↔ URI host, `allowedDomains`, exact `allowedOrigins`, time-window checks |
| Takeover by unlinking the last method | `remaining_signin_methods()` runs server-side; the UI flag is only a hint |
| Unauthorized link/unlink | Valid bearer token required; anonymous callers rejected |
| Wallet unlink without ownership proof | Fresh nonce → sign → consume → unlink chain, valid 5 minutes |
| Credential leakage | No private keys or secrets in the bundle; service-role key only inside edge functions |
| Enumeration / abuse | GoTrue rate limits plus per-IP limits in the edge function |

## 6. Configuration

Web app (`apps/web/.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Local stack (`supabase/config.toml`, committed): `site_url = "http://localhost:5174"` with matching
`additional_redirect_urls` — **must be `localhost`, not `127.0.0.1`**, because GoTrue rejects
non-HTTPS SIWE URIs unless the hostname is exactly `localhost`; `enable_confirmations = true`;
`enable_manual_linking = true` (required by `linkIdentity` / `unlinkIdentity`);
`[auth.web3.solana]` and `[auth.web3.ethereum]` enabled; `[functions.web3-auth] verify_jwt = false`.
GitHub stays disabled locally until an OAuth app exists
(`SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID` / `_SECRET`).

Hosted project: enable the Web3 Ethereum and Solana providers, GitHub (callback URL `<origin>/auth/callback`),
manual linking, email confirmation, and a real SMTP provider — without SMTP, confirmation and reset
mail never arrive. Set the site URL and redirect URLs (`/auth/callback`, `/reset-password`,
`/verify-email`, `/*`). The desktop shell needs no entry of its own: it comes back through the bridge
page on this origin, which is covered by `/*`.

### Branded auth email

The 13 HTML templates in `supabase/templates/` cover all six authentication emails and all seven
security notifications. Their inline, table-based styles work in common desktop and mobile email
clients; auth links always use Supabase's `{{ "{{ .ConfirmationURL }}" }}` or `{{ "{{ .Token }}" }}`
variables, so PKCE and desktop-bridge behavior stays unchanged. The logo loads from
`https://sitesurveyor.tech/email-logo.png`, the optimized 12 KB asset in
`apps/web/public/email-logo.png`, which must remain publicly available. Deploy that asset whenever the
email URL or artwork changes.

`supabase/config.toml` declares their subjects and content paths. Apply local edits with
`supabase stop && supabase start`, then inspect the rendered messages in the local email testing
server. For a linked hosted project, preview and deploy with the Supabase CLI:

```sh
supabase config diff
supabase config push
supabase config diff
```

The hosted sender is Titan SMTP (`info@sitesurveyor.tech`) and is intentionally undeclared in the
committed config, so CLI pushes preserve it without requiring its password in the repository.
**Before any full hosted `config push`, reconcile unrelated config differences and export every
referenced provider secret.** In particular, do not overwrite hosted Twilio or pooler settings, and
do not blank `GITHUB_CLIENT_SECRET`. For an email-only deployment, generate a temporary CLI workdir
containing `supabase/config.toml` with only the `[auth.email.template.*]` and
`[auth.email.notification.*]` blocks plus `supabase/templates/`, then run
`supabase config push --workdir <temporary-workdir> --project-ref csjjmuexzuewqnopzbik`.
This is safer than using a full-project push when unrelated hosted settings have drifted. Security
notifications are already enabled in production; the committed blocks retain those existing events
without adding new ones.

Edge function secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically (the code also accepts `SUPABASE_SECRET_KEY` / `SUPABASE_PUBLISHABLE_KEY`). Set
`AUTH_ALLOWED_ORIGINS` (comma-separated exact origins) and optionally
`AUTH_MESSAGE_MAX_VALIDITY_MS` (default 300000).

Deploy: `supabase db push`, `supabase functions deploy web3-auth`, `npm --prefix apps/web run build`.

## 7. Not verifiable from this repository

A `SUPABASE_SERVICE_ROLE_KEY` (absent by design) blocks live `web3-auth` calls, the RPCs and the nonce
table; a GitHub OAuth client ID and secret block GitHub sign-in and linking; hosted project toggles
block the corresponding providers. Fix the configuration above and the flows go live with no code
change.

## 8. Tests

`npm --prefix apps/web run typecheck` · `npm --prefix apps/web run test` (auth unit and page tests in
`src/lib/auth/*.test.ts`, `src/components/auth/AuthShell.test.tsx`, `src/pages/auth/*.test.tsx`) ·
`deno test supabase/functions/_shared/` for SIWE parsing and signature verification.

## 9. Satellite engine

`apps/engine` is a background worker with no user-facing authentication. It claims `survey_runs` with
`FOR UPDATE SKIP LOCKED` using `SUPABASE_SERVICE_ROLE_KEY` (writes deliverables, updates job status,
restricted by migration grants) and `DE_AFRICA_TOKEN` for read-only DE Africa WCS raster access, with
`SITESURVEYOR_STATE_DIR` for cached rasters and outputs. It never touches Auth, sessions or wallet
identities. The MCP server (`python -m src.mcp_server`) exposes the same tools over stdio/SSE with the
same credentials.
