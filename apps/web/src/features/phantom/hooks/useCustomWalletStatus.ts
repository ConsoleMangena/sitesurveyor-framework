import { useCallback, useState } from "react";
import { useAsyncAction } from "../../../hooks/useAsyncAction.ts";
import { loadCustomWallet } from "../lib/customWalletRepository.ts";
import { customWalletAdapter } from "../lib/customWalletAdapter.ts";

export type CustomWalletStatus = "none" | "stored";

export function useCustomWalletStatus() {
  const [status, setStatus] = useState<CustomWalletStatus>(() =>
    customWalletAdapter.hasStoredWallet() ? "stored" : "none",
  );

  const refresh = useCallback(async () => {
    try {
      const record = await loadCustomWallet();
      setStatus(record ? "stored" : "none");
    } catch {
      // DB unreachable: keep the local hint so the UI stays usable.
    }
  }, []);

  useAsyncAction(refresh, [refresh]);

  return { status, refresh };
}
