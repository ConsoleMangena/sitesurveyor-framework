/**
 * Runtime platform checks for the shells that wrap this frontend.
 *
 * The web app is the shared frontend: `apps/desktop` (Tauri) and `apps/mobile`
 * package the same bundle. Anything that only makes sense in a browser — the
 * service worker, install prompts, browser-only storage — must branch on the
 * host, not on the build flavour, so the same bundle works everywhere.
 */

/**
 * True when the app is running inside the Tauri desktop shell.
 *
 * Tauri injects `__TAURI_INTERNALS__` into the webview before any page script
 * runs, so it is the earliest reliable signal that the desktop shell owns the
 * window.
 */
export function isDesktopShell(): boolean {
  return (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in (window as unknown as Record<string, unknown>)
  )
}

/**
 * True when the app is running as an installed mobile app (`apps/mobile`).
 *
 * The mobile shell sets `VITE_MOBILE_BUILD` at build time because it cannot
 * inject an initialization script before the bundle loads.
 */
export function isMobileShell(): boolean {
  return import.meta.env.VITE_MOBILE_BUILD === 'true'
}

/**
 * The custom URL scheme the desktop shell registers with the operating system.
 *
 * Must match `plugins.deep-link.desktop.schemes` in the shell's
 * `tauri.conf.json`. The browser never navigates to it directly: a bridge page
 * on the hosted web origin forwards to it instead (see {@link authRedirectTo}).
 */
export const DESKTOP_DEEP_LINK_SCHEME = 'sitesurveyor'

/**
 * The segment every deep link carries before the app path.
 *
 * The OS hands the whole URL over as an argument, so the path has to be
 * unmistakable — the app cannot be addressed as `sitesurveyor://auth/callback`,
 * because the first segment of a custom-scheme URL is its host.
 */
export const DESKTOP_DEEP_LINK_PREFIX = `${DESKTOP_DEEP_LINK_SCHEME}://app`

/**
 * The origin of the hosted web build.
 *
 * The desktop shell finishes auth flows in the *system browser*. GoTrue only
 * redirects that browser to a URL the Supabase project allowlists, and the
 * shell's own origin — `http://tauri.localhost` — is one no browser can reach,
 * so it can never be allowlisted. The browser is therefore sent back to this
 * origin instead, where a bridge page hands the result to the app. See
 * `public/auth/desktop-bridge.js`.
 */
export function getPublicWebOrigin(): string {
  const envUrl = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim()
  if (envUrl) {
    return envUrl.replace(/\/+$/, '')
  }
  return 'https://sitesurveyor.tech'
}

/**
 * The bridge page that finishes each desktop auth flow, relative to
 * {@link getPublicWebOrigin}.
 *
 * One page per flow rather than one page that takes the destination as a
 * parameter: the destination is baked into the page, so a crafted link cannot
 * make the bridge forward somewhere unexpected. Both pages exist in
 * `apps/web/public/auth/`.
 */
const DESKTOP_BRIDGE_PAGE: Record<string, string> = {
  '/auth/callback': '/auth/desktop-callback.html',
  '/reset-password': '/auth/desktop-reset.html',
}

/**
 * Where a redirect-based auth flow should come back to.
 *
 * In the browser the flow returns to this origin, and the frontend routes on
 * from there.
 *
 * In the desktop shell the flow is completed by the system browser, which
 * cannot reach the app's window. The browser therefore returns to a bridge
 * page on the hosted web origin; that page forwards the URL to the
 * `sitesurveyor://` protocol, the operating system launches the app with it,
 * and the shell turns it back into an in-app path. The path is the same in
 * both cases — only the route in differs.
 *
 * @param path In-app path the flow should return to, e.g. `/auth/callback`.
 */
export function authRedirectTo(path: string): string {
  if (!isDesktopShell()) {
    return `${window.location.origin}${path}`
  }

  const appPath = path.startsWith('/') ? path : `/${path}`
  const bridgePage = DESKTOP_BRIDGE_PAGE[appPath]
  if (bridgePage) {
    return `${getPublicWebOrigin()}${bridgePage}`
  }

  // A flow without a bridge page can still try the protocol directly; it works
  // wherever the Supabase project allows the scheme.
  return `${DESKTOP_DEEP_LINK_PREFIX}${appPath}`
}
