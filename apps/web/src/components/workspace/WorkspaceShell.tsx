import { useMemo } from "react";
import "../../styles/project-hub.css";

import { ConfigDrawer } from "@/components/config-drawer";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { Search } from "@/components/layout/search";
import { SkipToMain } from "@/components/layout/skip-to-main";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { WorkspaceNotifications } from "@/components/workspace/WorkspaceNotifications";
import { LayoutProvider } from "@/context/layout-provider";
import { SearchProvider } from "@/context/search-provider";
import type {
  UiUser,
  WorkspaceNavGroup,
  WorkspaceView,
} from "@/features/workspace/types";
import { getCookie } from "@/lib/cookies";

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
  const shouldHideGlobalChrome = activeView === "projects" && isProjectFullscreen;

  // Read once on mount: the sidebar primitive owns the cookie afterwards.
  const defaultSidebarOpen = useMemo(
    () => getCookie("sidebar_state") !== "false",
    [],
  );

  if (shouldHideGlobalChrome) {
    return (
      <div className="hub-screen">
        <main className="hub-main-content hub-main-content-fullscreen">
          {children}
        </main>
      </div>
    );
  }

  return (
    <SearchProvider
      navGroups={navGroups}
      activeView={activeView}
      onChangeView={onChangeView}
    >
      <LayoutProvider>
        <SidebarProvider defaultOpen={defaultSidebarOpen} className="hub-shell">
          <SkipToMain />
          <AppSidebar
            user={user}
            accountLabel={accountLabel}
            navGroups={navGroups}
            activeView={activeView}
            onChangeView={onChangeView}
            onProfile={() => onChangeView("profile")}
            onLogout={onLogout}
          />

          <SidebarInset className="flex h-svh flex-col overflow-hidden @container/content">
            <Header fixed>
              <Search />
              <div className="ms-auto flex items-center gap-1">
                <ThemeToggle />
                <WorkspaceNotifications
                  workspaceId={user.workspaceId}
                  onChangeView={onChangeView}
                />
                <ConfigDrawer />
              </div>
            </Header>

            {noticeBanner ? (
              <div className="shrink-0 px-4 pt-2">{noticeBanner}</div>
            ) : null}

            {/* `.hub-main-content` owns the page gutters, the fade-in and the
                scroll containment — same contract as the pre-sidebar shell. */}
            <Main fluid className="hub-main-content">
              {children}
            </Main>
          </SidebarInset>
        </SidebarProvider>
      </LayoutProvider>
    </SearchProvider>
  );
}
