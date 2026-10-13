/**
 * Edge Function: delete-user
 * ----------------------------
 * Permanently deletes the authenticated user's account and all data they own.
 *
 * Authorization: the caller must be a signed-in Supabase user.
 *
 * Behaviour:
 *   1. Refuses deletion if the user owns workspaces with other active or
 *      invited members (they must transfer ownership or delete those workspaces
 *      first).
 *   2. Deletes every workspace owned by the user. Because almost every other
 *      table references workspaces with `on delete cascade`, this removes the
 *      bulk of their data.
 *   3. Deletes the auth user, which cascades to `profiles`, `workspace_members`,
 *      `notifications`, and any remaining rows referencing `auth.users`.
 */

import { corsHeaders, json, adminClient, getCallerId } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const userId = await getCallerId(req);
  if (!userId) {
    return json({ error: "authentication required" }, 401);
  }

  const admin = adminClient();

  try {
    // Block deletion when the user owns workspaces that still have other
    // active or invited members, so team data isn't accidentally destroyed.
    const { data: blocking, error: blockingErr } = await admin
      .from("workspaces")
      .select("id, name, workspace_members!inner(user_id, status)")
      .eq("owner_user_id", userId)
      .neq("workspace_members.user_id", userId)
      .in("workspace_members.status", ["active", "invited"]);

    if (blockingErr) throw blockingErr;

    if (blocking && blocking.length > 0) {
      const names = blocking.map((w) => w.name).join(", ");
      return json(
        {
          error:
            `You own workspaces with other members: ${names}. ` +
            "Transfer ownership or delete those workspaces before deleting your account.",
        },
        409,
      );
    }

    // Delete every workspace the user owns. Cascading FKs clean up projects,
    // quotes, invoices, jobs, files metadata, marketplace listings, etc.
    const { error: workspacesErr } = await admin
      .from("workspaces")
      .delete()
      .eq("owner_user_id", userId);

    if (workspacesErr) throw workspacesErr;

    // Finally delete the auth user. This cascades to `profiles` and any other
    // rows still referencing `auth.users`.
    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr) throw authErr;

    return json({ success: true });
  } catch (e) {
    console.error("delete-user error:", e);
    return json({ error: (e as Error).message || "Account deletion failed" }, 500);
  }
});
