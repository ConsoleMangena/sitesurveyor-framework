import { forwardRef, type ReactNode } from "react";
import LeafletGlobe, { type MarketGlobeHandle } from "./LeafletGlobe.tsx";
import type { MarketDot } from "./marketDots";

interface PublicMarketGlobeProps {
  /** null while the parent is fetching. Already filtered by scope/location. */
  dots: MarketDot[] | null;
  /** Coordinate-bearing rows in the current scope; may exceed the plotted cap. */
  totalPoints: number;
  failed: boolean;
  onSelect: (dot: MarketDot) => void;
  onRetry: () => void;
  /** "kind:id" keys matching the active registry search; null when not searching. */
  matchKeys?: Set<string> | null;
  /** Refit the map whenever this token changes (e.g. scope tabs). */
  fitKey?: string;
  /** Rendered inside the map container (heading overlay etc.). */
  children?: ReactNode;
  /** Overrides the default hero height (e.g. embedded cards). */
  heightClassName?: string;
}

/** Public-facing market globe using Leaflet for reliable map rendering.
 *  Wraps the LeafletGlobe component and passes through all props + ref. */
const PublicMarketGlobe = forwardRef<MarketGlobeHandle, PublicMarketGlobeProps>(
  function PublicMarketGlobe(
    {
      dots,
      totalPoints,
      failed,
      onSelect,
      matchKeys,
      fitKey,
      onRetry,
      children,
      heightClassName = "h-[500px] sm:h-[600px] lg:h-[660px]",
    },
    ref,
  ) {
    return (
      <LeafletGlobe
        ref={ref}
        dots={dots}
        totalPoints={totalPoints}
        failed={failed}
        onSelect={onSelect}
        matchKeys={matchKeys}
        fitKey={fitKey}
        onRetry={onRetry}
        heightClassName={heightClassName}
      >
        {children}
      </LeafletGlobe>
    );
  },
);

export default PublicMarketGlobe;
