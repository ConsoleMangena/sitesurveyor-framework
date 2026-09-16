import { useEffect, useMemo, useRef, useState } from "react";
import "../../styles/project-hub.css";
import { ChevronDown, Menu } from "lucide-react";
import { useServerStatus } from "../../lib/serverStatus.ts";
import { useOfflineSyncStatus } from "../../lib/hooks/useOfflineSyncStatus.ts";
import {
  useNotifications,
  type NotificationRow,
} from "../../lib/repositories/notifications.ts";
import { ThemeToggle } from "../theme/ThemeToggle.tsx";
import { isWorkspaceView } from "../../features/workspace/types.ts";
import type {
  AccountType,
  UiUser,
  WorkspaceNavGroup,
  WorkspaceView,
} from "../../features/workspace/types.ts";
import { Button } from "../ui/button.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar.tsx";
import { useMyAvatar } from "../../lib/hooks/useMyAvatar.ts";
import { Badge } from "../ui/badge.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet.tsx";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command.tsx";
import { DialogTemplate } from "../templates/DialogTemplate.tsx";

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

interface WorkspaceTopbarProps {
  user: UiUser;
  accountLabel: string;
  navGroups: WorkspaceNavGroup[];
  activeView: WorkspaceView;
  recentViews: WorkspaceView[];
  onProfile: () => void;
  onLogout: () => Promise<void> | void;
  onOpenMobileMenu: () => void;
  onChangeView: (view: WorkspaceView) => void;
}

interface WorkspaceSidebarProps {
  navGroups: WorkspaceNavGroup[];
  activeView: WorkspaceView;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onChangeView: (view: WorkspaceView) => void;
}

function DashboardIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function FileManagerIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <path d="M12 11v6" />
      <path d="M9 14l3 3 3-3" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function BillingIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function PersonPlusIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function MarketplaceIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 2L3 7v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-3-5z" />
      <line x1="3" y1="7" x2="21" y2="7" />
      <path d="M16 11a4 4 0 0 1-8 0" />
    </svg>
  );
}

function ShoppingIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function AssetIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a4 4 0 0 0-8 0v2" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function AdminGridIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" />
      <path d="M16 6h.01" />
      <path d="M8 10h.01" />
      <path d="M16 10h.01" />
      <path d="M8 14h.01" />
      <path d="M16 14h.01" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3-3.5 3.5Z" />
    </svg>
  );
}

function ChevronCollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        transform: collapsed ? "rotate(180deg)" : "none",
        transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      <polyline points="11 17 6 12 11 7" />
      <polyline points="18 17 13 12 18 7" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function AboutIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function getNavIcon(icon: string) {
  switch (icon) {
    case "dashboard":
      return <DashboardIcon />;
    case "bot":
      // SiteSurveyor agent brand mark — the official logo instead of a generic glyph.
      return (
        <img
          src="/logo.svg"
          alt=""
          aria-hidden="true"
          className="app-logo size-[17px] shrink-0"
        />
      );
    case "chat":
      return <ChatIcon />;
    case "calendar":
      return <CalendarIcon />;
    case "clock":
      return <ClockIcon />;
    case "folder":
      return <FolderIcon />;
    case "file-manager":
      return <FileManagerIcon />;
    case "document":
      return <DocumentIcon />;
    case "billing":
      return <BillingIcon />;
    case "people":
      return <PeopleIcon />;
    case "person-plus":
      return <PersonPlusIcon />;
    case "person":
      return <PersonIcon />;
    case "briefcase":
      return <BriefcaseIcon />;
    case "marketplace":
      return <MarketplaceIcon />;
    case "shopping":
      return <ShoppingIcon />;
    case "asset":
      return <AssetIcon />;
    case "shield":
      return <ShieldIcon />;
    case "admin-grid":
      return <AdminGridIcon />;
    case "activity":
      return <ActivityIcon />;
    case "users":
      return <UsersIcon />;
    case "building":
      return <BuildingIcon />;
    case "clipboard":
      return <ClipboardIcon />;
    case "key":
      return <KeyIcon />;
    case "notifications":
      return <BellIcon />;
    case "settings":
      return <SettingsIcon />;
    default:
      return <DashboardIcon />;
  }
}

interface SearchResult {
  view: WorkspaceView;
  label: string;
  icon: string;
  group?: string;
}

