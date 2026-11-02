import { ArrowUpRight, MapPin } from "lucide-react";
import { cn } from "../../lib/utils.ts";
import { MARKET_DOT_COLORS } from "./marketDots";
import { isNew, type RailItem } from "./marketItems";
import { getKindPlaceholder } from "./marketPlaceholders";
import { KindIcon, NewBadge } from "./MarketRail.tsx";

export default function FlatResultRow({
  item,
  highlighted,
  onOpen,
}: {
  item: RailItem;
  highlighted: boolean;
  onOpen: () => void;
}) {
  const accent = MARKET_DOT_COLORS[item.kind];
  const photo = item.photoUrl || getKindPlaceholder(item.kind, item.meta);
  return (
    <li>
      <button
        type="button"
        data-market-item={`${item.kind}:${item.id}`}
        data-testid={`market-row-${item.id}`}
        data-highlighted={highlighted ? "true" : undefined}
        onClick={onOpen}
        aria-label={`${item.title}, ${item.priceLabel}, ${item.location}`}
        className={cn(
          "group grid w-full grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-3 border-l bg-card p-3 text-left transition-[background,border-color] hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:p-4",
          highlighted && "ring-2 ring-inset ring-warning/70",
        )}
        style={{ borderLeftColor: accent }}
      >
        <img
          src={photo}
          alt=""
          loading="lazy"
          onError={(e) => {
            const fallback = getKindPlaceholder(item.kind, item.meta);
            if (e.currentTarget.src !== fallback) {
              e.currentTarget.src = fallback;
            }
          }}
          className="h-[88px] w-[88px] rounded-xl object-cover sm:h-[96px] sm:w-[120px]"
        />

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: accent }} aria-hidden="true" />
            <span className="line-clamp-2 min-w-0 text-sm font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary sm:truncate">
              {item.title}
            </span>
            {isNew(item.createdAt) ? <NewBadge /> : null}
          </span>
          {item.meta ? <span className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground sm:truncate">{item.meta}</span> : null}
          <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.location}</span>
          </span>
        </span>

        <span className="col-start-2 flex min-w-0 items-center justify-between gap-3 sm:col-start-auto sm:flex-col sm:items-end">
          <span className={cn("min-w-0 text-sm", item.kind === "firm" ? "font-medium text-muted-foreground" : "font-mono font-bold tabular-nums text-foreground")}>
            {item.priceLabel}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
            <span className="hidden sm:inline">View details</span>
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </span>
        </span>
      </button>
    </li>
  );
}
