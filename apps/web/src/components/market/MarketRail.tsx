import { useRef } from "react";
import {
  BadgeCheck,
  Briefcase,
  Building2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  HardHat,
  Star,
  UserRound,
  MapPin,
} from "lucide-react";
import { cn } from "../../lib/utils.ts";
import { MARKET_DOT_COLORS, type MarketDotKind } from "./marketDots";
import { isNew, type MarketRailData, type RailItem } from "./marketItems";

export function KindIcon({
  kind,
  className,
  "data-testid": testId,
}: {
  kind: MarketDotKind;
  className?: string;
  "data-testid"?: string;
}) {
  const props = { className, "aria-hidden": true, "data-testid": testId ?? `kind-icon-${kind}` };
  switch (kind) {
    case "listing":
      return <Briefcase {...props} />;
    case "professional":
      return <UserRound {...props} />;
    case "job":
      return <HardHat {...props} />;
    case "firm":
      return <Building2 {...props} />;
    case "event":
      return <GraduationCap {...props} />;
  }
}

export function NewBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
      New
    </span>
  );
}

const KIND_LABELS: Record<MarketDotKind, string> = {
  listing: "Listing",
  professional: "Professional",
  job: "Job",
  firm: "Firm",
  event: "Training",
};

function RailTile({
  item,
  highlighted,
  onSelect,
}: {
  item: RailItem;
  highlighted: boolean;
  onSelect: (item: RailItem) => void;
}) {
  const accent = MARKET_DOT_COLORS[item.kind];
  const isPrice = item.kind !== "firm";
  const rating = item.rating != null && item.rating > 0 ? item.rating : null;
  return (
    <button
      type="button"
      data-market-item={`${item.kind}:${item.id}`}
      data-testid={`market-tile-${item.id}`}
      data-highlighted={highlighted ? "true" : undefined}
      onClick={() => onSelect(item)}
      className={cn(
        "group flex w-[76vw] max-w-[272px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-border/80 bg-card text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-[248px]",
        highlighted && "ring-2 ring-amber-500/70",
      )}
      style={highlighted ? { borderColor: accent } : undefined}
    >
      <div className="relative h-28 w-full shrink-0 overflow-hidden bg-muted">
        {item.photoUrl ? (
          <img
            src={item.photoUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}0a)` }}
          >
            <KindIcon kind={item.kind} className="size-7 text-foreground/40" />
          </div>
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-foreground/80 backdrop-blur-sm">
          {item.photoUrl ? <KindIcon kind={item.kind} className="size-3" /> : null}
          {KIND_LABELS[item.kind]}
        </span>
        {isNew(item.createdAt) ? (
          <span className="absolute right-2 top-2">
            <NewBadge />
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="flex items-start gap-1.5">
          <span
            className="mt-1.5 size-2 shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
            aria-hidden="true"
          />
          <span className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-amber-700">
            {item.title}
          </span>
          {item.verified ? (
            <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-cyan-600" aria-label="Verified" />
          ) : null}
        </span>

        {item.meta || rating ? (
          <span className="flex items-center gap-2">
            {item.meta ? (
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {item.meta}
              </span>
            ) : (
              <span className="flex-1" />
            )}
            {rating ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                <Star className="size-3 fill-amber-500 text-amber-500" aria-hidden="true" />
                {rating.toFixed(1)}
              </span>
            ) : null}
          </span>
        ) : null}

        <span className="mt-auto flex items-end justify-between gap-2 pt-1.5">
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.location}</span>
          </span>
          <span
            className={cn(
              "shrink-0 text-xs",
              isPrice
                ? "font-mono font-bold tabular-nums text-foreground"
                : "font-medium text-muted-foreground",
            )}
          >
            {item.priceLabel}
          </span>
        </span>
      </div>
    </button>
  );
}

export default function MarketRail({
  rail,
  highlightedId,
  onSelect,
  onSeeAll,
}: {
  rail: MarketRailData;
  highlightedId: string | null;
  onSelect: (item: RailItem) => void;
  onSeeAll: (rail: MarketRailData) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  if (rail.items.length === 0) return null;

  const scrollByDir = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <section aria-label={rail.title} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground sm:text-lg">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: rail.accent }}
              aria-hidden="true"
            />
            <span className="truncate">{rail.title}</span>
            <span className="shrink-0 rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-muted-foreground">
              {rail.items.length}
            </span>
          </h3>
          {rail.description ? (
            <p className="mt-0.5 pl-[18px] text-xs text-muted-foreground">{rail.description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="hidden items-center gap-1 sm:flex">
            <button
              type="button"
              aria-label={`Scroll ${rail.title} left`}
              onClick={() => scrollByDir(-1)}
              className="flex size-7 items-center justify-center rounded-full border border-border/80 bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Scroll ${rail.title} right`}
              onClick={() => scrollByDir(1)}
              className="flex size-7 items-center justify-center rounded-full border border-border/80 bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => onSeeAll(rail)}
            className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
          >
            See all
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        ref={trackRef}
        tabIndex={0}
        role="group"
        aria-label={`${rail.title} items`}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {rail.items.map((item) => (
          <RailTile
            key={`${item.kind}:${item.id}`}
            item={item}
            highlighted={highlightedId === item.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}
