# SiteSurveyor Frontend

Frontend client for SiteSurveyor Framework, built with React, TypeScript, and Vite.

## Scripts

- `npm run dev` - start local dev server.
- `npm run build` - type-check and build for production.
- `npm run lint` - run ESLint.
- `npm run test` - run unit tests with Vitest.
- `npm run preview` - preview production build.

## Environment

Create `frontend/.env` (see `.env.example`):

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
# Use one of the following from Project Settings → API (never the service_role key):
VITE_SUPABASE_ANON_KEY=your-anon-key
# or, if the dashboard only shows a publishable key:
# VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The shared client is [`src/lib/supabase/client.ts`](src/lib/supabase/client.ts).

## Key Folders

- `src/pages` - feature pages and route-level screens.
- `src/lib/repositories` - Supabase data access layer.
- `src/features` - workspace shells, navigation, and view registries.
- `src/components` - reusable UI building blocks.

## Testing

The frontend uses Vitest for lightweight unit coverage.
