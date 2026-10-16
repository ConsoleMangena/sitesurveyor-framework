# Mobile Foundation Implementation Plan (Expo app: Phase 0 + Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the self-contained `apps/mobile` Expo (React Native) app and deliver an authenticated, account-aware shell with a working Dashboard — the foundation that later phases build views on top of.

**Architecture:** A standalone Expo SDK 58 app using Expo Router (file-based), TanStack Query for server state, and the same hosted Supabase backend (Auth + Postgres/RLS) the web app uses. Portable domain logic from `apps/web` (`workspace/account`, `auth/auth-errors`, `auth-store`, `app-user`) is **mirrored**, not imported. CAD/`projects` is excluded on mobile. The `ai-chat` NDJSON streaming path is proven in Phase 0.

**Tech Stack:** Expo SDK 58 (React Native 0.88, React 19.3), TypeScript, Expo Router, TanStack Query v5, `@supabase/supabase-js` v2, Zustand, AsyncStorage, `expo/fetch`, Jest + jest-expo + @testing-library/react-native, ESLint, EAS Build.

## Global Constraints

- Expo SDK 58; React Native 0.88; React 19.3; Node ≥ 22.13 (CI uses Node 22).
- `apps/mobile` is self-contained: own `package.json`, own `node_modules`, own lockfile. No npm workspaces. Root scripts use `npm --prefix apps/mobile`.
- App identity: Android `package` and iOS `bundleIdentifier` = `com.succeed.sitesurveyor`; deep-link scheme = `sitesurveyor`.
- Backend is the existing hosted Supabase project. Client config comes only from `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- CAD / the `projects` view is excluded on mobile (never routed, never in nav).
- Do **not** import from `apps/web/**`. Mirror code and adjust `@/`-style imports to relative paths.
- Design contract (from `DESIGN.md`): `rounded-none` dominant, muted/glass pill surfaces, `border-border/60`, `shadow-sm` only on floating pills.
- Do not add code comments unless a step explicitly shows them.
- Every task ends with lint + typecheck + tests green, then a commit.

## File Structure (created/modified by this plan)

```
apps/mobile/
  app.config.ts            # identity, scheme, plugins, eas projectId
  eas.json                 # dev/preview/production build profiles
  jest.config.js           # jest-expo preset
  jest.setup.ts            # testing-library matchers
  eslint.config.js         # expo flat lint config
  .env.example             # EXPO_PUBLIC_* names (no values)
  package.json             # name @sitesurveyor/mobile + scripts
  tsconfig.json            # strict TS, @/ -> src
  src/
    app/
      _layout.tsx          # providers + auth gate
      index.tsx            # redirect: -> /(auth)/login or /(app)/(tabs)/dashboard
      (auth)/_layout.tsx
      (auth)/login.tsx
      (auth)/signup.tsx
      (auth)/forgot-password.tsx
      (auth)/reset-password.tsx
      (app)/_layout.tsx    # account-aware workspace shell
      (app)/(tabs)/_layout.tsx
      (app)/(tabs)/dashboard.tsx
    components/ui/theme-view.tsx
    components/ui/theme-text.tsx
    components/ui/button.tsx
    components/ui/text-field.tsx
    features/workspace/types.ts
    features/workspace/account.ts
    features/workspace/navigation.ts
    features/assistant/stream-client.ts
    lib/supabase/config.ts
    lib/supabase/client.ts
    lib/auth/auth-errors.ts
    lib/auth/auth-store.ts
    lib/auth/session.ts
    lib/auth/app-user.ts
    lib/repositories/profiles.ts
    lib/repositories/workspaces.ts
    lib/platform.ts
    lib/theme/tokens.ts
    lib/query/query-client.ts
  __tests__/  (colocated *.test.ts beside sources)
```

Root files modified: `package.json` (mobile scripts), `.github/workflows/ci.yml`, `.github/workflows/release.yml`.

---

## Task 1: Scaffold the Expo app, identity, root scripts

**Files:**
- Create: `apps/mobile/**` (via create-expo-app), then `apps/mobile/app.config.ts`, `apps/mobile/.env.example`
- Delete: `apps/mobile/app.json`
- Modify: `apps/mobile/package.json`, root `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: an Expo Router app rooted at `src/app`, package name `@sitesurveyor/mobile`, scheme/id `com.succeed.sitesurveyor`, and root scripts `dev:mobile`, `lint:mobile`, `typecheck:mobile`, `test:mobile`, `build:mobile:android`.

- [ ] **Step 1: Create the app from the default (Expo Router + TS) template**

Run (from repo root):
```bash
npx create-expo-app@latest apps/mobile --template default --no-install
```
Then install inside it:
```bash
npm --prefix apps/mobile install
```

- [ ] **Step 2: Move routes under `src/` and set package identity**

Move the template's `app/` directory to `apps/mobile/src/app/` (create `src/` first). Then edit `apps/mobile/package.json` so `"name": "@sitesurveyor/mobile"` and add scripts:
```json
"scripts": {
  "start": "expo start",
  "android": "expo start --android",
  "ios": "expo start --ios",
  "lint": "expo lint",
  "typecheck": "tsc --noEmit",
  "test": "jest",
  "build:android": "eas build --platform android --profile production --non-interactive"
}
```

- [ ] **Step 3: Replace `app.json` with `app.config.ts`**

Delete `apps/mobile/app.json` and create `apps/mobile/app.config.ts`:
```ts
import type { ExpoConfig } from 'expo/config';

const projectId = process.env.EAS_PROJECT_ID;

const config: ExpoConfig = {
  name: 'SiteSurveyor',
  slug: 'sitesurveyor',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'sitesurveyor',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  ios: { bundleIdentifier: 'com.succeed.sitesurveyor', supportsTablet: true },
  android: { package: 'com.succeed.sitesurveyor', edgeToEdgeEnabled: true },
  plugins: ['expo-router'],
  experiments: { typedRoutes: true },
  extra: { eas: projectId ? { projectId } : undefined },
};

export default config;
```

- [ ] **Step 4: Add `.env.example` (names only)**

Create `apps/mobile/.env.example`:
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_SOLANA_CLUSTER=devnet
EXPO_PUBLIC_SOLANA_RPC_URL=
EXPO_PUBLIC_SOLANA_USDC_MINT=
EXPO_PUBLIC_SOLANA_TREASURY_ADDRESS=
```
Ensure `apps/mobile/.env` is ignored (the root `.gitignore` already ignores `.env` / `.env.*`; verify `!.env.example` still applies, add `!.env.example` under `apps/mobile` if needed).

- [ ] **Step 5: Wire root scripts**

In the root `package.json` `scripts` block add:
```json
"dev:mobile": "npm --prefix apps/mobile run start",
"build:mobile:android": "npm --prefix apps/mobile run build:android",
"lint:mobile": "npm --prefix apps/mobile run lint",
"typecheck:mobile": "npm --prefix apps/mobile run typecheck",
"test:mobile": "npm --prefix apps/mobile run test"
```

- [ ] **Step 6: Verify config resolves and typecheck passes**

Run:
```bash
npx --prefix apps/mobile expo config --type public
npm run typecheck:mobile
```
Expected: config prints with `scheme: "sitesurveyor"` and `android.package: "com.succeed.sitesurveyor"`; typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile package.json
git commit -m "feat(mobile): scaffold Expo app with identity and root scripts"
```

---

## Task 2: Test, lint, and TS harness

**Files:**
- Create: `apps/mobile/jest.config.js`, `apps/mobile/jest.setup.ts`
- Modify: `apps/mobile/package.json`, `apps/mobile/tsconfig.json`
- Test: `apps/mobile/src/lib/sanity.test.ts`

**Interfaces:**
- Consumes: the scaffold from Task 1.
- Produces: working `npm run test:mobile`, `lint:mobile`, `typecheck:mobile`; `@/` path alias to `src/`.

- [ ] **Step 1: Install test deps**

```bash
npx --prefix apps/mobile expo install jest-expo jest @types/jest @testing-library/react-native -- --save-dev
```

- [ ] **Step 2: Configure Jest**

Create `apps/mobile/jest.config.js`:
```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|@react-navigation|expo(nent)?|@expo(nent)?/.*|expo-router|@supabase|@tanstack|zustand)',
  ],
};
```
Create `apps/mobile/jest.setup.ts`:
```ts
import '@testing-library/react-native/extend-expect';
```

- [ ] **Step 3: Configure the `@/` path alias**

Edit `apps/mobile/tsconfig.json` `compilerOptions` to include:
```json
"strict": true,
"baseUrl": ".",
"paths": { "@/*": ["src/*"] }
```
Add a Jest moduleNameMapper so tests resolve `@/`: in `jest.config.js` add
```js
moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
```

- [ ] **Step 4: Write a failing sanity test**

Create `apps/mobile/src/lib/sanity.test.ts`:
```ts
import { summarize } from '@/lib/sanity';

describe('summarize', () => {
  it('counts characters', () => {
    expect(summarize('hello')).toBe(5);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm run test:mobile`
Expected: FAIL — cannot find module `@/lib/sanity`.

- [ ] **Step 6: Create the module**

Create `apps/mobile/src/lib/sanity.ts`:
```ts
export function summarize(value: string): number {
  return value.length;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test:mobile`
Expected: PASS (1 suite).

- [ ] **Step 8: Verify lint + typecheck**

Run:
```bash
npm run lint:mobile
npm run typecheck:mobile
```
Expected: both exit 0.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile
git commit -m "test(mobile): add jest-expo harness, lint, and @/ alias"
```

---

## Task 3: Supabase env + client

**Files:**
- Create: `apps/mobile/src/lib/supabase/config.ts`, `apps/mobile/src/lib/supabase/client.ts`
- Test: `apps/mobile/src/lib/supabase/config.test.ts`

**Interfaces:**
- Produces:
  - `readSupabaseEnv(env?: Record<string, string | undefined>): { url: string; anonKey: string }`
  - `supabase` — a configured `SupabaseClient` using AsyncStorage persistence.

- [ ] **Step 1: Install deps**

```bash
npx --prefix apps/mobile expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
```

- [ ] **Step 2: Write the failing test**

Create `apps/mobile/src/lib/supabase/config.test.ts`:
```ts
import { readSupabaseEnv } from '@/lib/supabase/config';

describe('readSupabaseEnv', () => {
  it('returns trimmed url and anon key', () => {
    const env = {
      EXPO_PUBLIC_SUPABASE_URL: ' https://x.supabase.co ',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: ' anon ',
    };
    expect(readSupabaseEnv(env)).toEqual({
      url: 'https://x.supabase.co',
      anonKey: 'anon',
    });
  });

  it('throws when the url is missing', () => {
    expect(() =>
      readSupabaseEnv({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon' }),
    ).toThrow('Missing EXPO_PUBLIC_SUPABASE_URL');
  });

  it('throws when the anon key is missing', () => {
    expect(() =>
      readSupabaseEnv({ EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' }),
    ).toThrow('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test:mobile -- config.test`
Expected: FAIL — cannot find module `@/lib/supabase/config`.

- [ ] **Step 4: Implement `config.ts`**

Create `apps/mobile/src/lib/supabase/config.ts`:
```ts
export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

export function readSupabaseEnv(
  env: Record<string, string | undefined> = process.env,
): SupabaseEnv {
  const url = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url) throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL');
  if (!anonKey) throw new Error('Missing EXPO_PUBLIC_SUPABASE_ANON_KEY');
  return { url, anonKey };
}
```

- [ ] **Step 5: Implement `client.ts`**

Create `apps/mobile/src/lib/supabase/client.ts`:
```ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { readSupabaseEnv } from './config';

const { url, anonKey } = readSupabaseEnv();

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:mobile -- config.test`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): supabase env reader and client with AsyncStorage"
```

---

## Task 4: AI `ai-chat` NDJSON streaming client (Phase 0 spike)

**Files:**
- Create: `apps/mobile/src/features/assistant/stream-client.ts`
- Test: `apps/mobile/src/features/assistant/stream-client.test.ts`

**Interfaces:**
- Produces:
  - `parseNdjsonLines(buffer: string): { events: AssistantEvent[]; rest: string }`
  - `streamAssistantChat(params: { url: string; anonKey: string; token: string; body: unknown; signal?: AbortSignal }): AsyncGenerator<AssistantEvent>`
  - `type AssistantEvent = { type: 'delta' | 'final' | 'error' | 'status' | 'tool'; [k: string]: unknown }`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/features/assistant/stream-client.test.ts`:
```ts
import { parseNdjsonLines } from '@/features/assistant/stream-client';

describe('parseNdjsonLines', () => {
  it('parses complete lines and keeps the remainder', () => {
    const input = '{"type":"delta","text":"hi"}\n{"type":"final"}\n{"type":"st';
    const { events, rest } = parseNdjsonLines(input);
    expect(events).toEqual([
      { type: 'delta', text: 'hi' },
      { type: 'final' },
    ]);
    expect(rest).toBe('{"type":"st');
  });

  it('skips blank lines', () => {
    const { events } = parseNdjsonLines('\n\n{"type":"status"}\n');
    expect(events).toEqual([{ type: 'status' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:mobile -- stream-client.test`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `stream-client.ts`**

Create `apps/mobile/src/features/assistant/stream-client.ts`:
```ts
import { fetch } from 'expo/fetch';

export type AssistantEvent = {
  type: 'delta' | 'final' | 'error' | 'status' | 'tool';
  [key: string]: unknown;
};

export function parseNdjsonLines(buffer: string): {
  events: AssistantEvent[];
  rest: string;
} {
  const events: AssistantEvent[] = [];
  const parts = buffer.split('\n');
  const rest = parts.pop() ?? '';
  for (const line of parts) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    events.push(JSON.parse(trimmed) as AssistantEvent);
  }
  return { events, rest };
}

export async function* streamAssistantChat(params: {
  url: string;
  anonKey: string;
  token: string;
  body: unknown;
  signal?: AbortSignal;
}): AsyncGenerator<AssistantEvent> {
  const response = await fetch(`${params.url}/functions/v1/ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: params.anonKey,
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify(params.body),
    signal: params.signal,
  });

  if (!response.body) {
    throw new Error('ai-chat returned no stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseNdjsonLines(buffer);
    buffer = parsed.rest;
    for (const event of parsed.events) yield event;
  }

  if (buffer.trim()) {
    yield JSON.parse(buffer.trim()) as AssistantEvent;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:mobile -- stream-client.test`
Expected: PASS (2 tests).

- [ ] **Step 5: Document the live smoke check**

Append to the task commit message (no code) the manual check performed once with a real token via the app's Assistant screen in Phase 2. No further action here.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): ai-chat NDJSON streaming client via expo/fetch"
```

---

## Task 5: Design tokens + themed primitives (StyleSheet baseline)

**Files:**
- Create: `apps/mobile/src/lib/theme/tokens.ts`, `apps/mobile/src/components/ui/theme-view.tsx`, `apps/mobile/src/components/ui/theme-text.tsx`
- Test: `apps/mobile/src/lib/theme/tokens.test.ts`

**Interfaces:**
- Produces:
  - `tokens` object with `colors`, `radius` (all 0), `space`, `text`.
  - `<ThemeView tone="background" | "card" | "muted" />`, `<ThemeText variant="base" | "sm" | "semibold" />`.

Rationale: the safe baseline is RN StyleSheet + tokens (guaranteed to work). NativeWind v5 is RC and is evaluated as a separate optional Task 15.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/lib/theme/tokens.test.ts`:
```ts
import { tokens } from '@/lib/theme/tokens';

describe('tokens', () => {
  it('uses square corners everywhere (DESIGN.md contract)', () => {
    expect(tokens.radius.none).toBe(0);
    expect(tokens.radius.sm).toBe(0);
    expect(tokens.radius.md).toBe(0);
  });

  it('exposes the core color roles', () => {
    expect(tokens.colors.background).toMatch(/^#|rgb/);
    expect(tokens.colors.card).toMatch(/^#|rgb/);
    expect(tokens.colors.border).toMatch(/^#|rgb/);
    expect(tokens.colors.primary).toMatch(/^#|rgb/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:mobile -- tokens.test`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `tokens.ts`**

Create `apps/mobile/src/lib/theme/tokens.ts`:
```ts
export const tokens = {
  colors: {
    background: '#0b0f14',
    card: 'rgba(255,255,255,0.04)',
    muted: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.12)',
    foreground: '#e8edf2',
    mutedForeground: 'rgba(232,237,242,0.6)',
    primary: '#4f8cff',
    primaryForeground: '#ffffff',
    danger: '#ff5b5b',
  },
  radius: { none: 0, sm: 0, md: 0, pill: 999 },
  space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 64 },
  text: { sm: 14, base: 16, lg: 20, semibold: '600' as const },
} as const;
```

- [ ] **Step 4: Implement `theme-view.tsx`**

Create `apps/mobile/src/components/ui/theme-view.tsx`:
```tsx
import { View, type ViewProps } from 'react-native';
import { tokens } from '@/lib/theme/tokens';

type Tone = 'background' | 'card' | 'muted';

export function ThemeView({ tone = 'background', style, ...props }: ViewProps & { tone?: Tone }) {
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: tokens.colors[tone],
          borderRadius: tokens.radius.md,
          borderColor: tokens.colors.border,
          borderWidth: tone === 'background' ? 0 : 1,
        },
        style,
      ]}
    />
  );
}
```

- [ ] **Step 5: Implement `theme-text.tsx`**

Create `apps/mobile/src/components/ui/theme-text.tsx`:
```tsx
import { Text, type TextProps } from 'react-native';
import { tokens } from '@/lib/theme/tokens';

type Variant = 'base' | 'sm' | 'semibold';

export function ThemeText({ variant = 'base', style, ...props }: TextProps & { variant?: Variant }) {
  const base = variant === 'sm' ? tokens.text.sm : tokens.text.base;
  const weight = variant === 'semibold' ? tokens.text.semibold : '400';
  return (
    <Text
      {...props}
      style={[{ color: tokens.colors.foreground, fontSize: base, fontWeight: weight }, style]}
    />
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:mobile -- tokens.test`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): design tokens and themed primitives (StyleSheet baseline)"
```

---

## Task 6: Workspace types (mirrored, CAD removed)

**Files:**
- Create: `apps/mobile/src/features/workspace/types.ts`
- Test: `apps/mobile/src/features/workspace/types.test.ts`

**Interfaces:**
- Produces: `AccountType`, `SignupAccountType`, `WORKSPACE_VIEWS` (no `projects`), `WorkspaceView`, `isWorkspaceView`, `UiUser`, `WorkspaceNavItem`, `WorkspaceNavGroup`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/features/workspace/types.test.ts`:
```ts
import { WORKSPACE_VIEWS, isWorkspaceView } from '@/features/workspace/types';

describe('workspace views', () => {
  it('excludes the CAD projects view on mobile', () => {
    expect(WORKSPACE_VIEWS).not.toContain('projects');
  });

  it('recognizes valid views and rejects unknown ones', () => {
    expect(isWorkspaceView('dashboard')).toBe(true);
    expect(isWorkspaceView('nope')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:mobile -- workspace/types`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `types.ts`**

Create `apps/mobile/src/features/workspace/types.ts`:
```ts
export type AccountType = 'personal' | 'business';
export type SignupAccountType = 'personal' | 'business' | 'platform_admin';

export const WORKSPACE_VIEWS = [
  'dashboard',
  'assistant',
  'teamChat',
  'notifications',
  'files',
  'quotes',
  'dispatch',
  'assets',
  'marketplace',
  'professionals',
  'team',
  'jobs',
  'profile',
  'schedule',
  'invoices',
  'billing',
  'contacts',
  'timeTracking',
  'admin_overview',
  'admin_activity',
  'admin_users',
  'admin_workspaces',
  'admin_audit',
  'settings',
] as const;

export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number];

const WORKSPACE_VIEW_SET: ReadonlySet<string> = new Set(WORKSPACE_VIEWS);

export function isWorkspaceView(value: unknown): value is WorkspaceView {
  return typeof value === 'string' && WORKSPACE_VIEW_SET.has(value);
}

export interface UiUser {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  company: string;
  accountType: AccountType;
  signupAccountType: SignupAccountType | null;
  isPlatformAdmin: boolean;
}

export interface WorkspaceNavItem {
  view: WorkspaceView;
  label: string;
  icon: string;
}

export interface WorkspaceNavGroup {
  label?: string;
  items: WorkspaceNavItem[];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:mobile -- workspace/types`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): workspace view types (CAD excluded)"
```

---

## Task 7: Account access logic (mirrored)

**Files:**
- Create: `apps/mobile/src/features/workspace/account.ts`
- Modify: `apps/mobile/src/features/workspace/types.ts` (no change expected; import only)
- Test: `apps/mobile/src/features/workspace/account.test.ts`

**Interfaces:**
- Consumes: Task 6 types.
- Produces: `SHARED_VIEWS`, `PERSONAL_ONLY_VIEWS`, `BUSINESS_ONLY_VIEWS`, `ADMIN_PLATFORM_VIEWS`, `getAllowedViews`, `getAccessibleView`, `getAccountTypeLabel`, `PLATFORM_ADMIN_FALLBACK_WORKSPACE_ID`, `mapAppUserToUiUser`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/features/workspace/account.test.ts`:
```ts
import { getAllowedViews, getAccessibleView } from '@/features/workspace/account';

describe('account view access', () => {
  it('gives personal accounts invoices/contacts but not dispatch', () => {
    const views = getAllowedViews('personal');
    expect(views.has('invoices')).toBe(true);
    expect(views.has('contacts')).toBe(true);
    expect(views.has('dispatch')).toBe(false);
  });

  it('gives business accounts dispatch but not invoices', () => {
    const views = getAllowedViews('business');
    expect(views.has('dispatch')).toBe(true);
    expect(views.has('invoices')).toBe(false);
  });

  it('adds admin views only for platform admins', () => {
    expect(getAllowedViews('personal').has('admin_users')).toBe(false);
    expect(getAllowedViews('personal', true).has('admin_users')).toBe(true);
  });

  it('falls back to dashboard for inaccessible requests', () => {
    expect(getAccessibleView('personal', 'dispatch')).toBe('dashboard');
    expect(getAccessibleView('business', 'dispatch')).toBe('dispatch');
  });

  it('treats projects (CAD) as inaccessible on mobile', () => {
    expect(getAccessibleView('personal', 'projects' as never)).toBe('dashboard');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:mobile -- workspace/account`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `account.ts`**

Create `apps/mobile/src/features/workspace/account.ts` (mirror of web `account.ts`, with `projects` removed from `SHARED_VIEWS` and `mapAppUserToUiUser` adapted to the mobile repositories from Task 10):
```ts
import type { AppUserContext } from '@/lib/auth/app-user';
import type {
  AccountType,
  SignupAccountType,
  UiUser,
  WorkspaceView,
} from './types';

function normalizeSignupAccountType(
  raw: string | null | undefined,
): SignupAccountType | null {
  if (raw == null || raw === '') return null;
  const v = String(raw).trim().toLowerCase();
  if (v === 'personal' || v === 'business' || v === 'platform_admin') return v;
  return null;
}

function resolveSignupAccountType(input: {
  profile: { auth_signup_account_type?: string | null } | null;
  metadata: Record<string, unknown>;
}): SignupAccountType | null {
  const fromProfile = normalizeSignupAccountType(
    input.profile?.auth_signup_account_type ?? undefined,
  );
  if (fromProfile) return fromProfile;
  const meta = input.metadata.account_type;
  return normalizeSignupAccountType(typeof meta === 'string' ? meta : undefined);
}

export const SHARED_VIEWS: WorkspaceView[] = [
  'dashboard',
  'assistant',
  'teamChat',
  'notifications',
  'files',
  'quotes',
  'assets',
  'marketplace',
  'professionals',
  'jobs',
  'profile',
  'schedule',
  'billing',
  'timeTracking',
  'team',
  'settings',
];

export const PERSONAL_ONLY_VIEWS: WorkspaceView[] = ['invoices', 'contacts'];
export const BUSINESS_ONLY_VIEWS: WorkspaceView[] = ['dispatch'];

export const ADMIN_PLATFORM_VIEWS: WorkspaceView[] = [
  'admin_overview',
  'admin_activity',
  'admin_users',
  'admin_workspaces',
  'admin_audit',
];

function mergePlatformAdminViews(
  views: Set<WorkspaceView>,
  isPlatformAdmin: boolean,
): Set<WorkspaceView> {
  if (!isPlatformAdmin) return views;
  const next = new Set(views);
  ADMIN_PLATFORM_VIEWS.forEach((view) => next.add(view));
  return next;
}

export function getAllowedViews(
  accountType: AccountType,
  isPlatformAdmin = false,
): Set<WorkspaceView> {
  const accountViews = new Set(
    accountType === 'business'
      ? [...SHARED_VIEWS, ...BUSINESS_ONLY_VIEWS]
      : [...SHARED_VIEWS, ...PERSONAL_ONLY_VIEWS],
  );
  return mergePlatformAdminViews(accountViews, isPlatformAdmin);
}

export function getAccessibleView(
  accountType: AccountType,
  requestedView: WorkspaceView,
  isPlatformAdmin = false,
): WorkspaceView {
  return getAllowedViews(accountType, isPlatformAdmin).has(requestedView)
    ? requestedView
    : 'dashboard';
}

export function getAccountTypeLabel(accountType: AccountType): string {
  return accountType === 'business' ? 'Business account' : 'Personal account';
}

export const PLATFORM_ADMIN_FALLBACK_WORKSPACE_ID =
  '00000000-0000-0000-0000-000000000000';

export function mapAppUserToUiUser(input: AppUserContext): UiUser | null {
  if (!input.session) return null;

  const metadata = (input.session.user.user_metadata ?? {}) as Record<
    string,
    unknown
  >;
  const workspace =
    input.defaultWorkspace ?? input.workspaces[0]?.workspace ?? null;
  const email = input.profile?.email ?? input.session.user.email ?? '';

  const signupAccountType = resolveSignupAccountType({
    profile: input.profile,
    metadata,
  });

  const accountType: AccountType =
    workspace?.type === 'business'
      ? 'business'
      : metadata['account_type'] === 'business'
        ? 'business'
        : 'personal';

  const workspaceId = workspace?.id ?? input.workspaces[0]?.workspaceId ?? '';

  const name =
    input.profile?.full_name ||
    (typeof metadata.full_name === 'string' ? metadata.full_name : '') ||
    (typeof metadata.name === 'string' ? metadata.name : '') ||
    email.split('@')[0] ||
    'User';

  if (!workspaceId) {
    if (!input.profile?.is_platform_admin) return null;
    return {
      id: input.session.user.id,
      workspaceId: PLATFORM_ADMIN_FALLBACK_WORKSPACE_ID,
      name,
      email,
      company: 'Platform operator',
      accountType,
      signupAccountType,
      isPlatformAdmin: true,
    };
  }

  return {
    id: input.session.user.id,
    workspaceId,
    name,
    email,
    company:
      accountType === 'business'
        ? workspace?.name ||
          (typeof metadata.workspace_name === 'string'
            ? metadata.workspace_name
            : '') ||
          (typeof metadata.company === 'string' ? metadata.company : '') ||
          'My Workspace'
        : 'Independent Surveyor',
    accountType,
    signupAccountType,
    isPlatformAdmin: Boolean(input.profile?.is_platform_admin),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:mobile -- workspace/account`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): mirror account access logic (no CAD)"
```

---

## Task 8: Navigation groups (mirrored, CAD removed)

**Files:**
- Create: `apps/mobile/src/features/workspace/navigation.ts`
- Test: `apps/mobile/src/features/workspace/navigation.test.ts`

**Interfaces:**
- Consumes: Task 6 types.
- Produces: `personalNavGroups`, `businessNavGroups`, `platformAdminNavGroup`, and `navItemsFor(accountType, isPlatformAdmin): WorkspaceNavItem[]`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/features/workspace/navigation.test.ts`:
```ts
import { navItemsFor } from '@/features/workspace/navigation';

describe('navItemsFor', () => {
  it('never includes the CAD projects view', () => {
    const views = navItemsFor('personal').map((i) => i.view);
    expect(views).not.toContain('projects' as never);
  });

  it('includes invoices for personal and dispatch for business', () => {
    expect(navItemsFor('personal').map((i) => i.view)).toContain('invoices');
    expect(navItemsFor('business').map((i) => i.view)).toContain('dispatch');
  });

  it('appends admin items for platform admins', () => {
    const views = navItemsFor('personal', true).map((i) => i.view);
    expect(views).toContain('admin_overview');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:mobile -- workspace/navigation`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `navigation.ts`**

Create `apps/mobile/src/features/workspace/navigation.ts`:
```ts
import type { WorkspaceNavGroup, WorkspaceNavItem, AccountType } from './types';

export const personalNavGroups: WorkspaceNavGroup[] = [
  {
    items: [
      { view: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { view: 'assistant', label: 'SiteSurveyor AI', icon: 'bot' },
      { view: 'notifications', label: 'Notifications', icon: 'notifications' },
    ],
  },
  {
    label: 'WORK',
    items: [
      { view: 'schedule', label: 'Schedule', icon: 'calendar' },
      { view: 'timeTracking', label: 'Time & Expenses', icon: 'clock' },
      { view: 'assets', label: 'Assets', icon: 'asset' },
      { view: 'files', label: 'Files', icon: 'file-manager' },
      { view: 'quotes', label: 'Quotes', icon: 'document' },
    ],
  },
  {
    label: 'FINANCES',
    items: [
      { view: 'invoices', label: 'Invoices', icon: 'document' },
      { view: 'billing', label: 'Billing & Payments', icon: 'billing' },
    ],
  },
  {
    label: 'PEOPLE',
    items: [
      { view: 'teamChat', label: 'Team Chat', icon: 'chat' },
      { view: 'team', label: 'Team', icon: 'people' },
      { view: 'contacts', label: 'Contacts', icon: 'people' },
      { view: 'professionals', label: 'Hire Crew', icon: 'person-plus' },
      { view: 'jobs', label: 'Find Jobs', icon: 'briefcase' },
    ],
  },
  {
    label: 'MARKETPLACE',
    items: [{ view: 'marketplace', label: 'Marketplace', icon: 'shopping' }],
  },
  {
    label: 'ACCOUNT',
    items: [{ view: 'settings', label: 'Settings', icon: 'settings' }],
  },
];

export const businessNavGroups: WorkspaceNavGroup[] = [
  { items: personalNavGroups[0].items },
  {
    label: 'WORK',
    items: [
      { view: 'schedule', label: 'Schedule', icon: 'calendar' },
      { view: 'dispatch', label: 'Dispatch', icon: 'dispatch' },
      { view: 'timeTracking', label: 'Time & Expenses', icon: 'clock' },
      { view: 'assets', label: 'Assets', icon: 'asset' },
      { view: 'files', label: 'Files', icon: 'file-manager' },
      { view: 'quotes', label: 'Quotes', icon: 'document' },
    ],
  },
  ...personalNavGroups.slice(2),
];

export const platformAdminNavGroup: WorkspaceNavGroup = {
  label: 'PLATFORM',
  items: [
    { view: 'admin_overview', label: 'Overview', icon: 'dashboard' },
    { view: 'admin_activity', label: 'Activity', icon: 'activity' },
    { view: 'admin_users', label: 'Users', icon: 'people' },
    { view: 'admin_workspaces', label: 'Workspaces', icon: 'briefcase' },
    { view: 'admin_audit', label: 'Audit Log', icon: 'document' },
  ],
};

export function navItemsFor(
  accountType: AccountType,
  isPlatformAdmin = false,
): WorkspaceNavItem[] {
  const groups =
    accountType === 'business' ? businessNavGroups : personalNavGroups;
  const items = [...groups.flatMap((g) => g.items)];
  if (isPlatformAdmin) items.push(...platformAdminNavGroup.items);
  return items;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:mobile -- workspace/navigation`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): mirror navigation groups (no CAD)"
```

---

## Task 9: Auth errors (mirrored)

**Files:**
- Create: `apps/mobile/src/lib/auth/auth-errors.ts`
- Test: `apps/mobile/src/lib/auth/auth-errors.test.ts`

**Interfaces:**
- Produces: `isEmailNotConfirmedError`, `formatAuthRateLimitMessage`, `formatAuthUserFacingError`.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/lib/auth/auth-errors.test.ts`:
```ts
import {
  isEmailNotConfirmedError,
  formatAuthUserFacingError,
} from '@/lib/auth/auth-errors';

describe('auth errors', () => {
  it('detects email-not-confirmed by code', () => {
    expect(isEmailNotConfirmedError({ code: 'email_not_confirmed' })).toBe(true);
    expect(isEmailNotConfirmedError({ message: 'nope' })).toBe(false);
  });

  it('maps invalid credentials to friendly copy', () => {
    expect(formatAuthUserFacingError({ code: 'invalid_credentials' })).toContain(
      'Incorrect email or password',
    );
  });

  it('maps rate limits to the Supabase mailer explanation', () => {
    expect(formatAuthUserFacingError({ status: 429 })).toContain('temporarily limited');
  });

  it('falls back to the provided message', () => {
    expect(formatAuthUserFacingError({ message: 'Boom' })).toBe('Boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:mobile -- auth-errors.test`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Copy the web implementation as a mirror**

Create `apps/mobile/src/lib/auth/auth-errors.ts` with the exact contents of `apps/web/src/lib/auth/auth-errors.ts` (all 162 lines, unchanged except that it is a fresh file with no imports). It is dependency-free and portable.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:mobile -- auth-errors.test`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): mirror auth error formatting"
```

---

## Task 10: Auth store, session, repositories, app-user (mirrored)

**Files:**
- Create: `apps/mobile/src/lib/auth/auth-store.ts`, `apps/mobile/src/lib/auth/session.ts`, `apps/mobile/src/lib/repositories/profiles.ts`, `apps/mobile/src/lib/repositories/workspaces.ts`, `apps/mobile/src/lib/auth/app-user.ts`
- Test: `apps/mobile/src/lib/auth/auth-store.test.ts`

**Interfaces:**
- Consumes: Task 3 `supabase`, Task 7 workspaces types, Task 6 types.
- Produces:
  - `useAuthStore` (same shape as web).
  - `ProfileRow`, `getMyProfile(): Promise<ProfileRow | null>`.
  - `WorkspaceRow`, `WorkspaceMembershipSummary`, `getDefaultWorkspace(): Promise<WorkspaceRow | null>`, `getMyWorkspaces(): Promise<WorkspaceMembershipSummary[]>`.
  - `AppUserContext`, `getCurrentSession`, `getCurrentAppUser`, `getCurrentAppUserWithDiagnostics`, `onAuthStateChange`, `signOut`, `signInWithEmail`, `signUpWithEmail`, `requestPasswordReset`, `updatePassword`.

- [ ] **Step 1: Write the failing test (auth store)**

Create `apps/mobile/src/lib/auth/auth-store.test.ts`:
```ts
import { useAuthStore } from '@/lib/auth/auth-store';

describe('useAuthStore', () => {
  beforeEach(() =>
    useAuthStore.setState({
      user: null,
      isLoading: true,
      isAuthLoading: false,
      error: null,
      sessionExpired: false,
    }),
  );

  it('sets and clears the user, clearing errors', () => {
    useAuthStore.getState().setError('x');
    useAuthStore.getState().setUser({
      id: '1',
      workspaceId: 'w',
      name: 'A',
      email: 'a@b.c',
      company: 'C',
      accountType: 'personal',
      signupAccountType: 'personal',
      isPlatformAdmin: false,
    });
    expect(useAuthStore.getState().user?.id).toBe('1');
    expect(useAuthStore.getState().error).toBeNull();
  });

  it('manages the session-expired flag', () => {
    useAuthStore.getState().setSessionExpired(true);
    expect(useAuthStore.getState().sessionExpired).toBe(true);
    useAuthStore.getState().dismissSessionExpired();
    expect(useAuthStore.getState().sessionExpired).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:mobile -- auth-store.test`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `auth-store.ts`**

Create `apps/mobile/src/lib/auth/auth-store.ts` identical to `apps/web/src/lib/auth/auth-store.ts`, but with the import changed to the mirrored types:
```ts
import { create } from 'zustand';
import type { UiUser } from '@/features/workspace/types';
```
(Keep the rest of the file byte-for-byte the same as the web version.)

- [ ] **Step 4: Implement `profiles.ts` and `workspaces.ts` (mobile repositories)**

Create `apps/mobile/src/lib/repositories/profiles.ts`:
```ts
import { supabase } from '@/lib/supabase/client';

export interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  is_platform_admin: boolean | null;
  auth_signup_account_type: string | null;
}

export async function getMyProfile(): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,full_name,is_platform_admin,auth_signup_account_type')
    .single();
  if (error) throw error;
  return (data as ProfileRow) ?? null;
}
```
Create `apps/mobile/src/lib/repositories/workspaces.ts`:
```ts
import { supabase } from '@/lib/supabase/client';

export interface WorkspaceRow {
  id: string;
  name: string;
  type: string;
}

export interface WorkspaceMembershipSummary {
  workspaceId: string;
  workspace: WorkspaceRow;
  role: string;
}

export async function getDefaultWorkspace(): Promise<WorkspaceRow | null> {
  const { data, error } = await supabase.rpc('get_default_workspace');
  if (error || !data) return null;
  return data as WorkspaceRow;
}

export async function getMyWorkspaces(): Promise<WorkspaceMembershipSummary[]> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role, workspace:workspaces(id,name,type)');
  if (error) throw error;
  return (data ?? []).map((row) => {
    const r = row as unknown as {
      role: string;
      workspace: WorkspaceRow;
    };
    return {
      workspaceId: r.workspace.id,
      workspace: r.workspace,
      role: r.role,
    };
  });
}
```
(If `get_default_workspace` RPC does not exist, replace `getDefaultWorkspace` with selecting the first membership and note it in the commit message. Confirm the RPC against `supabase/migrations` before finalizing.)

- [ ] **Step 5: Implement `session.ts`**

Create `apps/mobile/src/lib/auth/session.ts`:
```ts
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase/client';

export function loadStoredSession(): Promise<Session | null> {
  return supabase.auth.getSession().then(({ data }) => data.session ?? null);
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export async function signInWithEmail(input: { email: string; password: string }) {
  return supabase.auth.signInWithPassword(input);
}

export async function signUpWithEmail(input: {
  email: string;
  password: string;
  accountType: 'personal' | 'business';
  fullName?: string;
}) {
  return supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { account_type: input.accountType, full_name: input.fullName },
      emailRedirectTo: Linking.createURL('auth/callback'),
    },
  });
}

export async function requestPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: Linking.createURL('reset-password'),
  });
}

export async function updatePassword(newPassword: string) {
  return supabase.auth.updateUser({ password: newPassword });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export function onAuthStateChange(
  handler: (session: Session | null) => void,
): { unsubscribe: () => void } {
  const { data } = supabase.auth.onAuthStateChange((_event, session) =>
    handler(session),
  );
  return { unsubscribe: () => data.subscription.unsubscribe() };
}
```
Install linking: `npx --prefix apps/mobile expo install expo-linking`.

- [ ] **Step 6: Implement `app-user.ts`**

Create `apps/mobile/src/lib/auth/app-user.ts`, mirroring web `apps/web/src/lib/auth/app-user.ts`, but:
- import `getCurrentSession` from `./session`
- import repositories from the mobile `@/lib/repositories/*`
- use `@/` imports:
```ts
import type { Session } from '@supabase/supabase-js';
import { getCurrentSession } from './session';
import { getMyProfile, type ProfileRow } from '@/lib/repositories/profiles';
import {
  getDefaultWorkspace,
  getMyWorkspaces,
  type WorkspaceMembershipSummary,
  type WorkspaceRow,
} from '@/lib/repositories/workspaces';

export interface AppUserContext {
  session: Session | null;
  profile: ProfileRow | null;
  defaultWorkspace: WorkspaceRow | null;
  workspaces: WorkspaceMembershipSummary[];
}

export interface AppUserLoadDiagnostics {
  profileFetchFailed: boolean;
  defaultWorkspaceFetchFailed: boolean;
  workspacesFetchFailed: boolean;
}
```
(Keep `emptyContext`, `loadAppUserFromSession`, `getCurrentAppUser`, `getCurrentAppUserWithDiagnostics` byte-for-byte from web, adjusting only the module specifiers above and the `type` imports.)

- [ ] **Step 7: Run tests to verify they pass; typecheck**

Run:
```bash
npm run test:mobile -- auth-store.test
npm run typecheck:mobile
```
Expected: tests PASS (2 tests); typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): auth store, session, repositories, and app-user mirror"
```

---

## Task 11: Query client + root providers + auth gate

**Files:**
- Create: `apps/mobile/src/lib/query/query-client.ts`, rewrite `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/app/index.tsx`
- Test: `apps/mobile/src/app/__tests__/root-layout.test.tsx`

**Interfaces:**
- Consumes: Task 3 `supabase`, Task 10 `useAuthStore`/`getCurrentAppUser*`/`onAuthStateChange`/`signOut`, Task 7 `mapAppUserToUiUser`.
- Produces: `queryClient`; a root layout that hydrates auth from Supabase and renders a splash until resolved; `index.tsx` redirects to `/(auth)/login` or `/(app)/(tabs)/dashboard`.

- [ ] **Step 1: Install Query deps**

```bash
npx --prefix apps/mobile expo install @tanstack/react-query
```

- [ ] **Step 2: Implement `query-client.ts`**

Create `apps/mobile/src/lib/query/query-client.ts`:
```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});
```

- [ ] **Step 3: Implement the root layout**

Replace `apps/mobile/src/app/_layout.tsx`:
```tsx
import '@/lib/supabase/client';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query/query-client';
import { useAuthStore } from '@/lib/auth/auth-store';
import { mapAppUserToUiUser } from '@/features/workspace/account';
import { getCurrentAppUserWithDiagnostics, onAuthStateChange } from '@/lib/auth/app-user';

export default function RootLayout() {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    let active = true;

    async function hydrate() {
      const { context } = await getCurrentAppUserWithDiagnostics();
      if (!active) return;
      setUser(mapAppUserToUiUser(context));
      setLoading(false);
    }

    hydrate();

    const { unsubscribe } = onAuthStateChange(async (session) => {
      if (!session) {
        setUser(null);
        setLoading(false);
        return;
      }
      const { context } = await getCurrentAppUserWithDiagnostics();
      setUser(mapAppUserToUiUser(context));
      setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [setUser, setLoading]);

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Implement the index redirect**

Create/replace `apps/mobile/src/app/index.tsx`:
```tsx
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuthStore } from '@/lib/auth/auth-store';

export default function Index() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={user ? '/(app)/(tabs)/dashboard' : '/(auth)/login'} />;
}
```

- [ ] **Step 5: Write a render test**

Create `apps/mobile/src/app/__tests__/root-layout.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react-native';
import Index from '@/app/index';
import { useAuthStore } from '@/lib/auth/auth-store';

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>redirect:{href}</Text>;
  },
}));

describe('Index', () => {
  it('shows a loader while auth is loading', () => {
    useAuthStore.setState({ isLoading: true, user: null });
    const { UNSAFE_getByType } = render(<Index />);
    expect(UNSAFE_getByType(require('react-native').ActivityIndicator)).toBeTruthy();
  });

  it('redirects to login when signed out', () => {
    useAuthStore.setState({ isLoading: false, user: null });
    render(<Index />);
    expect(screen.getByText('redirect:/(auth)/login')).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run test to verify it fails, then passes after implementation**

Run: `npm run test:mobile -- root-layout`
Expected after implementation: PASS (2 tests).

- [ ] **Step 7: Typecheck + commit**

```bash
npm run typecheck:mobile
git add apps/mobile
git commit -m "feat(mobile): query client, root providers, and auth gate"
```

---

## Task 12: Auth screens (login, signup, forgot, reset)

**Files:**
- Create: `apps/mobile/src/app/(auth)/_layout.tsx`, `login.tsx`, `signup.tsx`, `forgot-password.tsx`, `reset-password.tsx`
- Create: `apps/mobile/src/components/ui/button.tsx`, `apps/mobile/src/components/ui/text-field.tsx`
- Test: `apps/mobile/src/app/(auth)/__tests__/login.test.tsx`

**Interfaces:**
- Consumes: Task 10 session helpers + `formatAuthUserFacingError` (Task 9); Task 5 primitives; Task 3 `supabase`.
- Produces: four auth routes; `<Button>`, `<TextField>` primitives.

- [ ] **Step 1: Implement primitives**

Create `apps/mobile/src/components/ui/button.tsx`:
```tsx
import { Pressable, type PressableProps } from 'react-native';
import { tokens } from '@/lib/theme/tokens';
import { ThemeText } from './theme-text';

export function Button({
  label,
  disabled,
  ...props
}: PressableProps & { label: string; disabled?: boolean }) {
  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={{
        backgroundColor: tokens.colors.primary,
        borderRadius: tokens.radius.md,
        paddingVertical: tokens.space.md,
        alignItems: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <ThemeText variant="semibold" style={{ color: tokens.colors.primaryForeground }}>
        {label}
      </ThemeText>
    </Pressable>
  );
}
```
Create `apps/mobile/src/components/ui/text-field.tsx`:
```tsx
import { TextInput, type TextInputProps } from 'react-native';
import { tokens } from '@/lib/theme/tokens';

export function TextField(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={tokens.colors.mutedForeground}
      {...props}
      style={{
        backgroundColor: tokens.colors.muted,
        borderColor: tokens.colors.border,
        borderWidth: 1,
        borderRadius: tokens.radius.md,
        paddingHorizontal: tokens.space.md,
        paddingVertical: tokens.space.sm,
        color: tokens.colors.foreground,
      }}
    />
  );
}
```

- [ ] **Step 2: Implement the auth layout**

Create `apps/mobile/src/app/(auth)/_layout.tsx`:
```tsx
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 3: Write the failing login test**

Create `apps/mobile/src/app/(auth)/__tests__/login.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import Login from '@/app/(auth)/login';

const signInWithEmail = jest.fn().mockResolvedValue({ error: null });
jest.mock('@/lib/auth/session', () => ({
  signInWithEmail: (...args: unknown[]) => signInWithEmail(...args),
}));
jest.mock('expo-router', () => ({ Link: ({ children }: never) => children, useRouter: () => ({ replace: jest.fn() }) }));

describe('Login', () => {
  it('submits email and password', async () => {
    render(<Login />);
    fireEvent.changeText(screen.getByPlaceholderText('Email'), 'a@b.co');
    fireEvent.changeText(screen.getByPlaceholderText('Password'), 'secret123');
    fireEvent.press(screen.getByText('Sign in'));
    await waitFor(() =>
      expect(signInWithEmail).toHaveBeenCalledWith({ email: 'a@b.co', password: 'secret123' }),
    );
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test:mobile -- login.test`
Expected: FAIL — cannot find module `./login`.

- [ ] **Step 5: Implement `login.tsx`**

Create `apps/mobile/src/app/(auth)/login.tsx`:
```tsx
import { useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { ScrollView } from 'react-native';
import { ThemeView } from '@/components/ui/theme-view';
import { ThemeText } from '@/components/ui/theme-text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { signInWithEmail } from '@/lib/auth/session';
import { formatAuthUserFacingError } from '@/lib/auth/auth-errors';
import { tokens } from '@/lib/theme/tokens';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const { error: authError } = await signInWithEmail({ email, password });
    setBusy(false);
    if (authError) {
      setError(formatAuthUserFacingError(authError));
      return;
    }
    router.replace('/(app)/(tabs)/dashboard');
  }

  return (
    <ScrollView contentContainerStyle={{ padding: tokens.space.lg, gap: tokens.space.md }}>
      <ThemeText variant="semibold" style={{ fontSize: tokens.text.lg }}>Sign in</ThemeText>
      <TextField placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextField placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      {error ? <ThemeText style={{ color: tokens.colors.danger }}>{error}</ThemeText> : null}
      <Button label={busy ? 'Signing in…' : 'Sign in'} disabled={busy} onPress={onSubmit} />
      <Link href="/(auth)/signup"><ThemeText variant="sm">Create an account</ThemeText></Link>
      <Link href="/(auth)/forgot-password"><ThemeText variant="sm">Forgot password?</ThemeText></Link>
    </ScrollView>
  );
}
```

- [ ] **Step 6: Implement the remaining auth screens**

Create `signup.tsx` mirroring `login.tsx`, calling `signUpWithEmail({ email, password, accountType, fullName })` where `accountType` comes from a two-button toggle (`personal` / `business`) and `fullName` from a "Full name" `TextField`. On success show "Check your email to confirm your account."
Create `forgot-password.tsx` calling `requestPasswordReset(email)` and showing a confirmation message.
Create `reset-password.tsx` prompting for a new password and calling `updatePassword(password)`, then `router.replace('/(auth)/login')`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test:mobile -- login.test`
Expected: PASS (1 test).

- [ ] **Step 8: Typecheck + commit**

```bash
npm run typecheck:mobile
git add apps/mobile
git commit -m "feat(mobile): auth screens and form primitives"
```

---

## Task 13: Account-aware workspace shell + tab navigation

**Files:**
- Create: `apps/mobile/src/app/(app)/_layout.tsx`, `apps/mobile/src/app/(app)/(tabs)/_layout.tsx`, `apps/mobile/src/app/(app)/(tabs)/dashboard.tsx`
- Test: `apps/mobile/src/app/(app)/__tests__/shell.test.tsx`

**Interfaces:**
- Consumes: Task 7 `getAccessibleView`/`getAccountTypeLabel`, Task 8 `navItemsFor`, Task 10 `useAuthStore` + `signOut`, Task 5 primitives.
- Produces: `(app)` shell layout that redirects to login when signed out and exposes the signed-in user; a tabs layout rendering the primary destinations (`dashboard`, `assistant`, `jobs`, `notifications`, `profile`) plus a "More" screen listing `navItemsFor(...)` filtered by `getAccessibleView`.

- [ ] **Step 1: Write the failing shell test**

Create `apps/mobile/src/app/(app)/__tests__/shell.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react-native';
import { navItemsFor } from '@/features/workspace/navigation';
import { getAccessibleView } from '@/features/workspace/account';

describe('shell nav', () => {
  it('lists only views accessible to the account', () => {
    const personal = navItemsFor('personal', false).map((i) => i.view);
    const permitted = personal.filter(
      (v) => getAccessibleView('personal', v) === v,
    );
    expect(permitted).toEqual(personal);
    expect(permitted).not.toContain('dispatch');
  });
});
```

- [ ] **Step 2: Implement `(app)/_layout.tsx`**

Create `apps/mobile/src/app/(app)/_layout.tsx`:
```tsx
import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuthStore } from '@/lib/auth/auth-store';

export default function AppLayout() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 3: Implement `(tabs)/_layout.tsx`**

Create `apps/mobile/src/app/(app)/(tabs)/_layout.tsx`:
```tsx
import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="assistant" options={{ title: 'AI' }} />
      <Tabs.Screen name="jobs" options={{ title: 'Jobs' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
```
Create minimal placeholder screens for `assistant.tsx`, `jobs.tsx`, `notifications.tsx`, `profile.tsx` (each renders `<ThemeView>` + a `<ThemeText>` title) so the tab bar resolves. Real content arrives in Phase 2+.

- [ ] **Step 4: Implement `dashboard.tsx`**

Create `apps/mobile/src/app/(app)/(tabs)/dashboard.tsx`:
```tsx
import { ScrollView } from 'react-native';
import { useAuthStore } from '@/lib/auth/auth-store';
import { ThemeView } from '@/components/ui/theme-view';
import { ThemeText } from '@/components/ui/theme-text';
import { getAccountTypeLabel } from '@/features/workspace/account';
import { tokens } from '@/lib/theme/tokens';

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);

  return (
    <ScrollView contentContainerStyle={{ padding: tokens.space.lg, gap: tokens.space.md }}>
      <ThemeText variant="semibold" style={{ fontSize: tokens.text.lg }}>
        {user ? `Welcome, ${user.name}` : 'Welcome'}
      </ThemeText>
      <ThemeView tone="card" style={{ padding: tokens.space.md }}>
        <ThemeText variant="sm">
          {user ? `${getAccountTypeLabel(user.accountType)} · ${user.company}` : ''}
        </ThemeText>
      </ThemeView>
    </ScrollView>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:mobile -- shell`
Expected: PASS (1 test).

- [ ] **Step 6: Typecheck + commit**

```bash
npm run typecheck:mobile
git add apps/mobile
git commit -m "feat(mobile): account-aware shell, tabs, and dashboard"
```

---

## Task 14: CI wiring — add mobile checks; replace Tauri Android job with EAS

**Files:**
- Modify: `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- Create: `apps/mobile/eas.json`

**Interfaces:**
- Consumes: the app from Tasks 1–13.
- Produces: `eas.json` with `development`/`preview`/`production` profiles; CI lint/typecheck/test for mobile; a release job that builds the Android AAB via EAS.

- [ ] **Step 1: Create `eas.json`**

Create `apps/mobile/eas.json`:
```json
{
  "cli": { "version": ">= 12.0.0", "appVersionSource": "remote" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal", "android": { "buildType": "apk" } },
    "production": {
      "autoIncrement": true,
      "android": { "buildType": "app-bundle" }
    }
  },
  "submit": { "production": {} }
}
```

- [ ] **Step 2: Add mobile steps to `ci.yml`**

In `.github/workflows/ci.yml`, add a job (or steps within the existing job) after the web checks:
```yaml
  mobile:
    name: Mobile checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: apps/mobile/package-lock.json
      - run: npm ci
        working-directory: apps/mobile
      - run: npm run lint
        working-directory: apps/mobile
      - run: npm run typecheck
        working-directory: apps/mobile
      - run: npm run test
        working-directory: apps/mobile
```
(If `apps/mobile/package-lock.json` does not exist because `--no-install` was used, run `npm install` once locally and commit the lockfile.)

- [ ] **Step 3: Replace the Tauri Android job in `release.yml`**

In `.github/workflows/release.yml`, delete the entire `build-android:` job (lines beginning `build-android:` through the end of that job) and add:
```yaml
  build-mobile:
    name: Mobile (Android via EAS)
    needs: cleanup-release
    if: ${{ needs.cleanup-release.result == 'success' || needs.cleanup-release.result == 'skipped' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: apps/mobile/package-lock.json
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: npm ci
        working-directory: apps/mobile
      - name: Build Android (production AAB)
        working-directory: apps/mobile
        run: eas build --platform android --profile production --non-interactive
      - name: Upload AAB to release
        if: startsWith(github.ref, 'refs/tags/v')
        shell: bash
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        working-directory: apps/mobile
        run: |
          url=$(eas build:list --platform android --limit 1 --json --non-interactive | jq -r '.[0].artifacts.buildUrl')
          curl -L -o sitesurveyor.aab "$url"
          gh release upload "$GITHUB_REF_NAME" sitesurveyor.aab --clobber
```
Leave all desktop (`build:`) jobs intact. Do **not** remove `ANDROID_KEYSTORE_*` secrets from settings (out of scope), but they are no longer referenced.

- [ ] **Step 4: Validate workflow YAML**

Run (if `actionlint` is available; otherwise skip with a note):
```bash
npx --yes actionlint .github/workflows/ci.yml .github/workflows/release.yml
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/eas.json .github/workflows/ci.yml .github/workflows/release.yml
git commit -m "ci(mobile): add EAS Android build and mobile checks; retire Tauri Android job"
```

---

## Task 15 (Optional, gated): NativeWind v5 evaluation

**Decision gate:** Only start if the spike is desired. If NativeWind v5 fails to install or typecheck, abandon and keep the Task 5 StyleSheet baseline. Do not block foundation on this.

**Files:**
- Modify: `apps/mobile/package.json`, `apps/mobile/babel.config.js`, `apps/mobile/metro.config.js`, `apps/mobile/src/app/_layout.tsx`
- Create: `apps/mobile/global.css`, `apps/mobile/nativewind-env.d.ts`

- [ ] **Step 1: Attempt the install (RC)**

```bash
cd apps/mobile && npm install --save-exact nativewind@5.0.0-rc.0 react-native-css@3.1.0-rc.0
npx expo install --dev tailwindcss@4.1.12 @tailwindcss/postcss@4.1.12 postcss lightningcss@1.30.1
```

- [ ] **Step 2: Gate on typecheck + existing tests**

Run:
```bash
npm run typecheck:mobile
npm run test:mobile
```
Expected: both pass with no changes to existing screens. If either fails and cannot be resolved quickly, **revert this task** (`git checkout -- apps/mobile`) and stop.

- [ ] **Step 3: Add `global.css` and wire Metro/Babel per NativeWind v5 docs**, import it in `_layout.tsx`, and add one `className` usage to `dashboard.tsx` (`<View className="p-4">`).

- [ ] **Step 4: Verify and commit (only if Step 2/3 pass)**

```bash
npm run typecheck:mobile && npm run test:mobile
git add apps/mobile
git commit -m "feat(mobile): adopt NativeWind v5 (Tailwind 4) styling"
```

---

## Self-Review

**Spec coverage:**
- §1 role/scope/integration/backend/build/payments → Tasks 1, 14 (build), CAD exclusion in Tasks 6–8.
- §2 stack → Tasks 1–5, 10–11, 15 (styling).
- §3 scope (all views minus CAD) → Tasks 6–8 provide the view model + nav; Phase 1 renders dashboard + placeholders (real view screens are Plans 2–4, as intended by decomposition).
- §4 directory structure → Tasks 1, 3–13.
- §5 data/auth/offline → Tasks 3, 10 (auth). Offline outbox is deferred to Plan 3 (records phase); noted as partial in spec.
- §6 AI assistant → Task 4 (streaming transport). Assistant UI = Plan 2.
- §7 payments → Plan 4 (out of scope for foundation).
- §8 design system → Task 5 (+ optional 15).
- §9 build/CI → Task 14.
- §10 testing/quality → Task 2 and per-task tests.
- §11 phasing → this is Phase 0 + Phase 1.
- §12 risks → captured in Task 15 gate and CI notes.

**Placeholder scan:** No "TBD/TODO". External values (EAS `projectId`, `EXPO_TOKEN`) are labeled as environment/secret inputs, not code placeholders. The default-workspace RPC in Task 10 Step 4 includes an explicit fallback instruction.

**Type consistency:** `UiUser`, `WorkspaceView`, `AppUserContext`, `ProfileRow`, `WorkspaceRow`, `WorkspaceMembershipSummary`, `AssistantEvent`, and `getAccessibleView`/`navItemsFor`/`mapAppUserToUiUser` signatures are defined once (Tasks 4, 6, 7, 8, 10) and reused consistently in Tasks 11–13.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-10-16-mobile-foundation.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
