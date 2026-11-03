import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, LogOut, ShieldCheck } from "lucide-react";
import AuthShell from "../../components/auth/AuthShell";
import AccountSecurity from "../../components/auth/AccountSecurity";
import { Button } from "../../components/ui/button";
import ErrorNotice from "../../components/errors/ErrorNotice";
import { getCurrentUser, signOut } from "../../lib/auth/session.ts";
import { useAuthStore } from "../../lib/auth/auth-store";

/**
 * `/account/security` — manage which credentials can sign you in.
 *
 * Reads the live user object rather than the mapped `UiUser` (which carries
 * no identities), and re-reads it after every link/unlink so the method list
 * reflects what Auth actually has on record.
 */
export default function AccountSecurityPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);
  const cachedUser = useAuthStore((s) => s.user);

  const [user, setUserObject] = useState<Awaited<ReturnType<typeof getCurrentUser>>>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const current = await getCurrentUser();
      if (!current) {
        navigate("/login", { replace: true });
        return;
      }
      setUserObject(current);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load your sign-in methods.",
      );
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void load();
    // Only on mount: later refreshes come from `onChanged`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    setAuthLoading(true);
    try {
      await signOut();
      setUser(null);
      navigate("/login", { replace: true });
    } finally {
      setAuthLoading(false);
    }
  }

  return (
    <AuthShell
      wide
      title="Account security"
      description="Choose how you sign in to SiteSurveyor."
      showBrand={false}
      footer={
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to workspace
        </Link>
      }
    >
      <div className="auth-content">
        <div className="auth-identity">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {cachedUser?.name || user?.user_metadata?.full_name || "Your account"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.email || "No email on record"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => void handleLogout()}
          >
            <LogOut className="size-3.5" />
            Sign out
          </Button>
        </div>

        {error ? (
          <ErrorNotice tone="danger" onDismiss={() => setError(null)}>
            {error}
          </ErrorNotice>
        ) : null}

        {loading || !user ? (
          <p role="status" className="auth-status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading your sign-in methods…
          </p>
        ) : (
          <div className="auth-slab">
            <h2 className="auth-section-head">
              <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
              How you sign in
            </h2>
            <div className="auth-slab-body">
              <AccountSecurity
                user={user}
                onChanged={async () => {
                  await load();
                }}
              />
            </div>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
