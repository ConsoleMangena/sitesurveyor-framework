# Design: `apps/mobile` — React Native (Expo) client

- **Date:** 2026-10-16
- **Status:** Approved (design), pending spec review
- **Topic:** Add a React Native (Expo) mobile app to the monorepo, replacing the Tauri Android target

## 1. Overview & locked decisions

| Decision | Choice |
| --- | --- |
| Role | Native mobile app that **replaces the Tauri Android target**. Tauri desktop (macOS/Windows/Linux) remains. |
| Scope | "Full parity minus CAD" — every `WORKSPACE_VIEWS` entry except `projects`. |
| Integration | Self-contained `apps/mobile` (own `package.json`, `node_modules`, lockfile), matching the `apps/web` / `apps/desktop` convention. No npm workspaces. Portable domain logic is **mirrored**, not shared. |
| Backend | Unchanged — same hosted Supabase project. Postgres/RLS, Storage, and the `ai-chat` edge function are reused as-is. |
| Build / distribution | EAS Build (cloud) driven by GitHub Actions, replacing the `build-android` job in `release.yml`. |
| Payments | View invoices/billing and "Pay with Phantom" via **deep-link** to the Phantom app; record the tx signature. No native wallet adapter in v1. |

### Current-state findings (context)

- The repo already ships mobile via **Tauri 2's Android target**: `.github/workflows/release.yml` runs `tauri android init` / `tauri android build`, wrapping the web SPA with `VITE_MOBILE_BUILD=true` and `VITE_DISABLE_WASM=true`. This is the path being replaced.
- Root `package.json` has **no npm workspaces**; scripts use `npm --prefix apps/<app>`. Each app owns its own dependencies and lockfile.
- The web data layer is split between Supabase and an **IndexedDB/Dexie** offline DB (`apps/web/src/lib/localDb`). IndexedDB does not exist in React Native, so this layer is not portable.
- Web platform gating lives in `apps/web/src/lib/platform.ts` (`isCadPlatformSupported()` returns false when `VITE_MOBILE_BUILD === 'true'`), and `apps/web/src/components/MobileProjectsPlaceholder.tsx` is the CAD placeholder.
- The web app has no shared-package imports; it uses a `@/` Vite alias into `src/`.

### Verified ecosystem facts (2026-10)

- **Expo SDK 58** is current (React Native 0.88, React 19.3, Node ≥ 22.13). SDK 57 = RN 0.86 / React 19.2.
- `expo/fetch` provides a WinterCG-compliant fetch with `ReadableStream` streaming on native — suitable for the `ai-chat` NDJSON stream.
- **NativeWind v5** (Tailwind CSS v4) is available as `nativewind@5.0.0-rc.0` pairing with `react-native-css@3.1.0-rc.0`, tested with Expo 57 / RN 0.86. It is **RC**, not stable. NativeWind v4 is stable but uses Tailwind 3.
- EAS builds can be triggered non-interactively from CI with the `expo/expo-github-action` and an `EXPO_TOKEN` secret; EAS stores Android keystore/credentials.

## 2. Stack

