import { useEffect, useState } from "react";
import {
  offlineSyncStatus$,
  type OfflineSyncStatus,
} from "../localDb/sync.ts";

export function useOfflineSyncStatus(): OfflineSyncStatus {
  const [status, setStatus] = useState<OfflineSyncStatus>(
    offlineSyncStatus$.getValue(),
  );

  useEffect(() => {
    const subscription = offlineSyncStatus$.subscribe({
      next: setStatus,
    });
    return () => subscription.unsubscribe();
  }, []);

  return status;
}
