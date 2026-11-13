import { ArrowUpRight, BadgeCheck, MapPin, Star } from "lucide-react";
import { cn } from "../../lib/utils.ts";
import { MARKET_DOT_COLORS, type MarketDotKind } from "./marketDots.ts";
import { isNew, type RailItem } from "./marketItems.ts";
import { getKindPlaceholder } from "./marketPlaceholders.ts";
import { KindIcon, NewBadge, SampleBadge } from "./MarketRail.tsx";
import { DistanceChip } from "../shared/NearbyPrompt.tsx";

const KIND_LABELS: Record<MarketDotKind, string> = {
  listing: "Listing",
  professional: "Professional",
  job: "Job",
  firm: "Firm",
  event: "Training",
};

function ResultCard({
  item,
  highlighted,
  distanceKm,
  onSelect,
}: {
  item: RailItem;
  highlighted: boolean;
  distanceKm?: number | null;
  onSelect: (item: RailItem) => void;
}) {
  const photo = item.photoUrl || getKindPlaceholder(item.kind, item.meta);
  const rating = item.rating != null && item.rating > 0 ? item.rating : null;

  return (
    <li className="flex min-w-0">
      <button
        type="button"
        data-market-item={`${item.kind}:${item.id}`}
        data-testid={`market-card-${item.id}`}
        data-highlighted={highlighted ? "true" : undefined}
        aria-label={`${item.title}, ${item.priceLabel}, ${item.location}${item.isSample ? ", sample content" : ""}`}
        onClick={() => onSelect(item)}
        className={cn(
          "group flex h-full w-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card text-left transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-[0_10px_24px_rgba(17,24,39,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          highlighted && "ring-2 ring-warning/70",
        )}
        style={highlighted ? { borderColor: MARKET_DOT_COLORS[item.kind] } : undefined}
      >
        <div className="relative h-44 w-full shrink-0 overflow-hidden bg-muted">
          <img
            src={photo}
            alt=""
            loading="lazy"
            onError={(event) => {
              const fallback = getKindPlaceholder(item.kind, item.meta);
              if (event.currentTarget.src !== fallback) {
                event.currentTarget.src = fallback;
              }
            }}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/95 px-2.5 py-1 text-micro font-semibold text-foreground/80">
            <KindIcon kind={item.kind} className="size-3" />
            {KIND_LABELS[item.kind]}
          </span>
          {isNew(item.createdAt) || item.isSample ? (
            <span className="absolute right-3 top-3 flex max-w-[45%] flex-col items-end gap-1.5">
              {item.isSample ? <SampleBadge /> : null}
              {isNew(item.createdAt) ? <NewBadge /> : null}
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <span className="flex items-start gap-1.5">
            <span className="line-clamp-2 min-w-0 flex-1 text-base font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
              {item.title}
            </span>
            {item.verified ? (
              <BadgeCheck className="mt-0.5 size-4 shrink-0 text-info" aria-label="Verified" />
            ) : null}
          </span>

          <span className="flex min-h-10 items-start gap-2">
            <span className="line-clamp-2 min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
              {item.meta}
            </span>
            {rating ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums text-warning">
                <Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />
                <span className="sr-only">Rating: </span>
                {rating.toFixed(1)}
              </span>
            ) : null}
          </span>

          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.location}</span>
            {distanceKm != null ? <DistanceChip km={distanceKm} /> : null}
          </span>

          <span className="mt-auto flex items-center justify-between gap-3 border-t border-border/70 pt-3">
            <span
              className={cn(
                "min-w-0 break-words text-sm",
                item.kind === "firm"
                  ? "font-medium text-muted-foreground"
                  : "font-mono font-bold tabular-nums text-foreground",
              )}
            >
              {item.priceLabel}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
              View details
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </span>
          </span>
        </div>
      </button>
    </li>
  );
}

export default function MarketResultGrid({
  items,
  highlighted,
  distances,
  onSelect,
}: {
  items: RailItem[];
  highlighted: { kind: MarketDotKind; id: string } | null;
  /** Distance in km per `kind:id` key, when the visitor has shared location. */
  distances?: Map<string, number>;
  onSelect: (item: RailItem) => void;
}) {
  return (
    <ul className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <ResultCard
          key={`${item.kind}:${item.id}`}
          item={item}
          highlighted={highlighted?.kind === item.kind && highlighted.id === item.id}
          distanceKm={distances?.get(`${item.kind}:${item.id}`) ?? null}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

export function MarketResultsSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading marketplace results…</span>
      <ul
        aria-hidden="true"
        className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-3"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className="flex min-w-0">
            <div className="h-full w-full overflow-hidden rounded-xl border border-border/80 bg-card">
              <div className="h-44 animate-pulse bg-muted" />
              <div className="space-y-3 p-4">
                <div className="h-5 w-4/5 animate-pulse rounded bg-muted" />
                <div className="space-y-2 py-1">
                  <div className="h-3 w-full animate-pulse rounded bg-muted" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                </div>
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                <div className="flex items-center justify-between border-t border-border/70 pt-3">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
