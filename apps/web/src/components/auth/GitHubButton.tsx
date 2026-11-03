import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { signInWithGitHub } from "../../lib/auth/oauth.ts";
import { formatAuthUserFacingError } from "../../lib/auth/auth-errors.ts";

export interface GitHubButtonProps {
  disabled?: boolean;
  /** Label for the link-a-GitHub variant on the account page. */
  label?: string;
  onStarted?: () => void;
}

/**
 * "Continue with GitHub" button. Starting OAuth navigates the browser away
 * to GitHub and back to `/auth/callback`, so the only states this component
 * owns are idle, submitting, and "could not start the redirect".
 */
export function GitHubButton({
  disabled,
  label = "GitHub",
  onStarted,
}: GitHubButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGitHub();
      // Only reached when the redirect could not be performed.
      onStarted?.();
    } catch (err) {
      setError(formatAuthUserFacingError(err, "Could not start GitHub sign-in."));
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
          <GitHubIcon className="size-4" aria-hidden="true" />
        )}
        <span>{busy ? "Redirecting to GitHub…" : label}</span>
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** GitHub mark, drawn inline so no extra asset has to ship. */
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.2 11.39.6.11.82-.26.82-.58 0-.29-.01-1.05-.02-2.06-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.28 0 .32.21.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5Z" />
    </svg>
  );
}

export default GitHubButton;
