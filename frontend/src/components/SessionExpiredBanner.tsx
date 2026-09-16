import { useAuthStore } from "../lib/auth/auth-store";
import "../styles/session-banner.css";

export default function SessionExpiredBanner() {
  const sessionExpired = useAuthStore((s) => s.sessionExpired);
  const dismiss = useAuthStore((s) => s.dismissSessionExpired);

  if (!sessionExpired) return null;

  return (
    <div className="session-banner" role="alert">
      <span className="session-banner-text">
        Your session has expired. Please{" "}
        <a href="/login" className="session-banner-link">
          sign in again
        </a>
        .
      </span>
      <button
        type="button"
        className="session-banner-dismiss"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
