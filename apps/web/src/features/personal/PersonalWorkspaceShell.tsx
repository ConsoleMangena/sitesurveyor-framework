import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import WorkspaceShell from "../../components/workspace/WorkspaceShell";
import { platformAdminNavGroup } from "../admin/adminNav.ts";
import {
  getAccessibleView,
  getWorkspaceShellAccountLabel,
} from "../workspace/account";
import { personalNavGroups } from "./navigation";
import { renderPersonalView } from "./viewRegistry";
import type { UiUser, WorkspaceView } from "../workspace/types";
import { isWorkspaceView } from "../workspace/types";

interface PersonalWorkspaceShellProps {
  user: UiUser;
  onLogout: () => Promise<void> | void;
  /** Validated view to open first (e.g. from a `/?view=professionals` deep
   *  link out of the public market); overrides the saved last view. */
  initialView?: WorkspaceView;
}

export default function PersonalWorkspaceShell({
  user,
  onLogout,
  initialView,
}: PersonalWorkspaceShellProps) {
  const storageKey = `sitesurveyor:lastView:personal:${user.workspaceId}`;
  const [searchParams, setSearchParams] = useSearchParams();
  const fallbackView = useMemo<WorkspaceView>(() => {
    if (initialView !== undefined) return initialView;
    const saved = localStorage.getItem(storageKey);
    return isWorkspaceView(saved) ? saved : "dashboard";
  }, [initialView, storageKey]);
  const routeView = searchParams.get("view");
  const currentView = isWorkspaceView(routeView) ? routeView : fallbackView;
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
    const base = personalNavGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => allowed.has(item.view)),
      }))
      .filter((group) => group.items.length > 0);

    if (!user.isPlatformAdmin) return base;

    const adminItems = platformAdminNavGroup.items.filter(
      (item) =>
        getAccessibleView("personal", item.view, user.isPlatformAdmin) ===
        item.view,
    );
    if (adminItems.length === 0) return base;
    return [...base, { ...platformAdminNavGroup, items: adminItems }];
  }, [user.isPlatformAdmin]);

  useEffect(() => {
    localStorage.setItem(storageKey, activeView);
    if (routeView !== activeView) {
      setSearchParams({ view: activeView }, { replace: true });
    }
  }, [activeView, routeView, setSearchParams, storageKey]);

  const navigate = (view: string, context?: Record<string, string>) => {
    if (!isWorkspaceView(view)) return;
    const accessibleView = getAccessibleView("personal", view, user.isPlatformAdmin);
    setIsProjectFullscreen(false);
    // Replace, rather than merge, context so ordinary navigation clears old EO routes.
    setSearchParams({ ...(accessibleView === view ? context : {}), view: accessibleView });
  };

  return (
    <WorkspaceShell
      user={user}
      activeView={activeView}
      navGroups={navGroups}
      accountLabel={getWorkspaceShellAccountLabel(user)}
      isProjectFullscreen={isProjectFullscreen}
      onChangeView={navigate}
      onLogout={onLogout}
    >
      {renderPersonalView(activeView, {
        user,
        isProjectFullscreen,
        onEnterFullscreenProject: () => setIsProjectFullscreen(true),
        onExitFullscreenProject: () => setIsProjectFullscreen(false),
        onNavigate: navigate,
      })}
    </WorkspaceShell>
  );
}
