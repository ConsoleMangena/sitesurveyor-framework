import { useCallback, useEffect, useState } from "react";

import { getWorkspaceStorageUsage } from "../repositories/attachments.ts";

/**
 * Quota state for one workspace, straight from `get_workspace_storage_usage` so
 * the browser and the database trigger agree on what "over quota" means.
 */
export interface WorkspaceStorage {
  usedBytes: number;
  fileCount: number;
  limitMb: number;
  usedMb: number;
  percent: number;
  baseLimitMb: number;
  purchasedStorageMb: number;
  expiringStorageMb: number;
  nextStorageExpiration: string | null;
  overQuota: boolean;
  uploadAllowed: boolean;
  loading: boolean;
  error: string | null;
}

const DEFAULT_LIMIT_MB = 500;

function emptyStorage(workspaceId: string | null): WorkspaceStorage {
  return {
    usedBytes: 0,
    fileCount: 0,
    limitMb: DEFAULT_LIMIT_MB,
    usedMb: 0,
    percent: 0,
    baseLimitMb: DEFAULT_LIMIT_MB,
    purchasedStorageMb: 0,
    expiringStorageMb: 0,
    nextStorageExpiration: null,
    overQuota: false,
    uploadAllowed: true,
    loading: workspaceId !== null,
    error: null,
  };
}

export function useWorkspaceStorage(
  workspaceId: string | null,
): WorkspaceStorage & { reload: () => void } {
  const [revision, setRevision] = useState(0);
  const [storage, setStorage] = useState(() => emptyStorage(workspaceId));
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!workspaceId) return;

    let cancelled = false;

    getWorkspaceStorageUsage(workspaceId)
      .then((usage) => {
        if (cancelled) return;
        if (!usage) {
          setStorage({ ...emptyStorage(workspaceId), loading: false });
          return;
        }
        setStorage({
          usedBytes: usage.used_bytes,
          fileCount: usage.file_count,
          limitMb: usage.limit_mb,
          usedMb: usage.used_mb,
          percent: usage.percent,
          baseLimitMb: usage.base_limit_mb,
          purchasedStorageMb: usage.purchased_storage_mb,
          expiringStorageMb: usage.expiring_storage_mb,
          nextStorageExpiration: usage.next_storage_expiration,
          overQuota: usage.over_quota,
          uploadAllowed: usage.upload_allowed,
          loading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStorage({
          ...emptyStorage(workspaceId),
          loading: false,
          error: err instanceof Error ? err.message : "Failed to fetch storage",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, revision]);

  return { ...storage, reload };
}
