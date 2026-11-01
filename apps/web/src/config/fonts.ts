/**
 * UI typefaces available in the appearance drawer, ported from the
 * shadcn-admin (satnaing) template.
 *
 * The first entry is the default. Each name generates a `font-<name>` class
 * (see `--font-*` in `src/index.css`) that `FontProvider` puts on `<html>`;
 * that class remaps `--font-app`, which every face in the app resolves
 * through — Tailwind's `font-sans`, the legacy `var(--sans)` / `var(--heading)`
 * consumers, and the document font alike.
 *
 * To add a typeface:
 * 1. Add its name here.
 * 2. Add the family to the `<link>` in `index.html`.
 * 3. Add `--font-<name>` to the `@theme inline` block in `src/index.css`.
 * 4. Add a `html.font-<name> { --font-app: var(--font-<name>) }` override there.
 */
export const fonts = ["inter", "manrope", "system"] as const;
