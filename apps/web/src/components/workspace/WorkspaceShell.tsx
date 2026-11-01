import { useMemo } from "react";

import { ConfigDrawer } from "@/components/config-drawer";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { Main } from "@/components/layout/main";
import { Search } from "@/components/layout/search";
import { SkipToMain } from "@/components/layout/skip-to-main";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ProfileDropdown } from "@/components/profile-dropdown";
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
      <div className="relative flex h-dvh flex-col overflow-hidden bg-background">
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
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
        <SidebarProvider defaultOpen={defaultSidebarOpen} className="bg-background">
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
              <div className="ms-auto flex items-center gap-1.5">
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

            {noticeBanner ? (
              <div className="shrink-0 px-4 pt-2">{noticeBanner}</div>
            ) : null}

            {/* The content column owns the page gutters, the scroll
                containment and the mobile safe-area fallback — the same
                contract the pre-sidebar shell had. */}
            <Main
              fluid
              className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-background px-4 pt-4 pb-[max(3.5rem,env(safe-area-inset-bottom,0px))] sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 lg:pb-16"
            >
              {children}
            </Main>
          </SidebarInset>
        </SidebarProvider>
      </LayoutProvider>
    </SearchProvider>
  );
}
