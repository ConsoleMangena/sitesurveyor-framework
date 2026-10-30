import { WifiOff } from "lucide-react";
import { useBrowserOnlineStatus } from "../lib/hooks/useBrowserOnlineStatus.ts";
import ErrorNotice from "./errors/ErrorNotice.tsx";

export default function OfflineStatusBanner() {
  const online = useBrowserOnlineStatus();
  if (online) return null;

  return (
    <div className="offline-status-banner">
      <ErrorNotice
        tone="warning"
        role="status"
        layout="banner"
        icon={<WifiOff size={16} />}
        title="Working offline"
      >
        Cached pages and local changes remain available.
      </ErrorNotice>
    </div>
  );
}
