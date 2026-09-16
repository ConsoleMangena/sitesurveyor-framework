import { useEffect, useState } from "react";
import { supabase } from "../supabase/client.ts";

interface WorkspaceStorage {
  usedBytes: number;
  fileCount: number;
  limitMb: number;
  usedMb: number;
  percent: number;
  loading: boolean;
  error: string | null;
}

export function useWorkspaceStorage(workspaceId: string | null): WorkspaceStorage {
  const [storage, setStorage] = useState<WorkspaceStorage>({
    usedBytes: 0,
    fileCount: 0,
    limitMb: 500,
    usedMb: 0,
    percent: 0,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!workspaceId) {
      setStorage((prev) => ({ ...prev, loading: false }));
      return;
    }

    const wid: string = workspaceId;
    let cancelled = false;

    async function fetchStorage() {
      try {
        const { data, error } = await supabase.rpc("get_workspace_storage_usage", {
          p_workspace_id: wid,
        });

        if (cancelled) return;

        if (error) {
          setStorage({
            usedBytes: 0,
            fileCount: 0,
            limitMb: 500,
            usedMb: 0,
            percent: 0,
            loading: false,
            error: error.message,
          });
          return;
        }

        const result = data as unknown as {
          used_bytes: number;
          file_count: number;
          limit_mb: number;
          used_mb: number;
          percent: number;
        };

        setStorage({
          usedBytes: result.used_bytes,
          fileCount: result.file_count,
          limitMb: result.limit_mb,
          usedMb: result.used_mb,
          percent: result.percent,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (!cancelled) {
          setStorage({
            usedBytes: 0,
            fileCount: 0,
            limitMb: 500,
            usedMb: 0,
            percent: 0,
            loading: false,
            error: err instanceof Error ? err.message : "Failed to fetch storage",
          });
        }
      }
    }

    fetchStorage();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return storage;
}
