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
    // Under Vite 8 (rolldown-vite) + Vitest 4 the default `forks`/`threads`
    // pool fails to initialise the worker runner state before test
    // collection, so every `describe()` throws "Cannot read properties of
    // undefined (reading 'config')" and zero tests run. The `vmThreads`
    // pool sets up the runner correctly. Revisit once Vitest fully supports
    // the Vite 8 module runner in the default pool.
    pool: 'vmThreads',
  },
})
