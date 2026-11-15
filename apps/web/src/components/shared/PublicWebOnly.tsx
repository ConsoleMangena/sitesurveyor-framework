import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { isDesktopShell } from '../../lib/platform'

/**
 * Public pages that only make sense in the browser — the marketing landing,
 * journal, help, contact, privacy and terms — are gated behind this guard.
 * In the desktop shell these routes redirect to the workspace instead.
 */
export function PublicWebOnly({ children }: { children: ReactNode }) {
  if (isDesktopShell()) {
    return <Navigate to="/workspace" replace />
  }
  return <>{children}</>
}
