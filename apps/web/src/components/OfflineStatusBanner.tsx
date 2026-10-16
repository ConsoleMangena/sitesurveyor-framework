import { WifiOff } from "lucide-react";
import { useBrowserOnlineStatus } from "../lib/hooks/useBrowserOnlineStatus.ts";

export default function OfflineStatusBanner() {
  const online = useBrowserOnlineStatus();
  if (online) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[4000] border-t border-amber-500/30 bg-amber-50/95 px-4 py-2.5 text-amber-950 shadow-lg backdrop-blur supports-[padding:max(0px)]:pb-[max(0.625rem,env(safe-area-inset-bottom))] dark:bg-amber-950/95 dark:text-amber-50">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 text-center text-xs font-medium sm:text-sm">
        <WifiOff className="size-4 shrink-0" aria-hidden="true" />
        <span>You’re offline. Cached pages and local changes remain available.</span>
      </div>
    </div>
  );
}
