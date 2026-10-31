import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  ChevronsUpDown,
  Info,
  LogOut,
  Store,
} from "lucide-react";

import { DialogTemplate } from "@/components/templates/DialogTemplate";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { UiUser } from "@/features/workspace/types";
import { useMyAvatar } from "@/lib/hooks/useMyAvatar";

type NavUserProps = {
  user: UiUser;
  accountLabel: string;
  onProfile: () => void;
  onLogout: () => Promise<void> | void;
};

export function NavUser({
  user,
  accountLabel,
  onProfile,
  onLogout,
}: NavUserProps) {
  const { isMobile } = useSidebar();
  const [showAbout, setShowAbout] = useState(false);
  const avatarUrl = useMyAvatar();
  const initial = user.name.charAt(0).toUpperCase();

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <Avatar className="size-8 rounded-lg">
                  {avatarUrl ? (
                    <AvatarImage
                      src={avatarUrl}
                      alt={user.name}
                      className="size-full object-cover"
                    />
                  ) : null}
                  <AvatarFallback className="rounded-lg bg-muted text-foreground text-xs font-semibold">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-semibold">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
                <ChevronsUpDown className="ms-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
                  <Avatar className="size-8 rounded-lg">
                    {avatarUrl ? (
                      <AvatarImage
                        src={avatarUrl}
                        alt={user.name}
                        className="size-full object-cover"
                      />
                    ) : null}
                    <AvatarFallback className="rounded-lg bg-muted text-foreground text-xs font-semibold">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-start text-sm leading-tight">
                    <span className="truncate font-semibold">{user.name}</span>
                    <span className="truncate text-xs">{user.email}</span>
                    <Badge
                      variant={user.accountType === "business" ? "default" : "secondary"}
                      className="mt-1 w-fit text-[10px]"
                    >
                      {accountLabel}
                    </Badge>
                  </div>
                </div>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onProfile}>
                  <BadgeCheck />
                  Edit profile
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/market">
                    <Store />
                    Public market
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => setShowAbout(true)}>
                <Info />
                About
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                variant="destructive"
                onClick={() => void onLogout()}
              >
                <LogOut />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
