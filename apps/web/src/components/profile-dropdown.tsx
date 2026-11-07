import { CreditCard, Settings, Store, User } from "lucide-react";

import { AccountMenu, AccountMenuAvatar, AccountMenuItem } from "@/components/account-menu";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth/auth-store";
import type { UiUser, WorkspaceView } from "@/features/workspace/types";

interface ProfileDropdownProps {
  user?: UiUser | null;
  onChangeView?: (view: WorkspaceView) => void;
  onLogout?: () => Promise<void> | void;
}

export function ProfileDropdown({
  user: userProp,
  onChangeView,
  onLogout,
}: ProfileDropdownProps) {
  const storeUser = useAuthStore((s) => s.user);
  const user = userProp ?? storeUser;

  if (!user) return null;

  return (
    <AccountMenu
      user={user}
      onLogout={onLogout}
      trigger={
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8 rounded-full border border-border/60 hover:bg-accent shrink-0"
          aria-label="User account menu"
        >
          <AccountMenuAvatar user={user} />
        </Button>
      }
    >
      {onChangeView ? (
        <AccountMenuItem
          icon={User}
          label="Profile"
          onClick={() => onChangeView("profile")}
        />
      ) : null}
      {onChangeView ? (
        <AccountMenuItem
          icon={CreditCard}
          label="Billing"
          onClick={() => onChangeView("billing")}
        />
      ) : null}
      {onChangeView ? (
        <AccountMenuItem
          icon={Settings}
          label="Settings"
          onClick={() => onChangeView("settings")}
        />
      ) : null}
      <AccountMenuItem icon={Store} label="Public Market" to="/market" />
    </AccountMenu>
  );
}
