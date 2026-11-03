import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import AuthShell, { AuthMark } from "../../components/auth/AuthShell";
import { Button } from "../../components/ui/button";
import ErrorNotice from "../../components/errors/ErrorNotice";
import { getCurrentSession } from "../../lib/auth/session.ts";
import {
  ProvisioningError,
  ensureAccountProvisioned,
} from "../../lib/auth/provisioning.ts";
import { formatAuthUserFacingError } from "../../lib/auth/auth-errors.ts";
import { githubEmailIsUsable } from "../../lib/auth/oauth.ts";
import { useAuthStore } from "../../lib/auth/auth-store";

type Phase = "working" | "needs-details" | "needs-email" | "failed";

/**
 * Landing point for every redirect-based flow: GitHub OAuth, email
 * verification links, and password-recovery links.
 *
 * The Supabase client exchanges the `?code=` / hash token in the URL as the
 * page loads (`detectSessionInUrl`), so all this screen does is wait for
 * that session, run the shared provisioning step the workspace mapper
 * requires, and then hand over. It never trusts query parameters as proof
 * of anything — only the resulting session counts.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);
  const [params] = useSearchParams();
  const [phase, setPhase] = useState<Phase>("working");
  const [message, setMessage] = useState<string | null>(null);
  const [emailWasPrivate, setEmailWasPrivate] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      // OAuth can return an error in the URL instead of a session.
      const urlError =
        params.get("error_description") ||
        params.get("error") ||
        params.get("error_code");
      if (urlError) {
        setPhase("failed");
        setMessage(
          formatAuthUserFacingError(
            decodeURIComponent(urlError).replace(/\+/g, " "),
            "Sign-in could not be completed. Please try signing in again.",
          ),
        );
        return;
      }

      // Wait for the client to finish exchanging the token.
      for (let attempt = 0; attempt < 20; attempt++) {
        const session = await getCurrentSession();
        if (session?.user) {
          try {
            setAuthLoading(true);
            await ensureAccountProvisioned(session.user);
            navigate("/", { replace: true });
          } catch (err) {
            // Sign-in itself worked; the account just still has gaps the
            // user can fill. `ensureAccountProvisioned` throws for both of
            // these, so branch on the blocker rather than the message.
            if (err instanceof ProvisioningError) {
              setAuthLoading(false);
              if (err.blocker === "EMAIL_REQUIRED") {
                setEmailWasPrivate(!githubEmailIsUsable(session.user));
                setPhase("needs-email");
                return;
              }
              if (err.blocker === "DETAILS_REQUIRED") {
                setPhase("needs-details");
                return;
              }
            }
            setPhase("failed");
            setMessage(
              formatAuthUserFacingError(
                err,
                "Your account could not be set up. Please try signing in again.",
              ),
            );
            setAuthLoading(false);
          }
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      setPhase("failed");
      setMessage(
        "We could not complete the sign-in. The link may have expired — request a new one and try again.",
      );
    })();
  }, [navigate, params, setAuthLoading]);

  return (
    <AuthShell
      title="Signing you in"
      description="Finishing your SiteSurveyor sign-in."
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
        {phase === "working" ? (
          <p role="status" className="auth-status">
            <Loader2
              className="size-5 animate-spin text-primary"
              aria-hidden="true"
            />
            Verifying and loading your workspace…
          </p>
        ) : phase === "needs-details" ? (
          <>
            <AuthMark>
              <ShieldAlert className="size-5" aria-hidden="true" />
            </AuthMark>

            <div className="auth-note-body">
              <h2 className="auth-note-title">A few details to finish</h2>
              <p className="auth-note-lead">
                That sign-in didn&apos;t carry a name we can build your
                workspace from. Create the account once with your details and
                this method will work from then on.
              </p>
            </div>

            <Button asChild>
              <Link to="/signup">Finish setting up</Link>
            </Button>
          </>
        ) : phase === "needs-email" ? (
          <>
            <AuthMark>
              <ShieldAlert className="size-5" aria-hidden="true" />
            </AuthMark>

            <div className="auth-note-body">
              <h2 className="auth-note-title">Add an email address</h2>
              <p className="auth-note-lead">
                {emailWasPrivate
                  ? "That GitHub account keeps its email address private, so SiteSurveyor has nothing to build your account around. Add one and this sign-in will work from then on."
                  : "SiteSurveyor couldn't read an email address off that sign-in, and it needs one for your account. Add one and this sign-in will work from then on."}
              </p>
            </div>

            <Button asChild>
              <Link to="/signup">Add an email address</Link>
            </Button>
          </>
        ) : (
          <>
            <AuthMark tone="danger">
              <ShieldAlert className="size-5" aria-hidden="true" />
            </AuthMark>

            <div className="auth-note-body">
              <h2 className="auth-note-title">
                Sign-in could not be completed
              </h2>
            </div>

            <ErrorNotice tone="danger">{message}</ErrorNotice>

            <Button asChild>
              <Link to="/login">Back to sign in</Link>
            </Button>
          </>
        )}
      </div>
    </AuthShell>
  );
}
