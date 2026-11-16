import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../lib/auth/auth-store";

export interface ProtectedRouteProps {
  /**
   * Admit a session that is signed in but not yet provisioned (a Google or
   * GitHub signup that still owes the onboarding survey). Used only by the
   * /onboarding route — every other protected route still needs a mapped
   * user, because they render inside a workspace that does not exist yet.
   */
  allowPendingOnboarding?: boolean;
}

export default function ProtectedRoute({
  allowPendingOnboarding = false,
}: ProtectedRouteProps) {
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const pendingOnboarding = useAuthStore((s) => s.pendingOnboarding);

  if (isLoading) return null;

  if (!user && !(allowPendingOnboarding && pendingOnboarding)) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
