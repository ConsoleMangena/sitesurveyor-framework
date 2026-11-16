import { lazy, Suspense, useCallback, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import SplashScreen from "./components/SplashScreen";
import ErrorBoundary from "./components/ErrorBoundary";
import AppErrorPage from "./components/AppErrorPage";
import SessionExpiredBanner from "./components/SessionExpiredBanner";
import RecoveryRedirect from "./components/auth/RecoveryRedirect";
import ProtectedRoute from "./components/ProtectedRoute";
import WorkspaceRouter from "./components/WorkspaceRouter";
import GlobalLoader from "./components/GlobalLoader";
import OfflineStatusBanner from "./components/OfflineStatusBanner";
import { Toaster } from "./components/ui/sonner";
import SignInPage from "./pages/auth/SignInPage";
import SignUpPage from "./pages/auth/SignUpPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage";
import VerifyEmailPage from "./pages/auth/VerifyEmailPage";
import AuthCallbackPage from "./pages/auth/AuthCallbackPage";
import AccountSecurityPage from "./pages/auth/AccountSecurityPage";
import OnboardingPage from "./pages/auth/OnboardingPage";
import { AssistantProvider } from "./components/assistant/AssistantProvider.tsx";
import { useNoIndexAppRoutes } from "./hooks/useNoIndexAppRoutes.ts";

/** Keeps the signed-in routes out of the search index. */
function RouteRobots() {
  useNoIndexAppRoutes();
  return null;
}

const PublicMarketPage = lazy(() => import("./pages/public/PublicMarketPage"));
const PublicTransportPage = lazy(() => import("./pages/public/PublicTransportPage"));
const DownloadsPage = lazy(() => import("./pages/public/DownloadsPage"));
const AboutPage = lazy(() => import("./pages/public/AboutPage"));
const LandingPage = lazy(() => import("./pages/public/LandingPage"));
const JournalPage = lazy(() => import("./pages/public/JournalPage"));
const JournalPostPage = lazy(() => import("./pages/public/JournalPostPage"));
const HelpPage = lazy(() => import("./pages/public/HelpPage"));
const ContactPage = lazy(() => import("./pages/public/ContactPage"));
const PrivacyPage = lazy(() => import("./pages/public/PrivacyPage"));
const TermsPage = lazy(() => import("./pages/public/TermsPage"));

function lazyPublic(element: React.ReactNode) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      {element}
    </Suspense>
  );
}
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
import { installBodyPointerEventsGuard } from "./lib/ui/body-pointer-events.ts";

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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timeoutId); resolve(value); },
      (error) => { window.clearTimeout(timeoutId); reject(error); },
    );
  });
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

  const syncUser = useCallback(async () => {
    try {
      let session = await withTimeout(getCurrentSession(), 8000, "Session check");
      if (!session && !isOnline()) {
        session = loadStoredSession();
      }
      if (!session) {
        clearCachedUser();
        setUser(null);
        setLoading(false);
        return;
      }

      const { user: mappedUser, diagnostics } = await withTimeout(
        mapUserWithRetries(),
        10000,
        "Workspace loading",
      );
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
    // A modal that closes can leave <body> with pointer events disabled, which
    // freezes the whole UI until the page is reloaded.
    return installBodyPointerEventsGuard();
  }, []);

  useEffect(() => {
    let isMounted = true;

    void syncUser();

    const subscription = onAuthStateChange((event) => {
      if (!isMounted) return;
      if (event === "SIGNED_OUT") {
        if (!isOnline()) {
          // Ignore sign-out events triggered by failed token refresh while offline.
          return;
        }
        clearCachedUser();
        setSessionExpired(true);
        return;
      }
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        setSessionExpired(false);
        // SIGNED_IN fires as soon as SIWS succeeds, which is before signup
        // finishes writing the profile. USER_UPDATED runs after that write so
        // the session is mapped as a recognised account instead of bouncing
        // the user back to "wallet not recognised".
        setAuthLoading(true);
        void syncUser().finally(() => setAuthLoading(false));
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [syncUser, setSessionExpired, setAuthLoading]);

  if (isLoading) {
    return <SplashScreen hold />;
  }

  return (
    <ErrorBoundary>
      <GlobalLoader />
      <OfflineStatusBanner />
      <Toaster position="bottom-right" richColors closeButton />
      <BrowserRouter>
        <RecoveryRedirect />
        <RouteRobots />
        <AssistantProvider>
        <SessionExpiredBanner />
        <Routes>
          {/* Unified sign-in: email, GitHub, or hand off to the wallet page. */}
          <Route
            path="/login"
            element={
              user ? (
                <Navigate to="/workspace" replace />
              ) : (
                <SignInPage />
              )
            }
          />
          <Route
            path="/signup"
            element={
              user ? (
                <Navigate to="/workspace" replace />
              ) : (
                <SignUpPage />
              )
            }
          />
          <Route
            path="/forgot-password"
            element={
              user ? (
                <Navigate to="/workspace" replace />
              ) : (
                <ForgotPasswordPage />
              )
            }
          />
          {/* Reached from the emailed reset link; a session may already exist. */}
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          {/* OAuth + email-link landing point; provisioning runs inside. */}
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/onboarding" element={<OnboardingPage />} />
          </Route>
          <Route
            path="/auth/wallet"
            element={<Navigate to="/login" replace />}
          />
          <Route element={<ProtectedRoute />}>
            <Route path="/account/security" element={<AccountSecurityPage />} />
          </Route>
          <Route
            path="/market"
            element={lazyPublic(<PublicMarketPage />)}
          />
          <Route
            path="/transport"
            element={lazyPublic(<PublicTransportPage />)}
          />
          <Route
            path="/about"
            element={lazyPublic(<AboutPage />)}
          />
          <Route
            path="/downloads"
            element={lazyPublic(<DownloadsPage />)}
          />
          <Route path="/journal" element={lazyPublic(<JournalPage />)} />
          <Route path="/journal/:slug" element={lazyPublic(<JournalPostPage />)} />
          <Route path="/help" element={lazyPublic(<HelpPage />)} />
          <Route path="/contact" element={lazyPublic(<ContactPage />)} />
          <Route path="/privacy" element={lazyPublic(<PrivacyPage />)} />
          <Route path="/terms" element={lazyPublic(<TermsPage />)} />
          <Route
            path="/"
            element={lazyPublic(<LandingPage />)}
          />
          <Route element={<ProtectedRoute />}>
            <Route path="/workspace/*" element={
              <WorkspaceRouter />
            } />
            <Route path="*" element={<AppErrorPage kind="not-found" />} />
          </Route>
          <Route
            path="*"
            element={<Navigate to="/" replace />}
          />
        </Routes>
        </AssistantProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
