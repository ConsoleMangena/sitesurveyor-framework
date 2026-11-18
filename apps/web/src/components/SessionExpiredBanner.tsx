import { Clock, X } from "lucide-react";
import { useAuthStore } from "../lib/auth/auth-store";
import { Alert } from "./ui/alert";

export default function SessionExpiredBanner() {
  const sessionExpired = useAuthStore((s) => s.sessionExpired);
  const dismiss = useAuthStore((s) => s.dismissSessionExpired);

  if (!sessionExpired) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-4000 flex items-center justify-center px-3">
      <Alert
        variant="warning"
        aria-live="assertive"
        className="pointer-events-auto flex w-auto max-w-full items-center gap-2 rounded-full px-3 py-1.5 shadow-lg"
      >
        <span aria-hidden="true" className="shrink-0">
          <Clock size={14} />
        </span>
        <span className="font-medium">Session expired</span>
        <a
          href="/login"
          className="underline underline-offset-4 hover:text-foreground"
        >
          Sign in again
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="grid size-5 shrink-0 place-items-center rounded-full hover:bg-current/10"
        >
          <X size={12} aria-hidden="true" />
        </button>
      </Alert>
    </div>
  );
}
