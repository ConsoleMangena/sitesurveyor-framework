import { WifiOff } from "lucide-react";
import { useBrowserOnlineStatus } from "../lib/hooks/useBrowserOnlineStatus.ts";
import ErrorNotice from "./errors/ErrorNotice.tsx";

export default function OfflineStatusBanner() {
  const online = useBrowserOnlineStatus();
  if (online) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-4000 px-3 pb-[max(8px,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto mx-auto max-w-3xl">
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
    </div>
  );
}
