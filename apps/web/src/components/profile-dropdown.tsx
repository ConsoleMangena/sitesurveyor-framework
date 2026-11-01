import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CreditCard,
  LogOut,
  Settings,
  Store,
  User,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignOutDialog } from "@/components/sign-out-dialog";
import { useAuthStore } from "@/lib/auth/auth-store";
import { useMyAvatar } from "@/lib/hooks/useMyAvatar";
import { signOut as signOutSession } from "@/lib/auth/session";
import type { UiUser, WorkspaceView } from "@/features/workspace/types";

interface ProfileDropdownProps {
  user?: UiUser | null;
  onChangeView?: (view: WorkspaceView) => void;
  onLogout?: () => Promise<void> | void;
}

export function ProfileDropdown({
  user: userProp,
  onChangeView,
  onLogout: onLogoutProp,
}: ProfileDropdownProps) {
  const storeUser = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);
  const user = userProp ?? storeUser;

  const [signOutOpen, setSignOutOpen] = useState(false);
  const avatarUrl = useMyAvatar();

  if (!user) return null;

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U";

  const handleLogout = async () => {
    if (onLogoutProp) {
      await onLogoutProp();
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

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative size-8 rounded-full border border-border/60 hover:bg-accent"
            aria-label="User account menu"
          >
            <Avatar className="size-8 rounded-full">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={user.name} className="object-cover" />
              ) : null}
              <AvatarFallback className="rounded-full bg-muted text-xs font-semibold text-foreground">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold leading-none text-foreground truncate">
                {user.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user.email || "No email"}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {onChangeView ? (
              <DropdownMenuItem onClick={() => onChangeView("profile")}>
                <User className="me-2 size-4" />
                Profile
                <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
              </DropdownMenuItem>
            ) : null}
            {onChangeView ? (
              <DropdownMenuItem onClick={() => onChangeView("billing")}>
                <CreditCard className="me-2 size-4" />
                Billing
                <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
              </DropdownMenuItem>
            ) : null}
            {onChangeView ? (
              <DropdownMenuItem onClick={() => onChangeView("settings")}>
                <Settings className="me-2 size-4" />
                Settings
                <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem asChild>
              <Link to="/market">
                <Store className="me-2 size-4" />
                Public Market
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setSignOutOpen(true)}
            className="cursor-pointer"
          >
            <LogOut className="me-2 size-4" />
            Sign out
            <DropdownMenuShortcut className="text-current">
              ⇧⌘Q
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SignOutDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        onLogout={handleLogout}
      />
    </>
  );
}
