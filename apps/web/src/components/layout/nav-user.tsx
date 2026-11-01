import { useState } from "react";
import { BadgeCheck, ChevronsUpDown, Info, Store } from "lucide-react";

import {
  AccountMenu,
  AccountMenuAvatar,
  AccountMenuItem,
} from "@/components/account-menu";
import { DialogTemplate } from "@/components/templates/DialogTemplate";
import { Button } from "@/components/ui/button";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { UiUser } from "@/features/workspace/types";

type NavUserProps = {
  user: UiUser;
  onProfile: () => void;
  onLogout: () => Promise<void> | void;
};

export function NavUser({ user, onProfile, onLogout }: NavUserProps) {
  const { isMobile } = useSidebar();
  const [showAbout, setShowAbout] = useState(false);

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <AccountMenu
            user={user}
            onLogout={onLogout}
            side={isMobile ? "bottom" : "right"}
            trigger={
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <AccountMenuAvatar user={user} />
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-semibold">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
                <ChevronsUpDown className="ms-auto size-4" />
              </SidebarMenuButton>
            }
          >
            <AccountMenuItem
              icon={BadgeCheck}
              label="Edit profile"
              onClick={onProfile}
            />
            <AccountMenuItem icon={Store} label="Public market" to="/market" />
            <AccountMenuItem
              icon={Info}
              label="About"
              onClick={() => setShowAbout(true)}
            />
          </AccountMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <DialogTemplate
        open={showAbout}
        onOpenChange={setShowAbout}
        title="SiteSurveyor"
        description="Version 2.0"
        size="md"
        footer={
          <Button className="w-full" onClick={() => setShowAbout(false)}>
            Close
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.svg" alt="SiteSurveyor logo" className="h-16 w-auto" />
          <div className="w-full rounded-lg border bg-muted/40 p-4 text-center text-sm">
            A product of <strong>Eineva Incorporated</strong>
          </div>
        </div>
      </DialogTemplate>
    </>
  );
}
