import { forwardRef, type ReactNode } from "react";
import LeafletGlobe, { type MarketGlobeHandle } from "./LeafletGlobe.tsx";
import type { MarketDot } from "./marketDots";

interface PublicMarketGlobeProps {
  /** null while the parent is fetching. Already filtered by scope/location. */
  dots: MarketDot[] | null;
  /** Pins that exist in total (before scope/location filtering). */
  totalPoints: number;
  failed: boolean;
  onSelect: (dot: MarketDot) => void;
  onRetry: () => void;
  /** Rendered inside the map container (heading overlay etc.). */
  children?: ReactNode;
  /** Overrides the default hero height (e.g. embedded cards). */
  heightClassName?: string;
}

/** Public-facing market globe using Leaflet for reliable map rendering.
 *  Wraps the LeafletGlobe component and passes through all props + ref. */
const PublicMarketGlobe = forwardRef<MarketGlobeHandle, PublicMarketGlobeProps>(
  function PublicMarketGlobe(
    { dots, totalPoints, failed, onSelect, onRetry, children, heightClassName = "h-[500px] sm:h-[600px] lg:h-[660px]" },
    ref,
  ) {
    return (
      <LeafletGlobe
        ref={ref}
        dots={dots}
        totalPoints={totalPoints}
        failed={failed}
        onSelect={onSelect}
        onRetry={onRetry}
        heightClassName={heightClassName}
      >
        {children}
      </LeafletGlobe>
    );
  },
);

export default PublicMarketGlobe;
