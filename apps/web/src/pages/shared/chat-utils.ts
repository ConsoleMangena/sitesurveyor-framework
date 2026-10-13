import type { WorkspaceMemberWithProfile } from "@/lib/repositories/workspaceMembers";

export function truncatePreview(text: string): string {
  if (!text) return "No messages yet";
  return text.length > 40 ? text.slice(0, 40) + "…" : text;
}

export function filterMembers(members: WorkspaceMemberWithProfile[], search: string): WorkspaceMemberWithProfile[] {
  if (!search) return members;
  const q = search.toLowerCase();
  return members.filter((m) => {
    const display = m.full_name || m.email || m.user_id.slice(0, 8);
    return display.toLowerCase().includes(q);
  });
}

export interface MemberPreview {
  text: string;
  messageId: string | null;
}

export function deriveMemberPreviews(
  members: WorkspaceMemberWithProfile[],
  messages: { id: string; user_id: string; text: string; sent_at: string }[]
): Map<string, MemberPreview> {
  const map = new Map<string, MemberPreview>();
  for (const m of members) map.set(m.user_id, { text: "", messageId: null });

  const sorted = [...messages].sort(
    (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()
  );
  for (const msg of sorted) {
    const entry = map.get(msg.user_id);
    if (entry && entry.messageId === null) {
      entry.text = msg.text;
      entry.messageId = msg.id;
    }
  }
  return map;
}