# Authentication

One account, three ways in: **email**, **GitHub**, and a **crypto wallet**. All
three resolve to the same Supabase Auth user, so profiles, files, AI credits,
purchased storage and transaction history keep working exactly as before —
nothing is migrated or re-keyed.

- Sign-in with an email address and password, or register and confirm by email.
- Sign in with GitHub (OAuth).
- Sign in with an Ethereum wallet (EIP-4361 / SIWE) or a Solana wallet
  (SIWS, the original wallet login). **Private keys never leave the wallet and
  are never stored anywhere in this repo.**
- From **Account → Security** a signed-in user can link or unlink the other
  methods, with a guard that always keeps at least one way back in.

---

## 1. Routes and screens

| Route | Screen | Purpose |
| --- | --- | --- |
| `/login` | `pages/auth/SignInPage.tsx` | Email + password sign-in, GitHub, wallet entry point |
| `/signup` | `pages/auth/SignUpPage.tsx` | Registration (name, account type, company, email, password) |
| `/forgot-password` | `pages/auth/ForgotPasswordPage.tsx` | Requests a reset link |
| `/reset-password` | `pages/auth/ResetPasswordPage.tsx` | Sets a new password from the emailed link |
| `/verify-email` | `pages/auth/VerifyEmailPage.tsx` | Confirmation pending / resend |
| `/auth/callback` | `pages/auth/AuthCallbackPage.tsx` | OAuth + email-link landing, then routes onward |
| `/auth/wallet` | `pages/auth/WalletLoginPage.tsx` | Solana/Ethereum wallet sign-in and sign-up |
| `/account/security` | `pages/auth/AccountSecurityPage.tsx` | Protected. Method list, link/unlink dialogs |

All screens share `components/auth/AuthShell.tsx` (animated backdrop, brand
block, theme toggle, card column) plus `components/auth/GitHubButton.tsx` and
`components/auth/AccountSecurity.tsx`.

## 2. How a sign-in completes

Every path runs the same two steps before the router is allowed to move:

1. **Authenticate** with Supabase Auth (`signInWithPassword`,
   `signInWithOAuth`, `signInWithEthereum` / `signInWithSolana`, …).
2. **Provision** with `lib/auth/provisioning.ts` → `ensureAccountProvisioned`.
   `mapAppUserToUiUser` refuses a session that has no `full_name`, `email`,
   `auth_signup_account_type` or workspace, so this step guarantees all four
   exist. It is idempotent, only *fills* empty profile columns (an existing
   value is never overwritten with empty metadata), mirrors into
   `user_metadata` only when something is actually missing (an unconditional
   `updateUser` would emit `USER_UPDATED` and double every login), and calls
   `create_business_workspace` only for business accounts that have no
   workspace yet. Personal workspaces are created by a database trigger when
   the profile row lands — there is no `create_personal_workspace` RPC.

Blockers are typed, not parsed:

| Blocker | Meaning | UI answer |
| --- | --- | --- |
| `EMAIL_REQUIRED` | No address on the session (GitHub "keep my email private") | Ask the user to add an email |
| `DETAILS_REQUIRED` | Brand-new account with no name on record | Ask for name/details |
| `PROFILE_UNREADABLE` | Profile write failed | Retry / support message |

## 3. Data model

Migration: `supabase/migrations/20261103180000_unified_auth_methods.sql`

Everything is `SECURITY DEFINER` and callable by `service_role` only — the
browser never touches these tables directly.

| Object | Purpose |
| --- | --- |
| `linked_wallets` | Wallet addresses linked to a user (chain, address, label) |
| `auth_nonces` | Single-use SIWE/SIWS challenges (`purpose`, `expires_at`, `consumed_at`) |
| `prune_auth_nonces()` | Removes expired rows |
| `sync_auth_providers()` | Keeps `linked_wallets` in step with `auth.identities` |
| `link_web3_identity()` / `unlink_web3_identity()` | Add/remove a `web3` identity |
| `link_email_identity()` / `unlink_email_signin()` | Add/remove the `email` identity row |
| `remaining_signin_methods(user_id)` | Server-side last-method guard |

The **method list shown in the UI comes from `user.identities`**
(`email`, `github`, `web3:<chain>:<address>`), not from a local table — that
is the same source Supabase Auth uses to decide what can sign in.

## 4. Edge function `web3-auth`

