/// <reference types="vitest/config" />
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import type { PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// wasm + top-level-await enable the lazy-loaded survey-wasm geometry module.
// The CAD bridge only imports it on demand, so it ships as a separate chunk and
// never affects the initial app bundle.
//
// They are loaded synchronously and only outside Vitest: the test runner does
// not bundle the WASM chunk (the bridge falls back to the pure-TS surface engine
// under test), and these plugins pull in build-only peers that need not be
// present for unit tests. This keeps `npm run test` fast and dependency-light
// while production `build`/`dev` get the optimised WebAssembly path.
function wasmPlugins(): PluginOption[] {
  if (process.env.VITEST) return []
  // On Tauri mobile the same Rust geometry code is already compiled into the
  // native backend commands, so the WASM bundle is pure duplication. Setting
  // VITE_DISABLE_WASM=true strips it from the frontend assets entirely.
  if (process.env.VITE_DISABLE_WASM === 'true') return []
  const require = createRequire(import.meta.url)
  const wasm = require('vite-plugin-wasm').default
  // Top-level-await plugin was wrapping chunks in async promises that broke
  // static imports (e.g. supabase-js createClient) and caused a blank screen.
  // wasm() is kept so Vite still bundles .wasm files loaded by the lazy CAD bridge.
  return [wasm()]
}

/**
 * When VITE_DISABLE_WASM is set, strip out the `import.meta.glob` loaders that
 * pull in `survey-wasm`. The CAD bridges already fall back to the pure-TypeScript
 * engines when no WASM is available, so runtime behaviour is unchanged.
 */
function disableWasmPlugin(): PluginOption {
  if (process.env.VITE_DISABLE_WASM !== 'true') return []
  return {
    name: 'disable-wasm',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('Bridge.ts')) return
      // Replace the glob with an empty object so Vite never creates a WASM chunk.
      return code.replace(
        /const wasmLoaders = import\.meta\.glob\(["'][^"']*survey_wasm\.js["']\)[^;]+;/,
        'const wasmLoaders = {};',
      )
    },
  }
}

/**
 * On mobile or CAD-disabled builds the heavy CadWorkspace module (and its
 * Three.js + WASM dependencies) should not be emitted. Intercept the lazy
 * import from ProjectHubPage and point it to a lightweight stub instead.
 *
 * CAD is enabled by default in development and in the Windows Tauri build.
 * Web / non-Windows production builds get the stub.
 */
function cadWorkspacePlatformPlugin(): PluginOption {
  const explicitlyEnabled = process.env.VITE_ENABLE_CAD === 'true'
  const explicitlyDisabled =
    process.env.VITE_DISABLE_CAD === 'true' ||
    process.env.VITE_MOBILE_BUILD === 'true'
  const enabled =
    explicitlyEnabled ||
    process.env.NODE_ENV === 'development' ||
    process.env.TAURI_ENV_PLATFORM === 'windows'
  if (enabled && !explicitlyDisabled) return []
  const stub = path.resolve(__dirname, './src/components/CadWorkspaceStub.tsx')
  return {
    name: 'cad-workspace-platform',
    enforce: 'pre',
    resolveId(id) {
      // Intercept the lazy CadWorkspace import from ProjectHubPage.
      if (id === '../../features/projects/components/CadWorkspace.tsx') {
        return stub
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills(),
    ...wasmPlugins(),
    disableWasmPlugin(),
    cadWorkspacePlatformPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,json,woff2,webmanifest,wasm}',
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[^/]+\.(?:png|jpg|jpeg|svg|webp|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/.+\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-rest',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  // @solana/web3.js (v1) and its deps reference Node's `global`. Alias it to
  // globalThis so the browser bundle resolves it; `Buffer` is polyfilled in
  // src/main.tsx.
  define: {
    global: 'globalThis',
  },
  // Tauri loads index.html from the filesystem/custom protocol, so asset URLs
  // must be relative to that file rather than absolute from the origin root.
  base: './',

  // Tauri expects the dev server on port 5174. Prevent Vite from silently
  // picking a different port if 5174 is busy.
  server: {
    port: 5174,
    strictPort: true,
  },

  // WebAssembly and top-level await require a modern output target. The default
  // (es2020/chrome87) cannot transform the wrapper that vite-plugin-top-level-await
  // emits, so pin both the dependency-optimizer and the final build to es2022.
  build: {
    target: 'es2022',
    // Split heavy, rarely-changing vendor libraries into their own chunk so the
    // app code and the vendor code can be cached independently. This also keeps
    // any single chunk under the 500 kB warning threshold.
    rolldownOptions: {
      output: {
        // Rolldown (Vite 8) expects manualChunks as a function rather than the
        // object map Rollup used. Group heavy vendor libraries by id.
        manualChunks(id: string) {
          // Shared shadcn/ui wrappers: group them so every page does not embed
          // its own copy of Table, Dialog, Tabs, etc.
          if (/[\\/]src[\\/]components[\\/]ui[\\/]/.test(id)) {
            return 'ui-components'
          }

          if (!id.includes('node_modules')) return

          // Core React framework: always a single shared chunk.
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'vendor-react'
          }

          // Heavy third-party SDKs / UI primitives: keep them in dedicated
          // vendor chunks so they are not duplicated across every page chunk.
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (/@radix-ui|radix-ui/.test(id)) return 'vendor-radix'
          if (id.includes('lucide-react')) return 'vendor-lucide'
          if (id.includes('@solana')) return 'vendor-solana'
          if (/[\\/]node_modules[\\/]three/.test(id)) return 'vendor-three'
        },
      },
    },
  },
  optimizeDeps: { rolldownOptions: { transform: { target: 'es2022' } } },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Tests only: use @solana/web3.js' browser ESM build; the node CJS
      // build native-requires rpc-websockets, which ships a nested ESM-in-CJS
      // `uuid` copy Vitest cannot load. The ESM build's rpc-websockets import
      // goes through Vite resolution and lands on the stub below (unit tests
      // never open websocket subscriptions).
      ...(process.env.VITEST
        ? {
            '@solana/web3.js': path.resolve(
              __dirname,
              './node_modules/@solana/web3.js/lib/index.browser.esm.js',
            ),
            'rpc-websockets': path.resolve(
              __dirname,
              './src/test-shims/rpc-websockets.ts',
            ),
          }
        : {}),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // Under Vite 8 (rolldown-vite) + Vitest 4 the default `forks`/`threads`
    // pool fails to initialise the worker runner state before test
    // collection, so every `describe()` throws "Cannot read properties of
    // undefined (reading 'config')" and zero tests run. The `vmThreads`
    // pool sets up the runner correctly. Revisit once Vitest fully supports
    // the Vite 8 module runner in the default pool.
    pool: 'vmThreads',
  },
})
