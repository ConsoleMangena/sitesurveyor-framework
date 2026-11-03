import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, MailCheck, RefreshCw } from "lucide-react";
import AuthShell, { AuthMark } from "../../components/auth/AuthShell";
import { Button } from "../../components/ui/button";
import ErrorNotice from "../../components/errors/ErrorNotice";
import { resendVerification } from "../../lib/auth/email-auth.ts";
import { formatAuthUserFacingError } from "../../lib/auth/auth-errors.ts";

/**
 * The "we sent you a link" screen shown right after registration when the
 * project requires email confirmation.
 *
 * GoTrue rate-limits resends (60s by default), so the button locks itself
 * for a minute after each send rather than letting the user hammer it and
 * get an opaque 429.
 */
export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const email = params.get("email")?.trim().toLowerCase() ?? "";

  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);

  async function resend() {
    if (!email || cooldown > 0) return;
    setError(null);
    setSending(true);
    try {
      await resendVerification(email);
      setSent(true);
      setCooldown(60);
      const timer = window.setInterval(() => {
        setCooldown((current) => {
          if (current <= 1) {
            window.clearInterval(timer);
            return 0;
          }
          return current - 1;
        });
      }, 1000);
    } catch (err) {
      setError(
        formatAuthUserFacingError(err, "Could not resend the email. Please try again."),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthShell
      title="Verify your email"
      description="One click and you're in."
      footer={
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to sign in
        </Link>
      }
    >
      <div className="auth-content auth-note">
        <AuthMark>
          <MailCheck className="size-5" aria-hidden="true" />
        </AuthMark>

        <div className="auth-note-body">
          <h2 className="auth-note-title">Check your inbox</h2>

          {email ? (
            <p className="auth-note-lead">
              We sent a verification link to{" "}
              <span className="auth-value">{email}</span>.
            </p>
          ) : (
            <p className="auth-note-lead">
              We sent a verification link to your email address.
            </p>
          )}

          <p className="auth-note-fine">
            The link opens SiteSurveyor and signs you straight in. It expires
            after a short while — you can request another below.
          </p>
        </div>

        {error ? (
          <ErrorNotice tone="danger" onDismiss={() => setError(null)}>
            {error}
          </ErrorNotice>
        ) : null}

        {sent && !error ? (
          <p role="status" className="auth-status auth-status--sent">
            Sent! Check your inbox (and spam).
          </p>
        ) : null}

        <div className="auth-button-row">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => void resend()}
            disabled={!email || sending || cooldown > 0}
          >
            {sending ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                <span>Sending…</span>
              </>
            ) : cooldown > 0 ? (
              <>
                <RefreshCw className="size-4" aria-hidden="true" />
                <span>Resend available in {cooldown}s</span>
              </>
            ) : (
              <>
                <RefreshCw className="size-4" aria-hidden="true" />
                <span>Resend verification email</span>
              </>
            )}
          </Button>

          <Button type="button" variant="ghost" size="lg" className="w-full" asChild>
            <Link to="/login">
              <span>Use a different account</span>
            </Link>
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