- **Framework:** Expo SDK 58 (React Native 0.88, React 19.3), TypeScript.
- **Navigation:** Expo Router (file-based).
- **Server state:** TanStack Query v5, persisted to AsyncStorage.
- **Backend client:** `@supabase/supabase-js` v2 (+ `react-native-url-polyfill`).
- **Auth state:** Zustand (mirrors web's `lib/auth/auth-store.ts`).
- **Offline:** `expo-sqlite` outbox + `expo-network`; AsyncStorage for query-cache persistence.
- **Session storage:** `@react-native-async-storage/async-storage` as the Supabase auth storage adapter (see §5). `expo-secure-store` is reserved for future sensitive tokens.
- **Streaming:** `expo/fetch` + `ReadableStream` / `TextDecoder`.
- **Crypto:** `@solana/web3.js` (build tx) + Phantom deep link.
- **Styling:** NativeWind v5 (Tailwind v4) with a StyleSheet + `theme/tokens.ts` fallback.
- **App identity:** reuse `com.succeed.sitesurveyor` (Android `package`, iOS `bundleIdentifier`); deep-link scheme `sitesurveyor`.

## 3. Scope

Cover all workspace views **except CAD**:

`dashboard, assistant, teamChat, notifications, files, quotes, dispatch, assets, marketplace, professionals, team, jobs, profile, schedule, invoices, billing, contacts, timeTracking, settings, admin_overview, admin_activity, admin_users, admin_workspaces, admin_audit`

Excluded: `projects` (CAD / 3D viewport — desktop-only, consistent with existing `isCadPlatformSupported()`).

Account-aware navigation mirrors web:
- `features/workspace/types.ts` (`WORKSPACE_VIEWS`, `WorkspaceView`, `UiUser`, nav types) — mirrored.
- `features/workspace/account.ts` (`getAccessibleView`, `SHARED_VIEWS`, `PERSONAL_ONLY_VIEWS`, `BUSINESS_ONLY_VIEWS`, `ADMIN_PLATFORM_VIEWS`) — mirrored.
- `features/personal/navigation.ts`, `features/business/navigation.ts`, `features/admin/adminNav.ts` — mirrored as mobile nav groups.
- Shells map to three account types: personal, business, platform_admin.

## 4. Directory structure

```
apps/mobile/
  app.json                  # or app.config.ts
  app.config.ts             # scheme, android.package, ios.bundleIdentifier, extra.eas.projectId
  eas.json                  # development / preview / production profiles
  babel.config.js
  metro.config.js
  tsconfig.json
  package.json
  .env.example              # EXPO_PUBLIC_* variables
  src/
    app/                                  # Expo Router routes
      _layout.tsx                         # providers (Query, auth) + auth gate/redirect
      (auth)/
        login.tsx  signup.tsx  forgot-password.tsx  reset-password.tsx
      (app)/
        _layout.tsx                       # account-aware workspace shell
        (tabs)/
          dashboard.tsx  assistant.tsx  jobs.tsx  schedule.tsx
          notifications.tsx  profile.tsx  team-chat.tsx
        quotes.tsx  invoices.tsx  billing.tsx  contacts.tsx  files.tsx
        team.tsx  assets.tsx  dispatch.tsx  marketplace.tsx
        professionals.tsx  time-tracking.tsx  settings.tsx
        admin/
          overview.tsx  activity.tsx  users.tsx  workspaces.tsx  audit.tsx
    lib/
      supabase/client.ts                  # AsyncStorage session, url-polyfill
      auth/
        session.ts  auth-store.ts  app-user.ts  auth-errors.ts
      api/                                # ports of web lib/repositories (query fns)
      offline/
        outbox.ts  sync.ts                # expo-sqlite outbox + replay
      solana/
        phantomPay.ts                     # build USDC tx + deep-link handoff
      platform.ts                         # CAD always disabled on mobile
      theme/tokens.ts                     # fallback design tokens
    features/
      workspace/
        types.ts  account.ts  navigation.ts
      assistant/
        assistantBlocks.ts  chat-utils.ts  streamClient.ts
    components/
      ui/                                 # RN primitives mirroring shadcn set
    hooks/
  assets/
```

## 5. Data, auth & offline

### Supabase client
- Import `react-native-url-polyfill/auto` before any Supabase usage.
- Client config: `auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }`.
- Env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

### Data layer
- TanStack Query against supabase-js. `lib/api/*` containers are pragmatic ports of the web `lib/repositories/*` **query functions** (the ones that are pure Supabase calls).
- Web's Dexie/IndexedDB `lib/localDb` is intentionally **not** ported.
- Query keys mirror repository names for predictability.

### Authentication
- supabase-js auth; Zustand store mirroring `lib/auth/auth-store.ts`; app-user mapping and error formatting mirrored from `lib/auth/app-user.ts` and `lib/auth/auth-errors.ts`.
- Deep-link scheme `sitesurveyor://` handles email confirmation, password reset, and Google OAuth callback (`expo-auth-session`).
- **Config step:** add `sitesurveyor://**` to the Supabase Auth redirect allowlist.

### Offline (scoped for v1)
- Reads: TanStack Query cache persisted to AsyncStorage (works offline after first load).
- Writes: `expo-sqlite` **outbox** for a small, field-critical set — time entries, job updates, project notes/activity. `expo-network` detects connectivity; replay on reconnect.
- Not every view is writable offline in v1. Offline parity with web is partial by design.

## 6. AI Assistant

- POST to `${EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-chat` with the bearer token.
- Consume the **NDJSON stream** using `expo/fetch` + `ReadableStream` (`TextDecoder`).
- Reuse mirrored `assistantBlocks.ts` (parser) and `chat-utils.ts` helpers.
- Same event contract as web: `delta`, `final`, `error`, `status` (and `tool` where emitted).

## 7. Payments (USDC via Phantom)

- Port the USDC-transfer construction from `apps/web/src/features/phantom/payments/phantomPay.ts` using `@solana/web3.js`.
- Hand off to the Phantom app via deep link (`phantom://` / universal link with a `sitesurveyor://` callback); on return, record the transaction signature against the invoice exactly as web does.
- Gated by `EXPO_PUBLIC_SOLANA_TREASURY_ADDRESS`; hide the pay affordance when unset.
- Env: `EXPO_PUBLIC_SOLANA_CLUSTER`, `EXPO_PUBLIC_SOLANA_RPC_URL`, `EXPO_PUBLIC_SOLANA_USDC_MINT`, `EXPO_PUBLIC_SOLANA_TREASURY_ADDRESS`.
- No native wallet adapter in v1.

## 8. Design system / UI

- RN primitives in `components/ui/*` mirror the shadcn set used on web: button, input, card, badge, dialog→modal, select→sheet/picker, tabs, list, toast, etc.
- Adhere to the **`DESIGN.md` contract**: `rounded-none` dominant, muted/glass pill surfaces, `border-border/60`, `shadow-sm` only on floating pills, focus-visible rings.
- **Styling decision:** NativeWind v5 (Tailwind v4 + `@theme` tokens) to maximize parity with web's Tailwind 4 design. **Risk:** v5 is RC and tested on Expo 57. This is validated as a **Phase 0 spike**; the fallback is plain RN `StyleSheet` + `theme/tokens.ts` mirroring the DESIGN.md tokens. The spike result decides the approach before bulk UI work.
- Charts: web uses `recharts` (DOM-only). Use `victory-native` / `react-native-svg` (or lightweight native charts) per view.

## 9. Build, CI & retiring Tauri Android

### EAS
- `eas.json` profiles: `development` (dev client), `preview` (internal APK), `production` (AAB).
- EAS stores the Android keystore and credentials — no manual keystore secrets in GitHub.
- `app.config.ts` sets `android.package` / `ios.bundleIdentifier = com.succeed.sitesurveyor`, `scheme: sitesurveyor`, and `extra.eas.projectId`.

### CI changes
- **`release.yml`:** remove the Tauri `build-android` job; add a `build-mobile` job:
  - `actions/checkout`, `actions/setup-node` (Node 22), `expo/expo-github-action` with `EXPO_TOKEN`.
  - `npm --prefix apps/mobile ci` (or `npm ci` in the dir).
  - `eas build --platform android --profile production --non-interactive` (optionally `eas submit` to Google Play).
  - Upload the resulting AAB (and debug symbols) to the GitHub release on tags.
- **`ci.yml`:** add mobile lint / typecheck / test steps.
- Android signing now lives in EAS; the existing `ANDROID_KEYSTORE_*` GitHub secrets are no longer required by mobile (leave in place until the Tauri Android job is fully removed and verified).

### Environment
- `apps/mobile/.env.example` documents `EXPO_PUBLIC_*`.
- Runtime/build secrets (Supabase URL/anon key, Solana values) live in **EAS environment variables** (development/preview/production). Only `EXPO_TOKEN` lives in GitHub.

### Cleanup (follow-up, not blocking)
Once the Tauri Android target is retired, the following web code paths become dead and can be removed in a separate change: `VITE_MOBILE_BUILD`, `VITE_DISABLE_WASM`, `MobileProjectsPlaceholder.tsx`, and the `.mobile-build` CSS rules (`styles/project-hub.css`, `styles/auth.css`). Removing them is deferred to avoid destabilizing web/desktop now.

## 10. Testing & quality

- **Mobile:** Jest with the `jest-expo` preset + `@testing-library/react-native`. (Web keeps Vitest.)
- Mirrored portable logic gets unit tests: `workspace/account.ts`, `assistantBlocks.ts`, `chat-utils.ts`, workspace types, and the USDC tx builders.
- `eslint` + `tsc --noEmit` for the mobile package.
- Root scripts (all `npm --prefix apps/mobile`): `dev:mobile`, `build:mobile` (EAS), `lint:mobile`, `typecheck:mobile`, `test:mobile`.

## 11. Phasing & decomposition

The scope is large (24 views), so the implementation plan will sequence work across phases and may produce multiple plans.

- **Phase 0 — Spike & scaffold:** create the Expo app; decide NativeWind v5 vs StyleSheet; prove the Supabase auth round-trip; prove `expo/fetch` NDJSON streaming against `ai-chat`.
- **Phase 1 — Auth + shell:** login/signup/reset, session persistence + deep links, account-aware shell + tab/stack navigation, dashboard.
- **Phase 2 — AI + core read views:** assistant, notifications, jobs, schedule, files, profile, settings.
- **Phase 3 — Collaboration & records:** teamChat (realtime), team, contacts, quotes, invoices, billing, timeTracking, assets, dispatch, professionals, marketplace.
- **Phase 4 — Admin + payments + release:** admin_* views, Phantom deep-link payments, EAS release pipeline + Play Store submission.

## 12. Risks & open questions

- **NativeWind v5 is RC** — may need the StyleSheet fallback. Resolved by the Phase 0 spike.
- **RN OAuth / deep links** — requires Supabase redirect allowlisting and correct EAS native config; validate early.
- **Supabase Realtime on RN** — used for team chat; verify reconnection behavior on mobile networks.
- **Offline parity is partial** — v1 covers a scoped write set; document which views are read-only offline.
- **`expo/fetch` streaming nuances** — recent SDK releases fixed streaming teardown races; pin a known-good SDK patch.
- **App-id reuse** — reusing `com.succeed.sitesurveyor` preserves Play Store continuity with the Tauri Android app; confirm no conflicting published artifact before first EAS submit.

## 13. Out of scope

- CAD / 3D viewport (`projects` view).
- Native Solana Mobile Wallet Adapter (deep-link only in v1).
- iOS-specific release signing/store submission details (Android first; iOS parity later).
- Removing the now-dead web mobile code paths (tracked as a follow-up).
