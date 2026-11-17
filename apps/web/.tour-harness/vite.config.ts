import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const here = path.dirname(fileURLToPath(import.meta.url))
const requireFromConfig = createRequire(import.meta.url)
const reactDir = path.dirname(requireFromConfig.resolve('react/package.json'))
const reactDomDir = path.dirname(requireFromConfig.resolve('react-dom/package.json'))
const fakeClient = path.resolve(here, 'fakeClient.ts')

export default defineConfig({
  root: here,
  plugins: [
    {
      name: 'tour-fake-supabase',
      enforce: 'pre',
      resolveId(source) {
        const s = source.replace(/\\/g, '/')
        if (s.endsWith('/supabase/client.ts')) return fakeClient
        return null
      },
    },
    react(),
    tailwindcss(),
    nodePolyfills(),
  ],
  define: { global: 'globalThis' },
  base: '/',
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    alias: {
      react: reactDir,
      'react-dom': reactDomDir,
      'react/jsx-runtime': path.join(reactDir, 'jsx-runtime.js'),
      'react/jsx-dev-runtime': path.join(reactDir, 'jsx-dev-runtime.js'),
      '@': path.resolve(here, '../src'),
    },
  },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
  preview: { port: 4175, strictPort: true },
})