`supabase/functions/web3-auth/index.ts`, `verify_jwt = false` (it validates
the caller's bearer token itself and rate-limits per IP).

| Action | Caller | Notes |
| --- | --- | --- |
| `nonce` | anonymous | Issues a single-use challenge (`siwe_link` / `siws_link`) |
| `consume` | anonymous | Atomic consume; returns the payload used for unlink proof |
| `link` | signed-in | Verifies the signature, then links the wallet identity |
| `unlink` | signed-in | Requires a fresh proof: `nonce` → sign → `consume` → `unlink` (valid 5 min) |
| `link_email` | signed-in | Confirms the new address, then creates the `email` identity |
| `unlink_email` | signed-in | Removes the `email` identity, guarded by `remaining_signin_methods` |

SIWE/SIWS policy order (all must pass): parse message → `domain` matches the
URI host → `allowedDomains` (localhost bypassed) → `allowedOrigins` exact match
→ `issuedAt` / `expiration` / `notBefore` skew (±60 s, max validity 5 min).

Shared code lives in `supabase/functions/_shared/` (`siwe.ts`,
`web3-verify.ts`, `rate_limit.ts`, `supabase.ts`).

## 5. Client libraries

| Module | Responsibility |
| --- | --- |
| `lib/auth/email-auth.ts` | Sign-up, sign-in, reset, set/change password, verify, resend, add-email-and-password |
| `lib/auth/oauth.ts` | GitHub sign-in / link / unlink (`linkIdentity`, `unlinkIdentity`), identity helpers |
| `lib/auth/web3-auth.ts` | `Web3AuthError` + stable codes, the six edge actions, SIWE sign-in |
| `lib/auth/ethereum-wallet.ts` | EIP-6963 provider discovery, `personal_sign`, chain id, rejection detection |
| `lib/auth/siwe.ts` | Byte-compatible EIP-4361 message builder |
| `lib/auth/provisioning.ts` | The step described in §2 |
| `lib/auth/methods.ts` | `buildMethodList`, `loadSignInMethods`, link/unlink wrappers |
| `lib/auth/auth-errors.ts` | `formatAuthUserFacingError`, including every `web3-auth` error code |

Password policy: sign-in accepts any non-empty password (existing accounts with
short passwords must not be locked out); sign-up and password reset require at
least 8 characters with a letter — stricter than the hosted
`minimum_password_length = 6`, so both agree.

## 6. Security properties

| Threat | Defence |
| --- | --- |
| Replay of a wallet challenge | Nonces are single-use and consumed atomically in the database; 5-minute expiry; signature payload is bound to the nonce |
| Forged SIWE message | Signature verified server-side (EIP-191 / secp256k1 recovery) in the edge function, never in the browser |
| Wrong site signing a message | `domain` ↔ URI host, `allowedDomains`, `allowedOrigins` exact match, time-window checks |
| Account takeover by unlinking the last method | `remaining_signin_methods()` runs server-side; the UI's `removable` flag is only a hint |
| Unauthorized link/unlink | Edge function requires a valid bearer token; link/unlink actions reject anonymous callers |
| Wallet unlink without ownership proof | Fresh nonce → sign → `consume` → `unlink` chain, valid 5 minutes |
| Credential leakage | No private keys, no secrets in the bundle; service-role key only inside edge functions |
| Email enumeration / abuse | GoTrue rate limits (`sign_in_sign_ups`, `email_sent`, `web3`) plus per-IP limits in the edge function |

## 7. Configuration you must supply

Nothing below is committed to the repo. Missing items are called out in §8.

### 7.1 Web app (`apps/web/.env`)

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-or-publishable-key>
```

### 7.2 Local stack (`supabase/config.toml`, already committed)

- `site_url = "http://localhost:5174"` and `additional_redirect_urls`
  including `http://localhost:5174/*`.
  **Must be `localhost`, not `127.0.0.1`**: GoTrue rejects non-HTTPS SIWE URIs
  unless the hostname is exactly `localhost`.
- `[auth.email] enable_confirmations = true`
- `enable_manual_linking = true` (required by `linkIdentity` / `unlinkIdentity`)
- `[auth.web3.solana] enabled = true`, `[auth.web3.ethereum] enabled = true`
- `[auth.external.github] enabled = false` locally — flip to `true` once the
  OAuth app exists, with:
  ```bash
  SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID=...
  SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET=...
  ```
- `[functions.web3-auth] verify_jwt = false`

### 7.3 GitHub OAuth app

1. <https://github.com/settings/applications/new>
   - **Homepage URL**: the deployed app origin, e.g.
     `https://<your-app>.onrender.com`
   - **Authorization callback URL**: `<origin>/auth/callback`
     (e.g. `https://<your-app>.onrender.com/auth/callback`)
2. Copy the **Client ID** and generate a **Client secret**.
3. Supabase dashboard → **Authentication → Providers → GitHub** → enable,
   paste both values.
4. Supabase dashboard → **Authentication → URL Configuration** →
   **Redirect URLs** → add `<origin>/auth/callback`.

### 7.4 Supabase dashboard (hosted project)

| Setting | Where | Value |
| --- | --- | --- |
| Site URL | Authentication → URL Configuration | The deployed web origin |
| Redirect URLs | Authentication → URL Configuration | `<origin>/auth/callback`, `<origin>/reset-password`, `<origin>/verify-email`, `<origin>/*` |
| Confirm email | Authentication → Providers → Email | **On** (sign-up returns a pending user, not a session) |
| Manual linking | Authentication → Settings | **Enabled** |
| Web3 Ethereum | Authentication → Providers → Web3 | **Enabled** |
| Web3 Solana | Authentication → Providers → Web3 | **Enabled** |
| GitHub | Authentication → Providers → GitHub | **Enabled** (after §7.3) |
| SMTP | Authentication → Email SMTP | A real provider — without it, confirmation and reset mail never arrive |

### 7.5 Edge function secrets

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
injected by Supabase automatically (the code also accepts
`SUPABASE_SECRET_KEY` / `SUPABASE_PUBLISHABLE_KEY` for projects that disabled
legacy keys). Set these yourself:

```bash
supabase secrets set \
  AUTH_ALLOWED_ORIGINS="http://localhost:5174,https://<your-app>.onrender.com" \
  AUTH_MESSAGE_MAX_VALIDITY_MS=300000   # optional, defaults to 5 minutes
```

`AUTH_ALLOWED_ORIGINS` is the comma-separated exact-origin allow-list for
SIWE/SIWS `allowedOrigins`.

### 7.6 Deploy

```bash
supabase db push                                   # apply the migration
supabase functions deploy web3-auth                # the link/unlink/nonce function
npm --prefix apps/web run build                    # the web app
```

## 8. What is not verifiable from this repo alone

| Missing | Blocks |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` (not present anywhere in the repo) | Live `web3-auth` calls, the RPCs, the nonce table |
| GitHub OAuth app client ID + secret | GitHub sign-in and link/unlink |
| Docker / local Supabase stack | Running migrations and functions locally |
| Hosted project toggles | On `csjjmuexzuewqnopzbik` today: Ethereum Web3 provider disabled (`422 web3_provider_disabled`), GitHub disabled (`400 Unsupported provider`), `mailer_autoconfirm: true` (sign-up returns a session without confirmation) |

Fix each row in §7 and the flows go live with no code change.

## 9. Tests

```bash
npm --prefix apps/web run typecheck        # tsc -b --noEmit
npm --prefix apps/web run test             # vitest (auth unit + page tests)
deno test supabase/functions/_shared/      # SIWE parsing, signature verification
npm run typecheck && npm test              # repo-wide
```

Auth coverage lives in `src/lib/auth/*.test.ts` (provisioning, method list),
`src/components/auth/AuthShell.test.tsx` and `src/pages/auth/*.test.tsx`.

---

## 10. Satellite Survey Engine Authentication

The Python engine (`apps/engine`) runs as a **background worker** with no user-facing authentication. It uses:

| Credential | Purpose | Scope |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Claims `survey_runs`, writes deliverables, updates job status | Full admin access to `survey_runs`, `survey_deliverables`, `jobs` (restricted by migration grants) |
| `DE_AFRICA_TOKEN` | Accesses DE Africa WCS 2.1.0 endpoints for satellite rasters | Read-only external API |
| `SITESURVEYOR_STATE_DIR` | Local disk for cached rasters and outputs | Local filesystem |

The worker runs `FOR UPDATE SKIP LOCKED` on `survey_runs` to claim jobs, processes them, and publishes results back. It does not interact with Supabase Auth, user sessions, or wallet identities. The MCP server (`python -m src.mcp_server`) exposes the same tools over stdio/SSE for AI agents and uses the same `SUPABASE_SERVICE_ROLE_KEY` + `DE_AFRICA_TOKEN` configuration.
