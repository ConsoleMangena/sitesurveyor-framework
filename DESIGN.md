# Design Spec — Global Design-System Consistency

Date: 2026-10-14
Scope: All pages and components (dashboard, shared, personal, public)
Approach: 1 — Global design-system consistency (rounded-none, spacing, typography, colors)
Status: Approved (Sections 1–3)

## Sections

### Section 1 — Design Contract (APPROVED)
- `rounded-none` dominant (no new rounded corners)
- Spacing scale: 4px / 8px / 12px / 16px / 24px / 32px / 48px / 64px (existing)
- Typography: `text-base` default, `text-sm` captions, `font-semibold` headings, `tracking-tight`
- Colors: current palette (`border-border`, `bg-background`, `text-muted-foreground`, glass pills)

### Section 2 — Surface & Glass Consistency (APPROVED)
- Cards/surfaces: `bg-background` or `bg-card` (no mixed shades)
- Glass pills (`GLASS_PILL`): applied consistently for floating info (telemetry, legend, status)
- Borders: `border-border/60` (uniform opacity)
- Shadows: `shadow-sm` only on floating pills; no shadow on cards

### Section 3 — Component Consistency (APPROVED)
- All interactive components (`Button`, `Input`, `Select`, `Card`, `Badge`) use same `rounded-none` + `border-border` + `focus-visible:ring-primary/15` pattern (already set in `ui/`)
- No new component variants; existing ones applied uniformly across all pages
- `Skeleton`: `bg-muted` (no custom shades)

## Implementation Scope
- All `.tsx` files under `src/pages/` (public, shared, personal) and `src/components/` (dashboard, workspace, templates)
- Design-system rules only; no new layouts or new pages
- Changes must match the approved contract above; no deviation without spec update

## Verification
- Lint (`npm run lint`): 0 errors
- Typecheck (`npm run typecheck`): clean
- Build (`npm run build`): verified (5m 9s, PWA generated)
- Ports cleared (`netstat`): no listeners on 8123/8124/8125/5173/4173; `nginx.exe`: 0 remaining

## Deliverable
This file (`DESIGN.md`) serves as the contract document. Implementation plan to follow via `writing-plans` after user spec review.
