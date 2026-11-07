# Contributing to SiteSurveyor

Thanks for helping improve SiteSurveyor. This repository is an Eineva Labs
open-source initiative; contributions are accepted under the [MIT License](LICENSE)
and are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

- Read [DESIGN.md](DESIGN.md) for the architecture and [SECURITY.md](SECURITY.md)
  for the trust boundaries. Changes that cross a workspace boundary, touch AI
  tool allowlists, or move data toward Solana need a security review.
- Keep product claims tied to implemented behaviour. If a feature is a target,
  say so the way the README does ("coming soon", "platform target").
- Never commit real credentials. `VITE_*` values are embedded in the browser
  bundle and must be treated as public; service-role keys, NVIDIA keys, PesePay
  secrets, and wallet seeds belong in server-side environment only.

## Local setup

```bash
npm install
npm --prefix apps/web install
cp apps/web/.env.example apps/web/.env
npm run dev
```

The web app runs at http://localhost:5174. A Supabase project with the
repository migrations applied is required for authenticated flows; the AI
features additionally need the `ai-chat` Edge Function or the optional
[AI gateway](ai-gateway/README.md).

## Checks

Run these before opening a pull request. CI runs the same set plus the engine,
MCP, Edge Function, and deterministic AI checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Useful extras:

```bash
npm run test:coverage        # coverage report + thresholds
npm run ai:skills-check      # deterministic AI skill router checks
npm run ai:memory-check      # deterministic AI memory checks
npm run ai:models-check      # model allowlist checks
npm run ai:rounds-check      # tool-round loop checks
```

The AI evaluation harness that calls a real model (`npm run ai:eval`) needs
`NVIDIA_API_KEY` and must run against non-production fixtures.

For the Python engine:

```bash
cd apps/engine
pip install -r requirements-dev.txt
pytest
```

## Database changes

- Add a new timestamped migration under `supabase/migrations/`; never edit an
  applied migration.
- Enable row-level security on new tables and add explicit policies. Prefer
  workspace-scoped predicates that match the existing migrations.
- `SECURITY DEFINER` functions must live behind `service_role` grants and carry
  a comment explaining why elevation is required.
- Add a SQL test under `supabase/tests/database/` when a policy or trigger
  encodes a security rule.

## Code style

- Match the surrounding structure and naming. The web app uses React 19 +
  TypeScript, Tailwind/Radix primitives, and repository modules under
  `apps/web/src/lib/repositories/`.
- Keep components in component files; put shared helpers in their own module.
  (`react-refresh/only-export-components` is enforced by ESLint.)
- Prefer `useEffect` for external synchronisation only; derive state during
  render where possible. The existing `react-hooks/set-state-in-effect`
  warnings are known debt — do not add new ones.
- Write tests next to the code they cover (`*.test.ts` / `*.test.tsx`). Tests
  must not require network access or real credentials.

## Commits and pull requests

- Keep commits focused and describe the behaviour change in the subject line.
- In the pull request, list the checks you ran and call out schema, security,
  or deployment changes.
- Update the relevant guide (`README.md`, `DESIGN.md`, `SECURITY.md`,
  `AUTHENTICATION.md`, `USER_GUIDE.md`) when a workflow or configuration changes.

## Reporting security issues

Do not open a public issue for a suspected vulnerability. Follow the reporting
guidance at the end of [SECURITY.md](SECURITY.md).
