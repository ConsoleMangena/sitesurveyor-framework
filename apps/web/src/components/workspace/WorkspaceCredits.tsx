import { useCallback, useEffect, useRef, useState } from "react";
import { Coins } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { WorkspaceView } from "@/features/workspace/types";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { getAiCreditBalance } from "@/lib/repositories/pesepay";

const CREDITS_POLL_MS = 60000;

/**
 * The workspace's SiteSurveyor credit balance — the single pool spent on both
 * AI agent turns and Earth Observation surveys. Loads on mount/workspace change
 * and stays fresh via a periodic poll and a refresh when the tab regains focus,
 * mirroring the notifications widget. The accounts table is not in the realtime
 * publication, so polling is the source of freshness rather than a subscription.
 */
function useCreditBalance(workspaceId: string | null | undefined) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const next = await getAiCreditBalance(workspaceId);
      if (mounted.current) setBalance(next);
    } catch {
      // A transient read failure keeps the last known balance rather than
      // blanking the indicator or surfacing an error in the top bar.
    }
  }, [workspaceId]);

  useAsyncAction(async () => {
    if (!workspaceId) {
      setBalance(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    await refresh();
    if (mounted.current) setLoading(false);
  }, [workspaceId, refresh]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    const interval = window.setInterval(() => void refresh(), CREDITS_POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [workspaceId, refresh]);

  return { balance, loading };
}

type WorkspaceCreditsProps = {
  workspaceId: string;
  onChangeView: (view: WorkspaceView) => void;
};

export function WorkspaceCredits({
  workspaceId,
  onChangeView,
}: WorkspaceCreditsProps) {
  const { balance, loading } = useCreditBalance(workspaceId);
  const value = balance ?? 0;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => onChangeView("billing")}
      title="SiteSurveyor credits"
      aria-label={`SiteSurveyor credits: ${loading ? "loading" : value.toLocaleString()}`}
      className="h-8 shrink-0 gap-1.5 rounded-full border border-warning/25 bg-warning/10 px-2.5 text-warning hover:bg-warning/20 hover:text-warning"
    >
      <Coins className="size-4" aria-hidden="true" />
      <span className="text-xs font-semibold tabular-nums">
        {loading ? "…" : value.toLocaleString()}
      </span>
    </Button>
  );
}