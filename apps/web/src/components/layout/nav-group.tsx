import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { getNavIcon } from "@/components/workspace/navIcons";
import type {
  WorkspaceNavGroup,
  WorkspaceView,
} from "@/features/workspace/types";

type NavGroupProps = {
  group: WorkspaceNavGroup;
  activeView: WorkspaceView;
  onChangeView: (view: WorkspaceView) => void;
};

export function NavGroup({ group, activeView, onChangeView }: NavGroupProps) {
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      {group.label ? (
        <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      ) : null}
      <SidebarMenu>
        {group.items.map((item) => (
          <SidebarMenuItem key={item.view}>
            <SidebarMenuButton
              isActive={activeView === item.view}
              tooltip={item.label}
              onClick={() => {
                onChangeView(item.view);
                setOpenMobile(false);
              }}
            >
              {getNavIcon(item.icon)}
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
