import { IconCurrentLocation, IconMapPin } from "@tabler/icons-react";
import { Button } from "../ui/button.tsx";
import { cn } from "../../lib/utils.ts";
import type { UseDeviceLocation } from "../../lib/geo/useDeviceLocation.ts";
import { formatDistanceKm } from "../../lib/geo/distance.ts";

interface NearbyPromptProps {
  geo: UseDeviceLocation;
  /** How many things are being ranged by distance right now. */
  count?: number;
  /** Noun for the count, e.g. "vehicles" or "results". */
  noun?: string;
  className?: string;
}

/**
 * The "use my location" affordance both public surfaces share: a calm bar that
 * asks for the device fix once, then collapses into a "near you" pill showing
 * how far the closest things are.
 */
export function NearbyPrompt({ geo, count, noun = "results", className }: NearbyPromptProps) {
  const { location, status, error, locate, clear, fromCache } = geo;

  if (status === "denied" || status === "unavailable") {
    return (
      <div
        role="status"
        className={cn("flex flex-wrap items-center gap-2 rounded-xl border border-warning/30 bg-warning/5 px-3.5 py-2.5 text-xs leading-5 text-warning", className)}
      >
        <IconMapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">{error}</span>
        <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg px-3 text-xs" onClick={() => void locate()}>
          Try again
        </Button>
      </div>
    );
  }

  if (location) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/8 px-3 py-1.5 text-xs font-semibold text-success">
          <IconCurrentLocation className="size-3.5" aria-hidden="true" />
          Near you
          {fromCache ? <span className="font-normal text-muted-foreground">· from last visit</span> : null}
        </span>
        {typeof count === "number" ? (
          <span className="text-xs text-muted-foreground">
            {count} {count === 1 ? noun.replace(/s$/, "") : noun} within range
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void locate()}
          className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
        >
          {status === "locating" ? "Locating…" : "Refresh location"}
        </button>
        <button
          type="button"
          onClick={clear}
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Clear
        </button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void locate()}
        disabled={status === "locating"}
        className="h-10 gap-1.5 rounded-xl px-4 text-sm"
      >
        <IconCurrentLocation className="size-4" aria-hidden="true" />
        {status === "locating" ? "Locating…" : "Use my location"}
      </Button>
      <span className="text-xs leading-5 text-muted-foreground">
        Group everything by how close it is to you — no coordinates to type.
      </span>
    </div>
  );
}

/** Small inline distance chip for a row that knows how far away it is. */
export function DistanceChip({ km }: { km: number | null }) {
  if (km === null) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 font-mono text-micro font-medium tabular-nums text-muted-foreground">
      <IconMapPin className="size-3" aria-hidden="true" />
      {formatDistanceKm(km)}
    </span>
  );
}
