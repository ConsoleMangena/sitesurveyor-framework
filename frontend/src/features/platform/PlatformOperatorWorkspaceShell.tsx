import { useEffect, useMemo, useState } from "react";
import WorkspaceShell from "../../components/workspace/WorkspaceShell";
import { platformAdminNavGroup } from "../admin/adminNav.ts";
import {
  getAccessibleView,
  getWorkspaceShellAccountLabel,
} from "../workspace/account";
import { personalNavGroups } from "../personal/navigation";
import { renderPersonalView } from "../personal/viewRegistry";
import type { UiUser, WorkspaceView } from "../workspace/types";

interface PlatformOperatorWorkspaceShellProps {
  user: UiUser;
  onLogout: () => Promise<void> | void;
}

export default function PlatformOperatorWorkspaceShell({
  user,
  onLogout,
}: PlatformOperatorWorkspaceShellProps) {
  const storageKey = `sitesurveyor:lastView:platform:${user.workspaceId}`;
  const [currentView, setCurrentView] = useState<WorkspaceView>(() => {
    const saved = localStorage.getItem(storageKey) as WorkspaceView | null;
    if (saved) return saved;
    return user.isPlatformAdmin ? "admin_overview" : "dashboard";
  });
  const [isProjectFullscreen, setIsProjectFullscreen] = useState(false);

  const activeView = useMemo(
    () => getAccessibleView("personal", currentView, user.isPlatformAdmin),
    [currentView, user.isPlatformAdmin],
  );

  const navGroups = useMemo(() => {
    const allowed = new Set(
      personalNavGroups
        .flatMap((group) => group.items.map((item) => item.view))
        .filter(
          (view) =>
            getAccessibleView("personal", view, user.isPlatformAdmin) === view,
        ),
    );
    const personalFiltered = personalNavGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => allowed.has(item.view)),
      }))
      .filter((group) => group.items.length > 0);

    if (!user.isPlatformAdmin) return personalFiltered;

    const adminItems = platformAdminNavGroup.items.filter(
      (item) =>
        getAccessibleView("personal", item.view, user.isPlatformAdmin) ===
        item.view,
    );
    if (adminItems.length === 0) return personalFiltered;
    return [
      { ...platformAdminNavGroup, items: adminItems },
      ...personalFiltered,
    ];
  }, [user.isPlatformAdmin]);

  useEffect(() => {
    localStorage.setItem(storageKey, activeView);
  }, [activeView, storageKey]);

  const noticeBanner =
    user.isPlatformAdmin ? undefined : (
      <div className="hub-notice hub-notice-info" role="status">
        <span>
          Platform operator access is not enabled for your account yet. A
          SiteSurveyor administrator must grant platform operator privileges before
          system administration tools appear. You can still use survey tools in the
          workspace below.
        </span>
      </div>
    );

  return (
    <WorkspaceShell
      user={user}
      activeView={activeView}
      navGroups={navGroups}
      accountLabel={getWorkspaceShellAccountLabel(user)}
      noticeBanner={noticeBanner}
      isProjectFullscreen={isProjectFullscreen}
      onChangeView={setCurrentView}
      onLogout={onLogout}
    >
      {renderPersonalView(activeView, {
        user,
        onEnterFullscreenProject: () => setIsProjectFullscreen(true),
        onExitFullscreenProject: () => setIsProjectFullscreen(false),
      })}
    </WorkspaceShell>
  );
}
