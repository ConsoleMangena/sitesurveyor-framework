# Mobile Marketplace and Auth Button Sizing

## Goal

Make prominent public marketplace and wallet-auth actions feel less oversized on
narrow mobile screens while preserving clear hierarchy, keyboard focus, and
comfortable touch targets for controls that are used like selectors.

## Scope

The change applies only below the existing mobile breakpoint and leaves desktop
styling unchanged:

- Public marketplace header `Sign in` action.
- Public marketplace `Browse the registry` action.
- Wallet-auth `Sign In` and `Create Account` tabs.
- Wallet-auth primary sign-in action.

Wallet-selection fields, wallet rows, icon-only controls, and dialog controls
remain comfortably tappable and are not globally reduced.

## Design

Use the existing namespaced CSS in `apps/web/src/styles/web3.css` and
`apps/web/src/styles/web3-auth.css`; no React markup or behavior changes are
needed. At the existing mobile breakpoint, reduce the prominent actions'
horizontal padding, visual height, corner radius, and typography enough to
avoid oversized controls on small screens. Preserve visible focus styles,
disabled states, loading content, and the existing color/gradient treatment.

The marketplace actions should remain inline where the current layout allows
it, while the auth action remains full-width only when required by its existing
layout and capped/compact where the current mobile rules already cap it.

## Validation

- Run the focused marketplace/auth test files if available.
- Run the web app typecheck or build to verify CSS and TypeScript integration.
- Confirm desktop rules are unchanged and mobile selectors affect only the
  scoped prominent actions.
