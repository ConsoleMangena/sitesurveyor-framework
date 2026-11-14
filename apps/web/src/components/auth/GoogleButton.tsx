import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { signInWithGoogle } from "../../lib/auth/oauth.ts";
import { formatAuthUserFacingError } from "../../lib/auth/auth-errors.ts";

export interface GoogleButtonProps {
  disabled?: boolean;
  /** Label for the link-a-Google variant on the account page. */
  label?: string;
  onStarted?: () => void;
}

/**
 * "Continue with Google" button. Starting OAuth navigates the browser away
 * to Google and back to `/auth/callback`, so the only states this component
 * owns are idle, submitting, and "could not start the redirect".
 */
export function GoogleButton({
  disabled,
  label = "Google",
  onStarted,
}: GoogleButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
      // Only reached when the redirect could not be performed.
      onStarted?.();
    } catch (err) {
      setError(formatAuthUserFacingError(err, "Could not start Google sign-in."));
    } finally {
      // If the redirect worked the page is already gone; resetting is a no-op.
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        disabled={disabled || busy}
        onClick={() => void start()}
      >
        {busy ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <GoogleIcon className="size-4" aria-hidden="true" />
        )}
        <span>{busy ? "Redirecting to Google…" : label}</span>
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Google four-colour mark, drawn inline so no extra asset has to ship. */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

export default GoogleButton;
