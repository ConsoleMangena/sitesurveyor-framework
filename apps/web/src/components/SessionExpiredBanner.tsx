import { Clock } from "lucide-react";
import { useAuthStore } from "../lib/auth/auth-store";
import ErrorNotice from "./errors/ErrorNotice.tsx";

export default function SessionExpiredBanner() {
  const sessionExpired = useAuthStore((s) => s.sessionExpired);
  const dismiss = useAuthStore((s) => s.dismissSessionExpired);

  if (!sessionExpired) return null;

  return (
    <div className="session-banner-wrap">
      <ErrorNotice
        tone="warning"
        title="Session expired"
        icon={<Clock size={16} />}
        onDismiss={dismiss}
        action={
          <a href="/login" className="error-notice-link">
            Sign in again
          </a>
        }
      >
        Your session has expired. Sign in to continue where you left off.
      </ErrorNotice>
    </div>
  );
}
