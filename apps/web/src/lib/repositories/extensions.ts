import { supabase } from "../supabase/client.ts";
import type { Tables } from "../supabase/types.ts";

export type WorkspaceExtensionRow = Tables<"workspace_extensions">;

/** What a workspace stores about one extension beyond on/off.
 *
 * A type alias, not an interface: Supabase's generated `Json` row type only
 * accepts an object with an implicit index signature, which interfaces do not
 * get.
 */
export type ExtensionConfig = { endpoint?: string };

interface PostgrestError {
  code?: string;
  message?: string;
  details?: string | null;
}

/**
 * True when the query failed because `workspace_extensions` is not in this
 * project yet — a fresh local database or a deployment that has not run
 * `npm run db:push`. Callers fall back to browser storage on this; every other
 * error is reported to the user instead of silently degrading.
 */
export function isMissingExtensionTable(error: unknown): boolean {
  const e = error as PostgrestError | null;
  if (!e) return false;
  return (
    e.code === "42P01" ||
    e.code === "PGRST202" ||
    e.code === "PGRST205" ||
    /workspace_extensions|relation|schema cache|could not find/i.test(
      e.message ?? "",
    )
  );
}

function normalizeWriteError(error: PostgrestError): Error {
  // RLS rejects a write from a member who is not owner/admin without naming the
  // policy, so translate the violation into the rule the user just hit.
  if (error.code === "42501") {
    return new Error(
      "Only a workspace owner or admin can change extensions. Ask one to install it for this workspace.",
    );
  }
  if (error.code === "23505") {
    return new Error("This extension is already registered for the workspace.");
  }
  return new Error(error.message || "Could not save the extension state.");
}

export async function listWorkspaceExtensions(
  workspaceId: string,
): Promise<WorkspaceExtensionRow[]> {
  const { data, error } = await supabase
    .from("workspace_extensions")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (error) throw error;
  return data ?? [];
}

/**
 * Create-or-update the one row that records this workspace's choice.
 *
 * Upsert rather than read-then-write because two tabs can toggle the same
 * extension at once, and the (workspace_id, extension_id) unique index is what
 * makes the second write land on the existing row instead of failing.
 */
export async function saveWorkspaceExtension(
  workspaceId: string,
  extensionId: string,
  patch: { installed: boolean; enabled: boolean; config: ExtensionConfig },
): Promise<WorkspaceExtensionRow> {
  const { data, error } = await supabase
    .from("workspace_extensions")
    .upsert(
      {
        workspace_id: workspaceId,
        extension_id: extensionId,
        installed: patch.installed,
        enabled: patch.enabled,
        config: patch.config,
      },
      { onConflict: "workspace_id,extension_id" },
    )
    .select("*")
    .single();

  if (error) throw normalizeWriteError(error as PostgrestError);
  return data;
}
