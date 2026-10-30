import { BehaviorSubject } from "rxjs";

export type OfflineSyncState = "idle" | "syncing" | "synced" | "error";

export interface OfflineSyncStatus {
  status: OfflineSyncState;
  lastError?: string;
}

export const offlineSyncStatus$ = new BehaviorSubject<OfflineSyncStatus>({
  status: "synced",
});

export function startWorkspaceSync(..._args: unknown[]): void {
  offlineSyncStatus$.next({ status: "synced" });
}

export function stopAllSync(): void {
  offlineSyncStatus$.next({ status: "idle" });
}
