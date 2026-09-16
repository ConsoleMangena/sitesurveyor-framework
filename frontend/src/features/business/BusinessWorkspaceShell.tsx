import { useEffect, useMemo, useState } from "react";
import WorkspaceShell from "../../components/workspace/WorkspaceShell";
import { platformAdminNavGroup } from "../admin/adminNav.ts";
import {
  getAccessibleView,
  getWorkspaceShellAccountLabel,
} from "../workspace/account";
import type { UiUser, WorkspaceView } from "../workspace/types";
import { isWorkspaceView } from "../workspace/types";
import { businessNavGroups } from "./navigation";
import { renderBusinessView } from "./viewRegistry";

interface BusinessWorkspaceShellProps {
  user: UiUser;
  onLogout: () => Promise<void> | void;
}

export default function BusinessWorkspaceShell({
  user,
  onLogout,
}: BusinessWorkspaceShellProps) {
  const storageKey = `sitesurveyor:lastView:business:${user.workspaceId}`;
  const [currentView, setCurrentView] = useState<WorkspaceView>(() => {
    const saved = localStorage.getItem(storageKey);
    return isWorkspaceView(saved) ? saved : "dashboard";
  });
  const [isProjectFullscreen, setIsProjectFullscreen] = useState(false);

  const activeView = useMemo(
    () => getAccessibleView("business", currentView, user.isPlatformAdmin),
    [currentView, user.isPlatformAdmin],
  );

  const navGroups = useMemo(() => {
    const allowed = new Set(
      businessNavGroups
        .flatMap((group) => group.items.map((item) => item.view))
        .filter(
          (view) =>
            getAccessibleView("business", view, user.isPlatformAdmin) === view,
        ),
    );
    const base = businessNavGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => allowed.has(item.view)),
      }))
      .filter((group) => group.items.length > 0);

    if (!user.isPlatformAdmin) return base;

    const adminItems = platformAdminNavGroup.items.filter(
      (item) =>
        getAccessibleView("business", item.view, user.isPlatformAdmin) ===
        item.view,
    );
    if (adminItems.length === 0) return base;
    return [...base, { ...platformAdminNavGroup, items: adminItems }];
  }, [user.isPlatformAdmin]);

  useEffect(() => {
    localStorage.setItem(storageKey, activeView);
  }, [activeView, storageKey]);

  return (
    <WorkspaceShell
      user={user}
      activeView={activeView}
      navGroups={navGroups}
      accountLabel={getWorkspaceShellAccountLabel(user)}
      isProjectFullscreen={isProjectFullscreen}
      onChangeView={setCurrentView}
      onLogout={onLogout}
    >
      {renderBusinessView(activeView, {
        user,
        onEnterFullscreenProject: () => setIsProjectFullscreen(true),
        onExitFullscreenProject: () => setIsProjectFullscreen(false),
        onNavigate: (view) => setCurrentView(view as WorkspaceView),
      })}
    </WorkspaceShell>
  );
}
