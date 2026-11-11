import { useEffect, useMemo, useRef } from "react";

import { ConfigDrawer } from "@/components/config-drawer";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { Search } from "@/components/layout/search";
import { SkipToMain } from "@/components/layout/skip-to-main";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ProfileDropdown } from "@/components/profile-dropdown";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { WorkspaceNotifications } from "@/components/workspace/WorkspaceNotifications";
import { WorkspaceCredits } from "@/components/workspace/WorkspaceCredits";
import { LayoutProvider } from "@/context/layout-provider";
import { SearchProvider } from "@/context/search-provider";
import type {
  UiUser,
  WorkspaceNavGroup,
  WorkspaceView,
} from "@/features/workspace/types";
import { getCookie } from "@/lib/cookies";
import { cn } from "@/lib/utils";

interface WorkspaceShellProps {
  user: UiUser;
  activeView: WorkspaceView;
  navGroups: WorkspaceNavGroup[];
  accountLabel: string;
  /** Shown below the top bar (e.g. pending platform operator grant). */
  noticeBanner?: React.ReactNode;
  isProjectFullscreen?: boolean;
  onChangeView: (view: WorkspaceView) => void;
  onLogout: () => Promise<void> | void;
  children: React.ReactNode;
}

/**
 * Folds the dashboard sidebar while the Earth Observation engine is open, and
 * hands the reader their previous fold state back on the way out. The fold is
 * only entered once per visit, so a reader who deliberately re-expands the
 * sidebar mid-session is not fought over it.
 */
function FoldSidebarWhileActive({ active }: { active: boolean }) {
  const { open, setOpen } = useSidebar();
  const restoreToRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (active) {
      if (restoreToRef.current === null) restoreToRef.current = open;
      if (open) setOpen(false);
    } else if (restoreToRef.current !== null) {
      setOpen(restoreToRef.current);
      restoreToRef.current = null;
    }
  }, [active, open, setOpen]);

  return null;
}

export default function WorkspaceShell({
  user,
  activeView,
  navGroups = [],
  accountLabel,
  noticeBanner,
  isProjectFullscreen = false,
  onChangeView,
  onLogout,
  children,
}: WorkspaceShellProps) {
  const shouldHideGlobalChrome = (activeView === "projects" || activeView === "satellite") && isProjectFullscreen;

  // Read once on mount: the sidebar primitive owns the cookie afterwards.
  const defaultSidebarOpen = useMemo(
    () => getCookie("sidebar_state") !== "false",
    [],
  );

  // Keep ONE stable tree for both modes: swapping the whole return between a
  // bare `<main>` and the sidebar layout changed the root element type, which
  // made React unmount and remount `children`. That wiped ProjectHubPage's
  // `activeProjectId` state (its localStorage write effect never ran), so
  // "Open Project" always dropped the user back on the project list. Only the
  // chrome is toggled in place now — `children` never changes position.
  return (
    <SearchProvider
      navGroups={navGroups}
      activeView={activeView}
      onChangeView={onChangeView}
    >
      <LayoutProvider>
        <SidebarProvider
          defaultOpen={defaultSidebarOpen}
          className={cn(
            "bg-background",
            // Fullscreen project mode: the shell owns the viewport so the
            // page below can size and scroll itself.
            shouldHideGlobalChrome && "h-dvh min-h-0 overflow-hidden",
          )}
        >
          <FoldSidebarWhileActive active={activeView === "satellite"} />
          {shouldHideGlobalChrome ? null : <SkipToMain />}
          {shouldHideGlobalChrome ? null : (
            <AppSidebar
              user={user}
              accountLabel={accountLabel}
              navGroups={navGroups}
              activeView={activeView}
              onChangeView={onChangeView}
              onProfile={() => onChangeView("profile")}
              onLogout={onLogout}
            />
          )}

          <SidebarInset
            className={cn(
              "flex h-svh flex-col overflow-hidden @container/content",
              shouldHideGlobalChrome && "min-h-0 h-full",
            )}
          >
            {shouldHideGlobalChrome ? null : (
              <Header fixed>
                <Search />
                <div className="ms-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
                  <WorkspaceCredits
                    workspaceId={user.workspaceId}
                    onChangeView={onChangeView}
                  />
                  <ThemeToggle />
                  <WorkspaceNotifications
                    workspaceId={user.workspaceId}
                    onChangeView={onChangeView}
                  />
                  <ConfigDrawer />
                  <ProfileDropdown
                    user={user}
                    onChangeView={onChangeView}
                    onLogout={onLogout}
                  />
                </div>
              </Header>
            )}

            {noticeBanner && !shouldHideGlobalChrome ? (
              <div className="shrink-0 px-4 pt-2">{noticeBanner}</div>
            ) : null}

            {/* The content column owns the page gutters, the scroll
                containment and the mobile safe-area fallback — the same
                contract the pre-sidebar shell had. */}
            <Main
              fluid
              className={cn(
                "min-h-0 min-w-0 flex-1 bg-background",
                shouldHideGlobalChrome
                  ? "overflow-hidden"
                  : "overflow-y-auto px-4 pt-4 pb-[max(3.5rem,env(safe-area-inset-bottom,0px))] sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 lg:pb-16",
              )}
            >
              {children}
            </Main>
          </SidebarInset>
        </SidebarProvider>
      </LayoutProvider>
    </SearchProvider>
  );
}
