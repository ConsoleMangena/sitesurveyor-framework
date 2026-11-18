import { useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, ChevronsUpDown, Info, LogOut, Store } from "lucide-react";

import {
  AccountMenu,
  AccountMenuAvatar,
  AccountMenuItem,
} from "@/components/account-menu";
import { ConfigDrawer } from "@/components/config-drawer";
import { DialogTemplate } from "@/components/templates/DialogTemplate";
import { SignOutDialog } from "@/components/sign-out-dialog";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { getWorkspaceShellAccountLabel } from "@/features/workspace/account";
import { signOut as signOutSession } from "@/lib/auth/session";
import { useAuthStore } from "@/lib/auth/auth-store";
import { isDesktopShell } from "@/lib/platform";
import type { UiUser } from "@/features/workspace/types";

type NavUserProps = {
  user: UiUser;
  onProfile: () => void;
  onLogout: () => Promise<void> | void;
};

export function NavUser({ user, onProfile, onLogout }: NavUserProps) {
  const { isMobile, state, setOpenMobile } = useSidebar();
  const [showAbout, setShowAbout] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const setUser = useAuthStore((s) => s.setUser);
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);

  const handleLogout = async () => {
    if (onLogout) {
      await onLogout();
      return;
    }
    setAuthLoading(true);
    try {
      await signOutSession();
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleProfile = () => {
    setMobileMenuOpen(false);
    setOpenMobile(false);
    onProfile();
  };

  const handleMarket = () => {
    setMobileMenuOpen(false);
    setOpenMobile(false);
  };

  return (
    <>
      {isMobile ? (
        <div className="flex w-full flex-col">
          {/* Mobile inline dropup menu, directly in the sheet DOM to avoid portal/pointer-lock issues */}
          {mobileMenuOpen && (
            <div
              data-testid="mobile-user-dropup"
              className="mb-2 w-full rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2"
            >
              <div className="flex flex-col gap-1 border-b border-border/60 pb-2 px-1">
                <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email || "No email"}</p>
                <Badge
                  variant={user.accountType === "business" ? "default" : "secondary"}
                  className="w-fit text-[10px]"
                >
                  {getWorkspaceShellAccountLabel(user)}
                </Badge>
              </div>

              {/* Quick appearance and layout controls directly in the mobile sidebar */}
              <div className="flex items-center justify-between border-b border-border/60 py-2 px-1">
                <span className="text-xs font-medium text-muted-foreground">Appearance</span>
                <div className="flex items-center gap-1">
                  <ThemeToggle />
                  <ConfigDrawer />
                </div>
              </div>

              <div className="flex flex-col gap-0.5 pt-1.5">
                <button
                  type="button"
                  onClick={handleProfile}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-accent text-start transition-colors"
                >
                  <BadgeCheck className="size-4 shrink-0 text-muted-foreground" />
                  <span>Edit profile</span>
                </button>
                {!isDesktopShell() && (
                  <Link
                    to="/market"
                    onClick={handleMarket}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-accent text-start transition-colors"
                  >
                    <Store className="size-4 shrink-0 text-muted-foreground" />
                    <span>Surveyor's Market</span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setShowAbout(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-accent text-start transition-colors"
                >
                  <Info className="size-4 shrink-0 text-muted-foreground" />
                  <span>About</span>
                </button>
                <div className="my-1 border-t border-border/60" />
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setSignOutOpen(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 text-start transition-colors"
                >
                  <LogOut className="size-4 shrink-0" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}

          <SidebarMenuButton
            size="lg"
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-expanded={mobileMenuOpen}
            aria-label={`User account menu for ${user.name}`}
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <AccountMenuAvatar user={user} />
            <div className="grid flex-1 text-start text-sm leading-tight">
              <span className="truncate font-semibold">{user.name}</span>
              <span className="truncate text-xs">{user.email}</span>
            </div>
            <ChevronsUpDown className="ms-auto size-4" />
          </SidebarMenuButton>
        </div>
      ) : (
        <SidebarMenu>
          <SidebarMenuItem>
            <AccountMenu
              user={user}
              onLogout={onLogout}
              side={state === "collapsed" ? "right" : "top"}
              trigger={
                <SidebarMenuButton
                  size="lg"
                  aria-label={`User account menu for ${user.name}`}
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
                onClick={handleProfile}
              />
              {!isDesktopShell() && (
                <AccountMenuItem
                  icon={Store}
                  label="Surveyor's Market"
                  to="/market"
                  onClick={handleMarket}
                />
              )}
              <AccountMenuItem
                icon={Info}
                label="About"
                onClick={() => setShowAbout(true)}
              />
            </AccountMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      )}

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

      <SignOutDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        onLogout={handleLogout}
      />
    </>
  );
}
