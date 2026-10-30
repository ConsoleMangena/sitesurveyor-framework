import type { Session } from "@supabase/supabase-js";
import { getCurrentSession } from "./session.ts";
import { getMyProfile, type ProfileRow } from "../repositories/profiles.ts";
import {
  getDefaultWorkspace,
  getMyWorkspaces,
  type WorkspaceMembershipSummary,
  type WorkspaceRow,
} from "../repositories/workspaces.ts";

export interface AppUserContext {
  session: Session | null;
  profile: ProfileRow | null;
  defaultWorkspace: WorkspaceRow | null;
  workspaces: WorkspaceMembershipSummary[];
}

/** True when the corresponding fetch threw (e.g. network or PostgREST error). */
export interface AppUserLoadDiagnostics {
  profileFetchFailed: boolean;
  defaultWorkspaceFetchFailed: boolean;
  workspacesFetchFailed: boolean;
}

const emptyContext = (): AppUserContext => ({
  session: null,
  profile: null,
  defaultWorkspace: null,
  workspaces: [],
});

async function loadAppUserFromSession(session: Session): Promise<{
  context: AppUserContext;
  diagnostics: AppUserLoadDiagnostics;
}> {
  const [profileResult, defaultWorkspaceResult, workspacesResult] =
    await Promise.allSettled([
      getMyProfile(),
      getDefaultWorkspace(),
      getMyWorkspaces(),
    ]);

  const diagnostics: AppUserLoadDiagnostics = {
    profileFetchFailed: profileResult.status === "rejected",
    defaultWorkspaceFetchFailed: defaultWorkspaceResult.status === "rejected",
    workspacesFetchFailed: workspacesResult.status === "rejected",
  };

  return {
    context: {
      session,
      profile: profileResult.status === "fulfilled" ? profileResult.value : null,
      defaultWorkspace:
        defaultWorkspaceResult.status === "fulfilled"
          ? defaultWorkspaceResult.value
          : null,
      workspaces:
        workspacesResult.status === "fulfilled" ? workspacesResult.value : [],
    },
    diagnostics,
  };
}

export async function getCurrentAppUser(): Promise<AppUserContext> {
  const session = await getCurrentSession();

  if (!session) {
    return emptyContext();
  }

  return (await loadAppUserFromSession(session)).context;
}

export async function getCurrentAppUserWithDiagnostics(): Promise<{
  context: AppUserContext;
  diagnostics: AppUserLoadDiagnostics;
}> {
  const session = await getCurrentSession();

  if (!session) {
    return {
      context: emptyContext(),
      diagnostics: {
        profileFetchFailed: false,
        defaultWorkspaceFetchFailed: false,
        workspacesFetchFailed: false,
      },
    };
  }

  return loadAppUserFromSession(session);
}
