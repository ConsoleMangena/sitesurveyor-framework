import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  hasPendingPasswordRecoverySession,
  onAuthStateChange,
} from "../../lib/auth/session";
import { isRecoveryArrivalUrl } from "../../lib/auth/auth-url";

/**
 * Routes a password-recovery arrival to `/reset-password`, whichever page it
 * lands on.
 *
 * A link requested inside the app carries `redirectTo: <origin>/reset-password`.
 * A link sent from the Supabase dashboard (or any direct API call) carries no
 * redirect target, so GoTrue falls back to the Site URL root and the session —
 * or the failure that explains an expired link — arrives on the landing page,
 * where nothing consumes it: the user is silently signed in and never sees the
 * password form.
 *
 * Two signals move the user, in the order they can appear:
 *
 * - the URL still holds the arrival (exchange not finished, or it failed), and
 * - `PASSWORD_RECOVERY` fires after the client exchanges the token, which can
 *   happen before this component mounts (buffered by `session.ts`) or after.
 *
 * Routes that already handle an auth arrival themselves — `/auth/callback`,
 * `/verify-email`, `/reset-password` — are left alone.
 */

const HANDLED_ROUTES = ["/reset-password", "/auth/callback", "/verify-email"];

export default function RecoveryRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Routes that already handle an auth arrival themselves.
    if (HANDLED_ROUTES.includes(location.pathname)) return;

    // 1. The arrival is still in the URL: move it before it can be missed.
    if (isRecoveryArrivalUrl()) {
      navigate(
        {
          pathname: "/reset-password",
          search: location.search,
          hash: location.hash,
        },
        { replace: true },
      );
      return;
    }

    // 2. The exchange finished before this component mounted; `session.ts`
    //    buffered the session. Do not consume it — the reset screen does.
    if (hasPendingPasswordRecoverySession()) {
      navigate("/reset-password", { replace: true });
      return;
    }

    // 3. The exchange finishes later. Subscribe before checking anything
    //    else so an event landing mid-effect is still caught.
    const subscription = onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        if (!HANDLED_ROUTES.includes(window.location.pathname)) {
          navigate("/reset-password", { replace: true });
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [location.pathname, location.search, location.hash, navigate]);

  return null;
}
