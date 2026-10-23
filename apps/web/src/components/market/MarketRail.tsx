import { useRef } from "react";
import {
  Briefcase,
  Building2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  HardHat,
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
    <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
      New
    </span>
  );
}

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
  return (
    <button
      type="button"
      data-market-item={`${item.kind}:${item.id}`}
      data-testid={`market-tile-${item.id}`}
      data-highlighted={highlighted ? "true" : undefined}
      onClick={() => onSelect(item)}
      className={cn(
        "group w-[240px] shrink-0 snap-start overflow-hidden rounded-xl border border-border/80 bg-card text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-[240px] w-[80vw] max-w-[280px]",
        highlighted && "ring-2 ring-amber-500/70",
      )}
      style={highlighted ? { borderColor: accent } : undefined}
    >
      {item.photoUrl ? (
        <div className="relative h-28 w-full overflow-hidden bg-muted">
          <img
            src={item.photoUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {isNew(item.createdAt) ? (
            <span className="absolute right-2 top-2">
              <NewBadge />
            </span>
          ) : null}
        </div>
      ) : (
        <div
          className="relative flex h-20 items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${accent}22, ${accent}0a)`,
          }}
        >
          <KindIcon kind={item.kind} className="size-6" />
          {isNew(item.createdAt) ? (
            <span className="absolute right-2 top-2">
              <NewBadge />
            </span>
          ) : null}
        </div>
      )}
      <div className="flex flex-col gap-1 p-3">
        <span className="flex items-center gap-1.5">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
            aria-hidden="true"
          />
          <span className="line-clamp-2 text-sm font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-amber-700">
            {item.title}
          </span>
        </span>
        {item.meta ? (
          <span className="truncate text-xs text-muted-foreground">{item.meta}</span>
        ) : null}
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.location}</span>
          </span>
          <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-foreground">
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
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: rail.accent }}
            aria-hidden="true"
          />
          {rail.title}
          <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
            ({rail.items.length})
          </span>
        </h2>
        <div className="flex items-center gap-1.5">
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
          <button
            type="button"
            onClick={() => onSeeAll(rail)}
            className="ml-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
          >
            See all →
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
