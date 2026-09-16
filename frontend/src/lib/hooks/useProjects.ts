import { useCallback, useState } from "react";
import {
  listProjects,
  type ProjectWithOrg,
} from "../repositories/projects.ts";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";

interface UseProjectsResult {
  projects: ProjectWithOrg[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Reactive, local-first hook for the current workspace's projects.
 * The first call starts WatermelonDB <-> Supabase sync, so subsequent
 * updates (local or remote) are reflected immediately without refetching.
 */
export function useProjects(workspaceId: string): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectWithOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listProjects(workspaceId);
      setProjects(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useAsyncAction(refresh, [refresh]);

  return { projects, loading, error, refresh };
}