interface WorkspaceSearchProps {
  navGroups: WorkspaceNavGroup[];
  activeView: WorkspaceView;
  recentViews: WorkspaceView[];
  onChangeView: (view: WorkspaceView) => void;
}

function WorkspaceSearch({
  navGroups = [],
  activeView,
  recentViews = [],
  onChangeView,
}: WorkspaceSearchProps) {
  const [open, setOpen] = useState(false);

  const allItems = useMemo<SearchResult[]>(
    () =>
      navGroups.flatMap((group) =>
        (group.items ?? []).map((item) => ({
          view: item.view,
          label: item.label,
          icon: item.icon,
          group: group.label,
        })),
      ),
    [navGroups],
  );

  const recentResults = useMemo<SearchResult[]>(() => {
    return recentViews
      .map((view) => allItems.find((item) => item.view === view))
      .filter((item): item is SearchResult => Boolean(item))
      .slice(0, 4);
  }, [allItems, recentViews]);

  // Global keyboard shortcut: Ctrl/Cmd+K or "/" to focus search.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isShortcut =
        (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) ||
        (event.key === "/" &&
          !(event.target instanceof HTMLInputElement) &&
          !(event.target instanceof HTMLTextAreaElement));
      if (isShortcut) {
        event.preventDefault();
        setOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <button
        type="button"
        className="hub-search-trigger"
        onClick={() => setOpen(true)}
        title="Search (Ctrl + K)"
      >
        <SearchIcon />
        <span className="hub-search-trigger-text">Search...</span>
        <kbd className="hub-search-kbd">Ctrl K</kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {recentResults.length > 0 && (
            <CommandGroup heading="Recent">
              {recentResults.map((result) => (
                <CommandItem
                  key={`recent-${result.view}`}
                  onSelect={() => {
                    onChangeView(result.view);
                    setOpen(false);
                  }}
                >
                  <span className="mr-2 opacity-50 flex items-center justify-center w-4 h-4">{getNavIcon(result.icon)}</span>
                  <span>{result.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandGroup heading="All pages">
            {allItems.map((result) => (
              <CommandItem
                key={`all-${result.view}`}
                onSelect={() => {
                  onChangeView(result.view);
                  setOpen(false);
                }}
              >
                <span className="mr-2 opacity-50 flex items-center justify-center w-4 h-4">{getNavIcon(result.icon)}</span>
                <span>{result.label}</span>
                {result.group ? (
                  <span className="ml-auto text-muted-foreground text-xs">
                    {result.group}
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

interface WorkspaceNotificationsProps {
  workspaceId: string;
  onChangeView: (view: WorkspaceView) => void;
}

function getNotificationTargetView(notification: NotificationRow): WorkspaceView | null {
  const metadata = notification.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const view = (metadata as Record<string, unknown>).view;
  return isWorkspaceView(view) ? view : null;
}

function WorkspaceNotifications({ workspaceId, onChangeView }: WorkspaceNotificationsProps) {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, loading, error, markRead, markAllRead } =
    useNotifications(workspaceId);

  const onItemClick = (notification: NotificationRow) => {
    if (notification.status === "unread") void markRead(notification.id);
    const targetView = getNotificationTargetView(notification);
    if (targetView) onChangeView(targetView);
    setOpen(false);
  };

  const openNotificationsPage = () => {
    onChangeView("notifications");
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="hub-notif-btn"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <BellIcon />
          {unreadCount > 0 && (
            <span className="hub-notif-badge">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </SheetTrigger>

      <SheetContent side="right" className="w-[300px] sm:w-[400px] p-0 flex flex-col gap-0">
        <SheetHeader className="p-4 border-b flex-row justify-between items-center space-y-0">
          <SheetTitle
            className="text-base cursor-pointer hover:underline"
            onClick={openNotificationsPage}
          >
            Notifications
          </SheetTitle>
          {unreadCount > 0 && (
            <button
              type="button"
              className="text-xs text-primary hover:underline font-medium"
              onClick={() => void markAllRead()}
            >
              Mark all read
            </button>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">Loading...</div>
          ) : error ? (
            <div className="p-4 text-center text-destructive text-sm">{error}</div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2 text-sm">
              <BellIcon />
              <span>You're all caught up</span>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={`flex flex-col text-left p-4 border-b hover:bg-accent transition-colors ${
                    notification.status === "unread" ? "bg-muted/30" : ""
                  }`}
                  onClick={() => onItemClick(notification)}
                >
                  <div className="flex items-start gap-3 w-full">
                    {notification.status === "unread" && (
                      <span
                        className="mt-1.5 size-2 rounded-full bg-primary shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <div className="flex flex-col gap-1 flex-1 overflow-hidden">
                      <span className="font-medium text-sm leading-tight text-foreground">{notification.title}</span>
                      {notification.body && (
                        <span className="text-sm text-muted-foreground line-clamp-2 leading-snug">
                          {notification.body}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground mt-1">
                        {formatRelativeTime(notification.created_at)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="p-4 border-t bg-muted/10">
          <Button variant="outline" className="w-full" onClick={openNotificationsPage}>
            View all notifications
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function WorkspaceTopbar({
  user,
  accountLabel,
  navGroups = [],
  activeView,
  recentViews = [],
  onProfile,
  onLogout,
  onOpenMobileMenu,
  onChangeView,
}: WorkspaceTopbarProps) {
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const serverStatus = useServerStatus();
  const offlineSync = useOfflineSyncStatus();
  const avatarUrl = useMyAvatar();
  const accountClassName = useMemo<AccountType>(
    () => user.accountType,
    [user.accountType],
  );
  const statusLabel =
    serverStatus === "online"
      ? "Online"
      : serverStatus === "offline"
        ? "Offline"
        : "Checking...";

  const syncLabel =
    offlineSync.status === "idle"
      ? "Local ready"
      : offlineSync.status === "syncing"
        ? "Syncing..."
        : offlineSync.status === "error"
          ? "Sync error"
          : "Synced";

  return (
    <>
      <header className="hub-topbar">
        <div className="hub-topbar-left">
          <Button
            variant="ghost"
            size="icon"
            className="hub-mobile-menu-btn"
            onClick={onOpenMobileMenu}
            title="Toggle Menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <img src="/logo.svg" alt="SiteSurveyor" className="hub-logo" />
        </div>

        <WorkspaceSearch
          navGroups={navGroups}
          activeView={activeView}
          recentViews={recentViews}
          onChangeView={onChangeView}
        />

        <div className="hub-topbar-right">
          <ThemeToggle />

          <div
            className={`hub-status-pill ${serverStatus}`}
            aria-live="polite"
            aria-label={`Server status: ${statusLabel}`}
          >
            <span className="hub-status-dot" />
            <span>{statusLabel}</span>
          </div>

          <div
            className={`hub-status-pill ${offlineSync.status}`}
            aria-live="polite"
            aria-label={`Local sync: ${syncLabel}`}
            title={offlineSync.lastError ?? syncLabel}
          >
            <span className="hub-status-dot" />
            <span>{syncLabel}</span>
          </div>

          <WorkspaceNotifications workspaceId={user.workspaceId} onChangeView={onChangeView} />

          <DropdownMenu open={profileDropdownOpen} onOpenChange={setProfileDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={`hub-avatar-btn ${profileDropdownOpen ? "open" : ""}`}
                aria-label="Open account menu"
              >
                <Avatar className="hub-avatar-btn-avatar">
                  {avatarUrl && (
                    <AvatarImage
                      src={avatarUrl}
                      alt={user.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                  <AvatarFallback className="bg-muted text-foreground text-xs font-semibold">
                    {user.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="hub-avatar-name">{user.name}</span>
                <ChevronDown className="hub-avatar-chevron" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" forceMount className="hub-profile-dropdown">
              <div className="hub-profile-menu-header">
                <Avatar className="hub-profile-menu-avatar">
                  {avatarUrl && (
                    <AvatarImage
                      src={avatarUrl}
                      alt={user.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                  <AvatarFallback className="bg-muted text-foreground text-base font-semibold">
                    {user.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="hub-profile-menu-identity">
                  <span className="hub-profile-menu-name">{user.name}</span>
                  <span className="hub-profile-menu-email">{user.email}</span>
                  <Badge variant={accountClassName === "business" ? "default" : "secondary"} className="hub-profile-menu-badge">
                    {accountLabel}
                  </Badge>
                </div>
              </div>
              <DropdownMenuSeparator className="hub-profile-menu-divider" />
              <DropdownMenuItem className="hub-profile-menu-item" onClick={onProfile}>
                <EditIcon /> Edit Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator className="hub-profile-menu-divider" />
              <DropdownMenuItem className="hub-profile-menu-item" onClick={() => setShowAbout(true)}>
                <AboutIcon /> About
              </DropdownMenuItem>
              <DropdownMenuSeparator className="hub-profile-menu-divider" />
              <DropdownMenuItem
                className="hub-profile-menu-item hub-profile-menu-item-danger"
                onClick={async () => await onLogout()}
              >
                <LogoutIcon /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <DialogTemplate
        open={showAbout}
        onOpenChange={setShowAbout}
        title="SiteSurveyor"
        description="Version 2.0"
        size="md"
        footer={<Button className="w-full" onClick={() => setShowAbout(false)}>Close</Button>}
      >
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.svg" alt="SiteSurveyor Logo" className="h-16 w-auto" />
          <div className="w-full rounded-lg border bg-muted/40 p-4 text-center text-sm">
            A product of <strong>Eineva Incorporated</strong>
          </div>
        </div>
      </DialogTemplate>
    </>
  );
}

function WorkspaceSidebar({
  navGroups = [],
  activeView,
  collapsed,
  onToggleCollapsed,
  onChangeView,
}: WorkspaceSidebarProps) {
  return (
    <aside className={`hub-sidebar ${collapsed ? "collapsed" : ""}`}>
      <nav className="hub-sidebar-nav">
        {navGroups.map((group, groupIndex) => (
          <div
            className="hub-nav-group"
            key={`${group.label ?? "group"}-${groupIndex}`}
          >
            {group.label ? (
              <span className="hub-nav-label">{group.label}</span>
            ) : null}

            {(group.items ?? []).map((item) => (
              <button
                key={item.view}
                className={`hub-side-tab ${activeView === item.view ? "active" : ""}`}
                onClick={() => onChangeView(item.view)}
              >
                {getNavIcon(item.icon)}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <button
        className="hub-sidebar-toggle"
        onClick={onToggleCollapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <ChevronCollapseIcon collapsed={collapsed} />
        <span className="hub-sidebar-toggle-label">Collapse</span>
      </button>
    </aside>
  );
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [recentViews, setRecentViews] = useState<WorkspaceView[]>([]);

  // Track recently visited views (most recent first, deduped, capped at 5).
  useEffect(() => {
    const id = window.setTimeout(() => {
      setRecentViews((prev) =>
        prev[0] === activeView
          ? prev
          : [activeView, ...prev.filter((view) => view !== activeView)].slice(
              0,
              5,
            ),
      );
    }, 0);
    return () => window.clearTimeout(id);
  }, [activeView]);

  const shouldHideGlobalChrome =
    activeView === "projects" && isProjectFullscreen;

  return (
    <div className="hub-screen">
      {!shouldHideGlobalChrome && (
        <WorkspaceTopbar
          user={user}
          accountLabel={accountLabel}
          navGroups={navGroups}
          activeView={activeView}
          recentViews={recentViews.filter((view) => view !== activeView)}
          onProfile={() => onChangeView("profile")}
          onLogout={onLogout}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onChangeView={onChangeView}
        />
      )}

      {!shouldHideGlobalChrome && noticeBanner ? (
        <div className="hub-top-notice">{noticeBanner}</div>
      ) : null}

      <div className="hub-workspace">
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent
            side="left"
            className="w-[260px] overflow-y-auto px-0 pt-0 pb-[env(safe-area-inset-bottom)] sm:w-[280px]"
          >
            <SheetHeader className="border-b p-4 text-left">
              <SheetTitle>SiteSurveyor</SheetTitle>
            </SheetHeader>
            <nav className="hub-sidebar-nav p-4">
              {navGroups.map((group, groupIndex) => (
                <div className="hub-nav-group" key={`${group.label ?? "group"}-${groupIndex}`}>
                  {group.label ? <span className="hub-nav-label">{group.label}</span> : null}
                  {(group.items ?? []).map((item) => (
                    <button
                      key={item.view}
                      className={`hub-side-tab ${activeView === item.view ? "active" : ""}`}
                      onClick={() => {
                        onChangeView(item.view);
                        setMobileMenuOpen(false);
                      }}
                    >
                      {getNavIcon(item.icon)}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
 
        {!shouldHideGlobalChrome && (
          <WorkspaceSidebar
            navGroups={navGroups}
            activeView={activeView}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
            onChangeView={onChangeView}
          />
        )}

        <main
          className={`hub-main-content${
            shouldHideGlobalChrome ? " hub-main-content-fullscreen" : ""
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
