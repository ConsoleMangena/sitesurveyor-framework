import { Buffer } from 'buffer'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const globalAny = globalThis as typeof globalThis & { Buffer?: typeof Buffer; global?: unknown }
if (typeof globalAny.Buffer === 'undefined') globalAny.Buffer = Buffer
if (typeof globalAny.global === 'undefined') globalAny.global = globalThis

import App from '../src/App.tsx'
import { FontProvider } from '../src/context/font-provider.tsx'
import { SolanaWalletProvider } from '../src/features/phantom/SolanaWalletProvider.tsx'
import { initTheme } from '../src/lib/theme.ts'

initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FontProvider>
      <SolanaWalletProvider>
        <App />
      </SolanaWalletProvider>
    </FontProvider>
  </StrictMode>,
)