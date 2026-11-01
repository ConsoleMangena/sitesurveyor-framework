import { useState, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LogOut, type LucideIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignOutDialog } from "@/components/sign-out-dialog";
import { getWorkspaceShellAccountLabel } from "@/features/workspace/account";
import { useAuthStore } from "@/lib/auth/auth-store";
import { initialsOf } from "@/lib/initials";
import { useMyAvatar } from "@/lib/hooks/useMyAvatar";
import { signOut as signOutSession } from "@/lib/auth/session";
import type { UiUser } from "@/features/workspace/types";
import { cn } from "@/lib/utils";

/** Avatar used by every account-menu trigger. */
export function AccountMenuAvatar({
  user,
  className,
}: {
  user: UiUser;
  className?: string;
}) {
  const avatarUrl = useMyAvatar();

  return (
    <Avatar className={cn("size-8 shrink-0 rounded-full", className)}>
      {avatarUrl ? (
        <AvatarImage
          src={avatarUrl}
          alt={user.name}
          className="size-full object-cover"
        />
      ) : null}
      <AvatarFallback className="rounded-full bg-muted text-xs font-semibold text-foreground">
        {initialsOf(user.name)}
      </AvatarFallback>
    </Avatar>
  );
}

/** One menu row: leading icon, label, and either a route or a handler. */
export function AccountMenuItem({
  icon: Icon,
  label,
  to,
  onClick,
}: {
  icon: LucideIcon;
  label: ReactNode;
  to?: string;
  onClick?: () => void;
}) {
  if (to) {
    return (
      <DropdownMenuItem asChild>
        <Link to={to}>
          <Icon />
          {label}
        </Link>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem onClick={onClick} className="cursor-pointer">
      <Icon />
      {label}
    </DropdownMenuItem>
  );
}

interface AccountMenuProps {
  user: UiUser;
  /** Trigger element, rendered through `DropdownMenuTrigger asChild`. */
  trigger: ReactElement;
  /** Surface-specific rows, placed between the identity header and sign out. */
  children: ReactNode;
  /** Omitted on shells that own the session store sign-out. */
  onLogout?: () => Promise<void> | void;
  side?: "top" | "right" | "bottom" | "left";
}

export function AccountMenu({
  user,
  trigger,
  children,
  onLogout,
  side,
}: AccountMenuProps) {
  const setUser = useAuthStore((s) => s.setUser);
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);
  const [signOutOpen, setSignOutOpen] = useState(false);

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

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" side={side}>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col items-start gap-1.5">
              <p className="w-full truncate text-sm font-semibold leading-none text-foreground">
                {user.name}
              </p>
              <p className="w-full truncate text-xs text-muted-foreground">
                {user.email || "No email"}
              </p>
              <Badge
                variant={user.accountType === "business" ? "default" : "secondary"}
              >
                {getWorkspaceShellAccountLabel(user)}
              </Badge>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>{children}</DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            className="cursor-pointer"
            onClick={() => setSignOutOpen(true)}
          >
            <LogOut />
            Sign out
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
