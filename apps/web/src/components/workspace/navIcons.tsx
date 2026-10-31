import type { ReactNode } from "react";
import {
  Activity,
  Bell,
  Boxes,
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  FolderOpen,
  FolderTree,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  type LucideIcon,
  MessageSquare,
  Package,
  Settings,
  Shield,
  ShoppingBag,
  Store,
  User,
  UserPlus,
  Users,
} from "lucide-react";

/**
 * Maps the string icon keys used by `WorkspaceNavItem.icon` to Lucide icons.
 *
 * Keeping the map here (rather than inline SVG per icon) means the sidebar,
 * the command palette and any future surface all render the same glyph.
 */
const NAV_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  chat: MessageSquare,
  calendar: CalendarDays,
  clock: Clock,
  folder: FolderOpen,
  "file-manager": FolderTree,
  document: FileText,
  billing: CreditCard,
  people: Users,
  "person-plus": UserPlus,
  person: User,
  briefcase: Briefcase,
  marketplace: Store,
  shopping: ShoppingBag,
  asset: Package,
  shield: Shield,
  "admin-grid": LayoutGrid,
  activity: Activity,
  users: Users,
  building: Building2,
  clipboard: ClipboardList,
  key: KeyRound,
  notifications: Bell,
  settings: Settings,
  gauge: Gauge,
  boxes: Boxes,
};

export function getNavIcon(icon: string): ReactNode {
  if (icon === "bot") {
    // SiteSurveyor agent brand mark — the official logo instead of a glyph.
    return (
      <img
        src="/logo.svg"
        alt=""
        aria-hidden="true"
        className="size-4 shrink-0"
      />
    );
  }

  const Icon = NAV_ICONS[icon] ?? LayoutDashboard;
  return <Icon className="size-4" aria-hidden="true" />;
}
