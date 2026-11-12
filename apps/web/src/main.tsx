import { Buffer } from 'buffer'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// @solana/web3.js (v1) expects Node's Buffer and `global` to exist. Polyfill
// them for the browser before any Solana code runs.
const globalAny = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer
  global?: unknown
}
if (typeof globalAny.Buffer === 'undefined') {
  globalAny.Buffer = Buffer
}
if (typeof globalAny.global === 'undefined') {
  globalAny.global = globalThis
}
import App from './App.tsx'
import { FontProvider } from './context/font-provider.tsx'
import { SolanaWalletProvider } from './features/phantom/SolanaWalletProvider.tsx'
import { registerSW } from 'virtual:pwa-register'
import { clearSiteData } from './lib/clearSiteData.ts'
import { isDesktopShell, isMobileShell } from './lib/platform.ts'
import { initTheme } from './lib/theme.ts'

// Apply the persisted/system theme before the first paint so there is no
// flash of the wrong color scheme (belt-and-braces next to the inline
// <head> script in index.html).
initTheme()

declare global {
  interface Window {
    clearSiteSurveyorCache?: () => Promise<void>
  }
}

// Register the generated service worker in production builds so the app shell
// (HTML, JS, CSS, assets) is cached for offline use.
//
// The desktop shell skips it: the app ships as an installer, so the service
// worker would only serve a stale bundle after an update — the installer
// already controls the version on disk.
if (import.meta.env.PROD && !isDesktopShell()) {
  registerSW({
    immediate: true,
    onOfflineReady() {
      console.info('[PWA] Ready to work offline')
    },
    onNeedRefresh() {
      // autoUpdate is enabled, so this callback is mainly for logging.
      console.info('[PWA] Update available, reloading next time')
    },
  })
}

// Expose a console helper for support / troubleshooting: running
// `await window.clearSiteSurveyorCache()` wipes PWA caches, IndexedDB,
// localStorage and service workers, then reloads to the login screen.
window.clearSiteSurveyorCache = () => clearSiteData()

// Mobile web builds can run edge-to-edge under the system status/navigation
// bars. Add a class so CSS can apply safe-area fallbacks on devices that do not
// expose env(safe-area-inset-*) values (common in older Android WebViews).
if (isMobileShell()) {
  document.documentElement.classList.add('mobile-build')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FontProvider>
      <SolanaWalletProvider>
        <App />
      </SolanaWalletProvider>
    </FontProvider>
  </StrictMode>,
)
