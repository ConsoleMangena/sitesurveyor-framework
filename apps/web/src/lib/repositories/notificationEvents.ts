import { getCurrentUser } from "../auth/session.ts";
import { supabase } from "../supabase/client.ts";
import {
  createNotifications,
  type CreateNotificationInput,
} from "./notifications.ts";

/**
 * High-level, fire-and-forget notification emitters for key domain events.
 *
 * Notifications are a secondary effect: they must never break the action that
 * triggered them. Every emitter is wrapped so that any failure (RLS, network,
 * missing recipients) is logged and swallowed.
 */

async function emit(inputs: CreateNotificationInput[]): Promise<void> {
  if (inputs.length === 0) return;
  try {
    await createNotifications(inputs);
  } catch (error) {
    // Swallow: a failed notification should never surface to the user or
    // roll back the originating action.
    console.warn("Failed to create notifications", error);
  }
}

/**
 * Resolve workspace_member ids to their user ids, excluding the acting user so
 * people are not notified about their own actions.
 */
async function resolveMemberUserIds(
  memberIds: string[],
  excludeUserId: string | null,
): Promise<string[]> {
  if (memberIds.length === 0) return [];

  const { data, error } = await supabase
    .from("workspace_members")
    .select("user_id")
    .in("id", memberIds);

  if (error) {
    console.warn("Failed to resolve member user ids for notifications", error);
    return [];
  }

  const userIds = new Set(
    (data ?? [])
      .map((row) => row.user_id)
      .filter((id): id is string => Boolean(id) && id !== excludeUserId),
  );
  return [...userIds];
}

/** Notify members that they have been assigned to a job. */
export async function notifyJobAssigned(params: {
  workspaceId: string;
  memberIds: string[];
  jobTitle?: string | null;
  projectName?: string | null;
  assignmentId?: string;
}): Promise<void> {
  const user = await getCurrentUser();
  const recipientIds = await resolveMemberUserIds(
    params.memberIds,
    user?.id ?? null,
  );
  if (recipientIds.length === 0) return;

  const label =
    params.jobTitle ?? params.projectName ?? "a job";
  const context = params.projectName ? ` on ${params.projectName}` : "";

  await emit(
    recipientIds.map((userId) => ({
      workspaceId: params.workspaceId,
      userId,
      title: "New job assignment",
      body: `You've been assigned to ${label}${context}.`,
      metadata: {
        type: "job_assigned",
        assignment_id: params.assignmentId ?? null,
        view: "dispatch",
      },
    })),
  );
}

/** Notify the quote owner that their quote was accepted. */
export async function notifyQuoteAccepted(params: {
  workspaceId: string;
  ownerUserId: string | null;
  quoteNumber?: string | null;
  organizationName?: string | null;
  quoteId?: string;
}): Promise<void> {
  const user = await getCurrentUser();
  if (!params.ownerUserId || params.ownerUserId === user?.id) return;

  const quoteLabel = params.quoteNumber
    ? `Quote ${params.quoteNumber}`
    : "A quote";
  const client = params.organizationName
    ? ` by ${params.organizationName}`
    : "";

  await emit([
    {
      workspaceId: params.workspaceId,
      userId: params.ownerUserId,
      title: "Quote accepted",
      body: `${quoteLabel} was accepted${client}.`,
      metadata: {
        type: "quote_accepted",
        quote_id: params.quoteId ?? null,
        view: "quotes",
      },
    },
  ]);
}

/** Notify an existing user that they were invited to a workspace. */
export async function notifyWorkspaceInvitation(params: {
  workspaceId: string;
  invitedUserId: string;
  workspaceName?: string | null;
  role?: string | null;
}): Promise<void> {
  const user = await getCurrentUser();
  if (params.invitedUserId === user?.id) return;

  const place = params.workspaceName ?? "a workspace";
  const roleSuffix = params.role ? ` as ${params.role}` : "";

  await emit([
    {
      workspaceId: params.workspaceId,
      userId: params.invitedUserId,
      title: "Workspace invitation",
      body: `You've been invited to join ${place}${roleSuffix}.`,
      metadata: {
        type: "workspace_invitation",
        view: "team",
      },
    },
  ]);
}

/**
 * Throttle chat notifications: at most one per workspace per window from this
 * client, so an active conversation doesn't flood every member's bell with a
 * notification per message.
 */
const CHAT_NOTIFY_WINDOW_MS = 2 * 60 * 1000;
const lastChatNotifyAt = new Map<string, number>();

/** Notify other active workspace members about a new team chat message. */
export async function notifyChatMessage(params: {
  workspaceId: string;
  senderName: string;
  preview: string;
}): Promise<void> {
  const last = lastChatNotifyAt.get(params.workspaceId) ?? 0;
  if (Date.now() - last < CHAT_NOTIFY_WINDOW_MS) return;
  lastChatNotifyAt.set(params.workspaceId, Date.now());

  const user = await getCurrentUser();

  const { data: members, error } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", params.workspaceId)
    .eq("status", "active");

  if (error || !members || members.length === 0) return;

  const recipientIds = [
    ...new Set(
      members
        .map((m) => m.user_id)
        .filter((id): id is string => Boolean(id) && id !== user?.id),
    ),
  ];
  if (recipientIds.length === 0) return;

  const snippet =
    params.preview.length > 80
      ? `${params.preview.slice(0, 80)}…`
      : params.preview;

  await emit(
    recipientIds.map((userId) => ({
      workspaceId: params.workspaceId,
      userId,
      title: "New team chat message",
      body: `${params.senderName}: ${snippet}`,
      metadata: {
        type: "chat_message",
      },
    })),
  );
}

/** Notify seller workspace admins/managers about a new marketplace request. */
export async function notifyMarketplaceRequest(params: {
  sellerWorkspaceId: string;
  listingName: string;
  requesterName?: string | null;
  listingType?: string;
}): Promise<void> {
  const user = await getCurrentUser();

  // Find admin & manager members of the seller workspace
  const { data: members, error } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", params.sellerWorkspaceId)
    .in("role", ["admin", "ops_manager"])
    .eq("status", "active");

  if (error || !members || members.length === 0) return;

  const recipientIds = [
    ...new Set(
      members
        .map((m) => m.user_id)
        .filter((id): id is string => Boolean(id) && id !== user?.id),
    ),
  ];
  if (recipientIds.length === 0) return;

  const action = params.listingType === "hire" ? "hire" : "purchase";
  const who = params.requesterName || "Someone";

  await emit(
    recipientIds.map((userId) => ({
      workspaceId: params.sellerWorkspaceId,
      userId,
      title: "New marketplace request",
      body: `${who} wants to ${action} "${params.listingName}".`,
      metadata: {
        type: "marketplace_request",
        view: "marketplace",
      },
    })),
  );
}
