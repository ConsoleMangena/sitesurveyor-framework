import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import AuthShell from "../../components/auth/AuthShell";
import { Button } from "../../components/ui/button";
import ErrorNotice from "../../components/errors/ErrorNotice";
import { getCurrentSession } from "../../lib/auth/session.ts";
import { ensureAccountProvisioned } from "../../lib/auth/provisioning.ts";
import { useAuthStore } from "../../lib/auth/auth-store";

type Phase = "working" | "needs-details" | "failed";

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
        setMessage(decodeURIComponent(urlError).replace(/\+/g, " "));
        return;
      }

      // Wait for the client to finish exchanging the token.
      for (let attempt = 0; attempt < 20; attempt++) {
        const session = await getCurrentSession();
        if (session?.user) {
          try {
            setAuthLoading(true);
            const outcome = await ensureAccountProvisioned(session.user);
            if (outcome.blocker === "DETAILS_REQUIRED") {
              setPhase("needs-details");
              setAuthLoading(false);
              return;
            }
            navigate("/", { replace: true });
          } catch (err) {
            setPhase("failed");
            setMessage(
              err instanceof Error
                ? err.message
                : "Your account could not be set up. Please try signing in again.",
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
      <div className="rounded-xl border bg-card/80 p-6 text-center shadow-sm backdrop-blur-sm">
        {phase === "working" ? (
          <p
            role="status"
            className="flex flex-col items-center gap-3 py-4 text-sm text-muted-foreground"
          >
            <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
            Verifying and loading your workspace…
          </p>
        ) : phase === "needs-details" ? (
          <>
            <span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldAlert className="size-5" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-semibold tracking-tight">
              A few details to finish
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              That sign-in didn&apos;t carry a name we can build your workspace
              from. Create the account once with your details and this method
              will work from then on.
            </p>
            <div className="mt-5">
              <Button asChild>
                <Link to="/signup">Finish setting up</Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert className="size-5" aria-hidden="true" />
            </span>
            <h2 className="text-lg font-semibold tracking-tight">
              Sign-in could not be completed
            </h2>
            <div className="mt-3 text-left">
              <ErrorNotice tone="danger">{message}</ErrorNotice>
            </div>
            <div className="mt-4">
              <Button asChild>
                <Link to="/login">Back to sign in</Link>
              </Button>
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}
