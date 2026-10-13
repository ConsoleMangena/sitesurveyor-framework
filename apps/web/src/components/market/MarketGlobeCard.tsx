import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "../ui/button.tsx";
import {
  buildMarketDots,
  type MarketDot,
  type MarketDotKind,
} from "./marketDots.ts";
import { marketGroupsFromData, useMarketFeed } from "./marketFeed.ts";
import type {
  EventRow,
  FirmRow,
  JobRow,
  ListingRow,
  ProfessionalRow,
} from "./marketFeed.ts";
import { MarketDetailDialog } from "./MarketDetailDialog.tsx";
import PublicMarketGlobe from "./PublicMarketGlobe.tsx";

/** Dashboard embed of the public-market globe: live pins, tap for details,
 *  full registry one click away. */
export default function MarketGlobeCard({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const { data, failure, loading, retry } = useMarketFeed();
  const [selectedId, setSelectedId] = useState<{
    kind: MarketDotKind;
    id: string;
  } | null>(null);

  const dots = data
    ? buildMarketDots(marketGroupsFromData(data))
    : null;

  const findIn = <T extends { id: string }>(rows: T[]) =>
    selectedId ? (rows.find((row) => row.id === selectedId.id) ?? null) : null;

  const selectedListing =
    selectedId?.kind === "listing"
      ? findIn(data?.listings ?? [])
      : null;
  const selectedProfessional =
    selectedId?.kind === "professional"
      ? findIn(data?.professionals ?? [])
      : null;
  const selectedJob =
    selectedId?.kind === "job" ? findIn(data?.jobs ?? []) : null;
  const selectedFirm =
    selectedId?.kind === "firm" ? findIn(data?.firms ?? []) : null;
  const selectedEvent =
    selectedId?.kind === "event" ? findIn(data?.events ?? []) : null;

  return (
    <section aria-label="Open surveying market" className="overflow-hidden rounded-none border border-border/60 bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src="/logo.svg"
            alt=""
            aria-hidden="true"
            className="app-logo h-8 w-8 shrink-0"
          />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-card-foreground">
              Open surveying market
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              Live listings, professionals, jobs, firms & training worldwide
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/market">Browse the market</Link>
        </Button>
      </div>
      <PublicMarketGlobe
        dots={dots}
        totalPoints={dots?.length ?? 0}
        failed={failure !== null}
        onSelect={(dot: MarketDot) => setSelectedId({ kind: dot.kind, id: dot.id })}
        onRetry={retry}
        heightClassName="h-[320px] min-h-[280px] border-y-0"
      >
        {!loading ? (
          <div className="pointer-events-none absolute bottom-4 left-4 hidden sm:block">
            <span className="rounded-none border border-border/60 bg-background/85 px-2.5 py-1 text-[11px] font-medium tracking-wide text-muted-foreground shadow-sm backdrop-blur-sm">
              Tap a pin for details
            </span>
          </div>
        ) : null}
      </PublicMarketGlobe>
      <MarketDetailDialog
        dot={
          selectedId && dots
            ? (dots.find(
                (dot) => dot.kind === selectedId.kind && dot.id === selectedId.id,
              ) ?? null)
            : null
        }
        listing={selectedListing as ListingRow | null}
        professional={selectedProfessional as ProfessionalRow | null}
        job={selectedJob as JobRow | null}
        firm={selectedFirm as FirmRow | null}
        event={selectedEvent as EventRow | null}
        onClose={() => setSelectedId(null)}
        onOpenInApp={onNavigate}
      />
    </section>
  );
}
