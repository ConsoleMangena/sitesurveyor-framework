/// <reference types="vitest/config" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.VITEST ? [] : [nodePolyfills()]),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,json,woff2,webmanifest}',
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
            // Never cache authenticated Supabase API responses. Stale profile or
            // workspace data can keep the app in a false loading state.
            urlPattern: /^https:\/\/.+\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/.+\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-public-assets',
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
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
  // Root-relative base ensures deep routes (e.g. /market) resolve assets
  // properly on direct load or refresh on web/Render/Nginx.
  base: '/',

  // Host 0.0.0.0 allows mobile devices on the same Wi-Fi network to test the dev server.
  server: {
    host: true,
    port: 5174,
    strictPort: true,
  },

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
    // Component suites can exceed 5s on a cold CI runner while jsdom and
    // Leaflet/Router modules compile; 10s keeps slow machines honest without
    // hiding a genuinely stuck test.
    testTimeout: 10000,
    // Tests must run on a fresh clone without a .env file. The Supabase client
    // throws at module load when these are absent, so suites that import it
    // would otherwise fail before running. Values are inert placeholders —
    // no test should reach the network.
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? 'test-anon-key',
      VITE_SOLANA_CLUSTER: process.env.VITE_SOLANA_CLUSTER ?? 'devnet',
    },
    // `vmThreads` shares one realm between the jsdom globals and Node's
    // `TextEncoder`. The `forks` pool gives them different `Uint8Array`
    // constructors, and `tweetnacl` then rejects encoded input as
    // "unexpected type, use Uint8Array".
    pool: 'vmThreads',
    // vmThreads workers share one process heap, and v8 coverage data
    // accumulates across the run until CI workers die ("Maximum call stack
    // size exceeded", "Worker exited unexpectedly"). Fewer workers bounds the
    // concurrent VM count. Keep the parallel path: serial runs (maxWorkers 1
    // or fileParallelism false) skip per-file VM teardown and leak RTL's DOM
    // cleanup across files.
    maxWorkers: process.env.CI ? 2 : undefined,
    // One retry absorbs the rare runner hiccup on CI; local runs stay strict.
    retry: process.env.CI ? 1 : 0,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test-setup.ts',
        'src/test-shims/**',
        'src/lib/supabase/types.ts',
        'src/**/*.d.ts',
      ],
      // Floors only, set just under today's suite so they catch a real
      // regression without failing on normal churn. Raise them as the untested
      // page components gain tests.
      thresholds: {
        statements: 20,
        branches: 18,
        functions: 16,
        lines: 20,
      },
    },
  },
})
