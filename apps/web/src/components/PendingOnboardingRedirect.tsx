import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../lib/auth/auth-store";

/**
 * Sends a signed-in-but-unprovisioned provider signup (Google/GitHub) to the
 * onboarding survey from wherever they are in the app.
 *
 * The signup trigger deliberately leaves these accounts without a workspace,
 * so they never map to a `user` and App.tsx cannot route them itself (it sits
 * outside the BrowserRouter). This component lives inside the router, watches
 * the store flag syncUser sets, and navigates once — including when the user
 * opens `/` or `/workspace` directly with a live session instead of arriving
 * through /auth/callback.
 */
export default function PendingOnboardingRedirect() {
  const pendingOnboarding = useAuthStore((s) => s.pendingOnboarding);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!pendingOnboarding) return;
    if (location.pathname === "/onboarding") return;
    navigate("/onboarding", { replace: true });
  }, [pendingOnboarding, location.pathname, navigate]);

  return null;
}
