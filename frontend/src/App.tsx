import { lazy, Suspense, useCallback, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import SplashScreen from "./components/SplashScreen";
import ErrorBoundary from "./components/ErrorBoundary";
import SessionExpiredBanner from "./components/SessionExpiredBanner";
import ProtectedRoute from "./components/ProtectedRoute";
import WorkspaceRouter from "./components/WorkspaceRouter";
import GlobalLoader from "./components/GlobalLoader";
import { EmbeddedWalletProvider } from "./features/solana/contexts/EmbeddedWalletContext.tsx";
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";

const PublicMarketPage = lazy(() => import("./pages/public/PublicMarketPage"));
import {
  getCurrentAppUserWithDiagnostics,
  type AppUserLoadDiagnostics,
} from "./lib/auth/app-user.ts";
import {
  getCurrentSession,
  loadStoredSession,
  onAuthStateChange,
} from "./lib/auth/session.ts";
import { isOnline } from "./lib/supabase/client.ts";

import {
  saveCachedUser,
  loadCachedUser,
  clearCachedUser,
} from "./lib/auth/authCache.ts";
import { mapAppUserToUiUser } from "./features/workspace/account.ts";
import { useAuthStore } from "./lib/auth/auth-store";

function anyFetchFailed(d: AppUserLoadDiagnostics): boolean {
  return (
    d.profileFetchFailed ||
    d.defaultWorkspaceFetchFailed ||
    d.workspacesFetchFailed
  );
}

function workspaceNotReadyMessage(diagnostics: AppUserLoadDiagnostics): string {
  if (anyFetchFailed(diagnostics)) {
    return (
      "We could not load your profile or workspace (connection or server error). " +
      "Check your network and try signing in again. If this continues, contact support."
    );
  }
  const base =
    "Your workspace is still being set up, or your account is missing a workspace. " +
    "Please try signing in again in a few seconds. " +
    "If this keeps happening, sign out and contact an administrator to verify your account in the database.";
  if (import.meta.env.DEV) {
    return `${base} (Dev: check Supabase profile.default_workspace_id and workspace_members.)`;
  }
  return base;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Four attempts with waits 0 / 400ms / 1s / 2s between rounds (handles trigger lag). */
async function mapUserWithRetries(): Promise<{
  user: ReturnType<typeof mapAppUserToUiUser>;
  diagnostics: AppUserLoadDiagnostics;
}> {
  const delaysBeforeRetryMs = [400, 1000, 2000];
  let lastDiagnostics: AppUserLoadDiagnostics = {
    profileFetchFailed: false,
    defaultWorkspaceFetchFailed: false,
    workspacesFetchFailed: false,
  };

  // When offline, don't waste time retrying network calls.
  if (!isOnline()) {
    const { context, diagnostics } = await getCurrentAppUserWithDiagnostics();
    lastDiagnostics = diagnostics;
    const mapped = mapAppUserToUiUser(context);
    return { user: mapped, diagnostics };
  }

  const attempts = 1 + delaysBeforeRetryMs.length;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      await sleep(delaysBeforeRetryMs[attempt - 1]);
    }

    const { context, diagnostics } = await getCurrentAppUserWithDiagnostics();
    lastDiagnostics = diagnostics;
    const mapped = mapAppUserToUiUser(context);
    if (mapped) {
      return { user: mapped, diagnostics };
    }
  }

  return { user: null, diagnostics: lastDiagnostics };
}

export default function App() {
  const { setUser, setLoading, setAuthLoading, setError, setSessionExpired } =
    useAuthStore();
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user);

  const isPasswordRecoveryLink = useCallback(() => {
    const search = window.location.search.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    return (
      search.includes("auth=reset-password") || hash.includes("type=recovery")
    );
  }, []);

  const syncUser = useCallback(async () => {
    try {
      let session = await getCurrentSession();
      if (!session && !isOnline()) {
        session = loadStoredSession();
      }
      if (!session) {
        clearCachedUser();
        setUser(null);
        setLoading(false);
        return;
      }

      const { user: mappedUser, diagnostics } = await mapUserWithRetries();
      if (mappedUser) {
        saveCachedUser(mappedUser);
        setUser(mappedUser);
      } else {
        const cached = loadCachedUser();
        if (cached && cached.id === session.user.id) {
          setUser(cached);
        } else {
          setError(workspaceNotReadyMessage(diagnostics));
          setUser(null);
        }
      }
    } catch (err) {
      setUser(null);
      setError(
        err instanceof Error
          ? err.message
          : "Unexpected error while loading your workspace.",
      );
    } finally {
      setLoading(false);
    }
  }, [setUser, setLoading, setError]);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      if (isPasswordRecoveryLink()) {
        window.history.replaceState({}, "", "/reset-password");
      }
      await syncUser();
    };

    void bootstrap();

    const subscription = onAuthStateChange((event) => {
      if (!isMounted) return;
      if (event === "PASSWORD_RECOVERY") {
        window.history.replaceState({}, "", "/reset-password");
        return;
      }
      if (event === "SIGNED_OUT") {
        if (!isOnline()) {
          // Ignore sign-out events triggered by failed token refresh while offline.
          return;
        }
        clearCachedUser();
        setSessionExpired(true);
        return;
      }
      if (event === "SIGNED_IN") {
        setSessionExpired(false);
        // Keep the full-screen loader visible while the profile and workspace
        // are fetched, so the login screen does not flash before the
        // authenticated workspace is ready.
        setAuthLoading(true);
        void syncUser().finally(() => setAuthLoading(false));
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [isPasswordRecoveryLink, syncUser, setSessionExpired, setAuthLoading]);

  if (isLoading) {
    return <SplashScreen onFinish={() => {}} />;
  }

  return (
    <ErrorBoundary>
      <GlobalLoader />
      <BrowserRouter>
        <SessionExpiredBanner />
        <Routes>
          <Route
            path="/login"
            element={
              user ? (
                <Navigate to="/" replace />
              ) : (
                <LoginPage />
              )
            }
          />
          <Route
            path="/signup"
            element={
              user ? (
                <Navigate to="/" replace />
              ) : (
                <SignupPage />
              )
            }
          />
          <Route
            path="/forgot-password"
            element={
              user ? (
                <Navigate to="/" replace />
              ) : (
                <ForgotPasswordPage />
              )
            }
          />
          <Route
            path="/reset-password"
            element={
              user ? (
                <Navigate to="/" replace />
              ) : (
                <ResetPasswordPage />
              )
            }
          />
          <Route
            path="/market"
            element={
              <Suspense fallback={<div className="min-h-screen bg-background" />}>
                <PublicMarketPage />
              </Suspense>
            }
          />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={
              <EmbeddedWalletProvider>
                <WorkspaceRouter />
              </EmbeddedWalletProvider>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
