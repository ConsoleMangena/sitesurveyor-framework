import { getCurrentUser } from "../auth/session.ts";
import { supabase } from "../supabase/client.ts";
import type { Json } from "../supabase/types.ts";

/**
 * Persistence for the Engineering Surveyor CAD drawing model.
 *
 * The full CAD model (points, linework, text, surfaces, layers) is stored as a
 * single JSONB document per project in `project_cad_drawings`, so the drawing is
 * shared across the whole project team rather than living only in one browser's
 * localStorage.
 */

export interface CadDrawingRecord {
  model: Json;
  updated_at: string;
  updated_by: string | null;
}

/**
 * True when the error means the `project_cad_drawings` table is not present in
 * the database (migration not yet applied). PostgREST reports this as a 404 with
 * code `PGRST205` ("Could not find the table ... in the schema cache"). In that
 * case the CAD workspace should fall back to local-only persistence rather than
 * surfacing a hard error to the user.
 */
function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (code === "PGRST205" || code === "42P01") return true;
  const message = (error as { message?: string }).message ?? "";
  return /project_cad_drawings/.test(message) && /schema cache|does not exist/i.test(message);
}

/** Load the persisted CAD model for a project, or null if none exists yet. */
export async function getCadDrawing(
  projectId: string,
): Promise<CadDrawingRecord | null> {
  const { data, error } = await supabase
    .from("project_cad_drawings")
    .select("model, updated_at, updated_by")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    // Migration not applied yet: behave as if no drawing exists so the CAD
    // workspace can still load and draft against local storage.
    if (isMissingTableError(error)) return null;
    throw error;
  }
  return data ?? null;
}

/**
 * Upsert the CAD model for a project. The workspace id is required so the row
 * satisfies RLS and workspace-scoped queries.
 */
export async function saveCadDrawing(
  projectId: string,
  workspaceId: string,
  model: Json,
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You must be signed in to save CAD work.");

  const { error } = await supabase
    .from("project_cad_drawings")
    .upsert(
      {
        project_id: projectId,
        workspace_id: workspaceId,
        model,
        updated_by: user.id,
      },
      { onConflict: "project_id" },
    );

  if (error) {
    // Migration not applied yet: silently skip the remote write. Work is still
    // persisted to local storage by the caller, so drafting is not lost.
    if (isMissingTableError(error)) return;
    throw error;
  }
}
