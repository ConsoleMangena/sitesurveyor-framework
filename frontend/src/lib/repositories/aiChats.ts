import { supabase } from "../supabase/client.ts";

/** A Datum/SiteSurveyor AI conversation owned by the signed-in account.
 *  `sessionKey` is the OpenClaw gateway session that backs the transcript.
 *  `context` separates CAD-workspace chats from dashboard chats. */
export type AiConversationContext = "dashboard" | "cad";

export interface AiConversation {
  id: string;
  title: string;
  session_key: string;
  context: string;
  created_at: string;
  updated_at: string;
}

export interface AiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export async function listAiConversations(
  context: AiConversationContext = "dashboard",
): Promise<AiConversation[]> {
  const { data, error } = await supabase
    .from("ai_conversations")
    .select("id, title, session_key, context, created_at, updated_at")
    .eq("context", context)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as AiConversation[];
}

/** Row-level security keys every row to auth.uid(); resolve it here so
 *  callers never have to pass it around. */
async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user)
    throw new Error("You must be signed in to use AI chats.");
  return data.user.id;
}

export async function createAiConversation(
  sessionKey: string,
  title = "New chat",
  context: AiConversationContext = "dashboard",
): Promise<AiConversation> {
  const user_id = await requireUserId();
  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({ title, session_key: sessionKey, user_id, context })
    .select("id, title, session_key, context, created_at, updated_at")
    .single();
  if (error) throw error;
  return data as AiConversation;
}

export async function renameAiConversation(
  id: string,
  title: string,
): Promise<void> {
  const { error } = await supabase
    .from("ai_conversations")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteAiConversation(id: string): Promise<void> {
  const { error } = await supabase
    .from("ai_conversations")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function listAiMessages(
  conversationId: string,
): Promise<AiMessage[]> {
  const { data, error } = await supabase
    .from("ai_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as AiMessage[];
}

export async function insertAiMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  if (!content.trim()) return;
  const user_id = await requireUserId();
  const { error } = await supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    role,
    content,
    user_id,
  });
  if (error) throw error;
}

/** Backfill a full transcript (e.g. from gateway history) in one go. */
export async function insertAiMessages(
  conversationId: string,
  messages: { role: "user" | "assistant"; text?: string; content?: string }[],
): Promise<void> {
  const user_id = await requireUserId();
  const rows = messages
    .map((m) => (m.content ?? m.text ?? "").trim())
    .filter((content) => content)
    .map((content, index) => ({
      conversation_id: conversationId,
      role: messages[index].role,
      content,
      user_id,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("ai_messages").insert(rows);
  if (error) throw error;
}

export async function touchAiConversation(id: string): Promise<void> {
  const { error } = await supabase
    .from("ai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
