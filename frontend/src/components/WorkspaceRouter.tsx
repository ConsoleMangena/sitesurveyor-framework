import { lazy, Suspense } from "react";
import { useAuthStore } from "../lib/auth/auth-store";
import { signOut as signOutSession } from "../lib/auth/session";

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

  if (!user) return null;

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
        <PlatformOperatorWorkspaceShell user={user} onLogout={handleLogout} />
      ) : user.accountType === "business" ? (
        <BusinessWorkspaceShell user={user} onLogout={handleLogout} />
      ) : (
        <PersonalWorkspaceShell user={user} onLogout={handleLogout} />
      )}
    </Suspense>
  );
}
