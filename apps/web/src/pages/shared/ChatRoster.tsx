import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import type { WorkspaceMemberWithProfile } from "@/lib/repositories/workspaceMembers";
import type { ChatMessage } from "@/lib/repositories/chat";
import { cn } from "@/lib/utils";
import {
  deriveMemberPreviews,
  filterMembers,
  truncatePreview,
  type MemberPreview,
} from "./chat-utils.ts";

function avatarBg(userId: string) {
  const colors = [
    "bg-sky-600", "bg-rose-600", "bg-emerald-600", "bg-amber-600",
    "bg-violet-600", "bg-pink-600", "bg-teal-600", "bg-indigo-600",
  ];
  let h = 0;
  for (const c of userId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function roleLabel(role?: string) {
  const map: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    ops_manager: "Ops Manager",
    finance: "Finance",
    sales: "Sales",
    technician: "Technician",
    viewer: "Viewer",
  };
  return map[role ?? ""] ?? "Team Member";
}

export interface ChatRosterProps {
  members: WorkspaceMemberWithProfile[];
  messages: ChatMessage[];
  search: string;
  onSearchChange: (q: string) => void;
  onJump: (messageId: string) => void;
  highlightedId: string | null;
}

export function ChatRoster({
  members,
  messages,
  search,
  onSearchChange,
  onJump,
  highlightedId,
}: ChatRosterProps) {
  const previews = useMemo(
    () =>
      deriveMemberPreviews(
        members,
        messages.map((m) => ({
          id: m.id,
          user_id: m.user_id ?? "",
          text: m.content,
          sent_at: m.created_at,
        })),
      ),
    [members, messages],
  );
  const filtered = useMemo(() => filterMembers(members, search), [members, search]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>Inbox</span>
          <span className="inline-flex items-center justify-center rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
            {members.length}
          </span>
        </div>
      </div>
      <div className="relative px-3 pb-2">
        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        </span>
        <Input
          placeholder="Search team..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 h-8 rounded-none"
        />
      </div>
      <ScrollArea className="flex-1">
        <div className="px-1.5 pb-3">
          {filtered.map((m) => {
            const p = previews.get(m.user_id) as MemberPreview | undefined;
            const hasMsg = p?.messageId != null;
            return (
              <button
                key={m.user_id}
                type="button"
                onClick={() => {
                  if (p?.messageId) onJump(p.messageId);
                }}
                disabled={!hasMsg}
                className={cn(
                  "w-full flex items-center gap-3 rounded-none px-2 py-2 text-left transition-colors",
                  hasMsg && "hover:bg-accent",
                  highlightedId && hasMsg && "bg-accent",
                )}
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className={cn("text-xs text-white", avatarBg(m.user_id))}>
                    {initials(m.full_name || m.email || m.user_id.slice(0, 8))}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">
                      {m.full_name || m.email || m.user_id.slice(0, 8)}
                    </span>
                    {p?.messageId && (
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {new Date(
                          messages.find((msg) => msg.id === p.messageId)?.created_at ?? ""
                        ).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-muted-foreground truncate">
                      {roleLabel(m.role)}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] truncate",
                        hasMsg ? "text-muted-foreground/80" : "text-muted-foreground italic",
                      )}
                    >
                      {hasMsg ? truncatePreview(p?.text ?? "") : "No messages yet"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}