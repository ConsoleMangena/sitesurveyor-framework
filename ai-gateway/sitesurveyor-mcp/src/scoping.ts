// The tenant boundary for every SiteSurveyor MCP tool that talks to PostgREST.
//
// These tools run on the service-role key, which bypasses row-level security,
// so a request without a workspace predicate returns every workspace's rows.
// This module turns (table, run workspace, model filters) into the predicate
// that MUST be in the request, and refuses any filter that tries to widen it.
//
// Mirrored by supabase/functions/_shared/scoping.ts — keep the two equal.

/**
 * Published market views: readable without a workspace (the anonymous concierge
 * has none) and writable by nobody. Verified against the live schema — every
 * other readable table carries a `workspace_id` column except the three in
 * `SCOPE_EXCEPTIONS`.
 */
export const PUBLIC_READ_TABLES = new Set([
  "public_market_listings",
  "public_market_professionals",
  "public_market_jobs",
  "public_market_firms",
  "public_market_events",
]);

/** Tables whose rows do not carry their own `workspace_id`. */
const SCOPE_EXCEPTIONS: Record<
  string,
  "workspace_self" | "member_of_workspace" | "workspace_via_project"
> = {
  // The row IS the workspace, so its primary key is the scope.
  workspaces: "workspace_self",
  // A profile belongs to a user, not a workspace: scope it to the users whose
  // default workspace is this one. Members whose default sits elsewhere are
  // invisible here; `workspace_members` still lists them.
  profiles: "member_of_workspace",
  // Activities have no workspace column at all, only `project_id`, so the
  // scope has to arrive through the project.
  project_activities: "workspace_via_project",
};

/** The query param a single-row mutation must carry. All writable tables are
 *  workspace-stamped, so one column covers them all. */
export const WORKSPACE_COLUMN = "workspace_id";

export interface ModelFilter {
  column: string;
  op: string;
  value: string;
}

export type ScopedRead =
  | {
      ok: true;
      /** Overrides `select=*` when the scope arrives through a join. */
      select: string;
      /** Params pinning the request to one workspace. */
      params: [column: string, value: string][];
      /** The caller's filters, with the scope column normalised away. */
      filters: ModelFilter[];
    }
  | { ok: false; error: string };

const NO_WORKSPACE =
  "This run has no workspace, so business data cannot be read. Ask the user to sign in.";

/**
 * Resolve the forced tenant predicate for a read, and normalise any
 * model-supplied filter that touches the scope column: an `eq` on the current
 * workspace is redundant and dropped, anything else is refused rather than
 * rewritten, so the model learns it cannot reach outside its workspace.
 */
export function scopeRead(
  table: string,
  workspaceId: string | undefined,
  filters: ModelFilter[] | undefined,
): ScopedRead {
  if (PUBLIC_READ_TABLES.has(table)) {
    return { ok: true, select: "*", params: [], filters: filters ?? [] };
  }
  if (!workspaceId) return { ok: false, error: NO_WORKSPACE };

  const exception = SCOPE_EXCEPTIONS[table];
  let column = WORKSPACE_COLUMN;
  let select = "*";
  if (exception === "workspace_self") column = "id";
  else if (exception === "member_of_workspace") column = "default_workspace_id";
  else if (exception === "workspace_via_project") {
    column = "projects.workspace_id";
    // PostgREST only restricts parent rows for an embedded filter when the
    // embedding is part of the projection.
    select = "*,projects!inner(workspace_id)";
  }

  const kept: ModelFilter[] = [];
  for (const f of filters ?? []) {
    if (f.column !== column) {
      kept.push(f);
      continue;
    }
    if (f.op === "eq" && f.value === workspaceId) continue;
    return {
      ok: false,
      error:
        `This agent reads only workspace ${workspaceId}. Drop the "${f.column} ${f.op} ${f.value}" filter and query the rows themselves.`,
    };
  }
  return { ok: true, select, params: [[column, workspaceId]], filters: kept };
}

export type ScopedWrite =
  | { ok: true; workspaceId: string }
  | { ok: false; error: string };

/**
 * Resolve the owner for a business write. A missing workspace would create a
 * row no workspace can list, and naming another workspace is a cross-tenant
 * mutation, so both are refused here instead of being silently corrected.
 */
export function scopeWrite(
  workspaceId: string | undefined,
  requestedWorkspaceId?: unknown,
): ScopedWrite {
  if (!workspaceId) {
    return { ok: false, error: "This run has no workspace, so nothing can be written." };
  }
  if (
    typeof requestedWorkspaceId === "string" &&
    requestedWorkspaceId &&
    requestedWorkspaceId !== workspaceId
  ) {
    return {
      ok: false,
      error:
        `Records can only be written to workspace ${workspaceId}; "${requestedWorkspaceId}" is outside this run.`,
    };
  }
  return { ok: true, workspaceId };
}

/** `workspace_id=eq.<id>` ready to append to a mutation path. */
export function workspaceParam(workspaceId: string): string {
  return `${WORKSPACE_COLUMN}=eq.${encodeURIComponent(workspaceId)}`;
}
