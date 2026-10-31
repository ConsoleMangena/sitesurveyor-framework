import { useRef } from "react";
import {
  ArrowUpRight,
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
        "group flex w-[82vw] max-w-[300px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border/80 bg-card text-left transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1 hover:border-border hover:shadow-[0_16px_36px_rgba(17,24,39,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-[280px]",
        highlighted && "ring-2 ring-amber-500/70",
      )}
      style={highlighted ? { borderColor: accent } : undefined}
    >
      <div className="relative h-40 w-full shrink-0 overflow-hidden bg-muted">
        {item.photoUrl ? (
          <img
            src={item.photoUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}0a)` }}
          >
            <KindIcon kind={item.kind} className="size-10 text-foreground/35" />
          </div>
        )}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/95 px-2.5 py-1 text-[10px] font-semibold text-foreground/80">
          <KindIcon kind={item.kind} className="size-3" />
          {KIND_LABELS[item.kind]}
        </span>
        {isNew(item.createdAt) ? <span className="absolute right-3 top-3"><NewBadge /></span> : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="flex items-start gap-1.5">
          <span className="line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
            {item.title}
          </span>
          {item.verified ? <BadgeCheck className="mt-0.5 size-4 shrink-0 text-cyan-600" aria-label="Verified" /> : null}
        </span>

        {item.meta || rating ? (
          <span className="flex items-center gap-2">
            {item.meta ? <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{item.meta}</span> : <span className="flex-1" />}
            {rating ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                <Star className="size-3.5 fill-amber-500 text-amber-500" aria-hidden="true" />
                {rating.toFixed(1)}
              </span>
            ) : null}
          </span>
        ) : null}

        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{item.location}</span>
        </span>

        <span className="mt-auto flex items-center justify-between gap-3 border-t border-border/70 pt-3">
          <span className={cn("min-w-0 text-sm", isPrice ? "font-mono font-bold tabular-nums text-foreground" : "font-medium text-muted-foreground")}>
            {item.priceLabel}
          </span>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-bg text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <ArrowUpRight className="size-4" aria-hidden="true" />
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
    <section aria-label={rail.title} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: rail.accent }} aria-hidden="true" />
            <span className="truncate">{rail.title}</span>
            <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-muted-foreground">{rail.items.length}</span>
          </h3>
          {rail.description ? <p className="mt-1 pl-[18px] text-sm text-muted-foreground">{rail.description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="hidden items-center gap-1.5 sm:flex">
            <button
              type="button"
              aria-label={`Scroll ${rail.title} left`}
              onClick={() => scrollByDir(-1)}
              className="flex size-10 items-center justify-center rounded-full border border-border/80 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Scroll ${rail.title} right`}
              onClick={() => scrollByDir(1)}
              className="flex size-10 items-center justify-center rounded-full border border-border/80 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => onSeeAll(rail)}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/5"
          >
            See all
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        ref={trackRef}
        tabIndex={0}
        role="group"
        aria-label={`${rail.title} items`}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
