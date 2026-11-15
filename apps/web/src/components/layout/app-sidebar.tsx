import { Link } from "react-router-dom";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useLayout } from "@/context/layout-provider";
import type { UiUser, WorkspaceNavGroup, WorkspaceView } from "@/features/workspace/types";

import { NavGroup } from "./nav-group";
import { NavUser } from "./nav-user";

type AppSidebarProps = {
  user: UiUser;
  accountLabel: string;
  navGroups: WorkspaceNavGroup[];
  activeView: WorkspaceView;
  onChangeView: (view: WorkspaceView) => void;
  onProfile: () => void;
  onLogout: () => Promise<void> | void;
};

export function AppSidebar({
  user,
  accountLabel,
  navGroups,
  activeView,
  onChangeView,
  onProfile,
  onLogout,
}: AppSidebarProps) {
  const { collapsible, variant } = useLayout();

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/workspace">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg border bg-background">
                  <img src="/logo.svg" alt="" aria-hidden="true" className="size-5" />
                </div>
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {user.company || "SiteSurveyor"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {accountLabel}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group, index) => (
          <NavGroup
            key={`${group.label ?? "group"}-${index}`}
            group={group}
            activeView={activeView}
            onChangeView={onChangeView}
          />
        ))}
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} onProfile={onProfile} onLogout={onLogout} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
