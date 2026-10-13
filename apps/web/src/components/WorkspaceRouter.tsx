import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "../lib/auth/auth-store";
import { signOut as signOutSession } from "../lib/auth/session";
import { getAccessibleView } from "../features/workspace/account";
import {
  isWorkspaceView,
  type WorkspaceView,
} from "../features/workspace/types";

const PersonalWorkspaceShell = lazy(
  () => import("../features/personal/PersonalWorkspaceShell"),
);
const BusinessWorkspaceShell = lazy(
  () => import("../features/business/BusinessWorkspaceShell"),
);
const PlatformOperatorWorkspaceShell = lazy(
  () => import("../features/platform/PlatformOperatorWorkspaceShell"),
);

function ShellFallback() {
  return (
    <div className="shell-loading">
      <div className="shell-loading-spinner" />
    </div>
  );
}

export default function WorkspaceRouter() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);
  const [searchParams] = useSearchParams();

  const rawView = searchParams.get("view");
  const initialView: WorkspaceView | undefined =
    rawView !== null && isWorkspaceView(rawView) ? rawView : undefined;

  if (!user) return null;

  // Validate against the account type before seeding the shell: a caller must
  // not be able to force-open a view they aren't entitled to (e.g. via /?view=).
  const accountType =
    user.signupAccountType === "platform_admin" || user.accountType === "personal"
      ? "personal"
      : "business";
  const requestedView =
    initialView !== undefined &&
    getAccessibleView(accountType, initialView, user.isPlatformAdmin) === initialView
      ? initialView
      : undefined;

  const handleLogout = async () => {
    setAuthLoading(true);
    try {
      await signOutSession();
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <Suspense fallback={<ShellFallback />}>
      {user.signupAccountType === "platform_admin" ? (
        <PlatformOperatorWorkspaceShell
          user={user}
          onLogout={handleLogout}
          initialView={requestedView}
        />
      ) : user.accountType === "business" ? (
        <BusinessWorkspaceShell
          user={user}
          onLogout={handleLogout}
          initialView={requestedView}
        />
      ) : (
        <PersonalWorkspaceShell
          user={user}
          onLogout={handleLogout}
          initialView={requestedView}
        />
      )}
    </Suspense>
  );
}
