import { Clock } from "lucide-react";
import { useAuthStore } from "../lib/auth/auth-store";
import ErrorNotice from "./errors/ErrorNotice.tsx";

export default function SessionExpiredBanner() {
  const sessionExpired = useAuthStore((s) => s.sessionExpired);
  const dismiss = useAuthStore((s) => s.dismissSessionExpired);

  if (!sessionExpired) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-4000 px-3 pt-[max(8px,env(safe-area-inset-top))]">
      <div className="pointer-events-auto mx-auto max-w-md">
        <ErrorNotice
          tone="warning"
          title="Session expired"
          icon={<Clock size={16} />}
          onDismiss={dismiss}
          action={
            <a
              href="/login"
              className="text-sm font-medium underline underline-offset-4 hover:text-foreground"
            >
              Sign in again
            </a>
          }
        >
          Sign in to continue where you left off.
        </ErrorNotice>
      </div>
    </div>
  );
}
