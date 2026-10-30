import { MapPin } from "lucide-react";
import { cn } from "../../lib/utils.ts";
import { MARKET_DOT_COLORS } from "./marketDots";
import { isNew, type RailItem } from "./marketItems";
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
          "group flex w-full items-center gap-4 border-l-4 bg-card px-4 py-4 text-left transition-[background,border-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-muted/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
          highlighted && "ring-2 ring-inset ring-amber-500/70",
        )}
        style={{ borderLeftColor: accent }}
      >
        {item.photoUrl ? (
          <img
            src={item.photoUrl}
            alt=""
            loading="lazy"
            className="h-[84px] w-[120px] shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span
            className="flex h-[84px] w-[120px] shrink-0 items-center justify-center rounded-lg"
            style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}0a)` }}
          >
            <KindIcon kind={item.kind} className="size-6" />
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: accent }}
              aria-hidden="true"
            />
            <span className="truncate text-sm font-semibold tracking-tight text-foreground transition-colors group-hover:text-amber-700">
              {item.title}
            </span>
            {isNew(item.createdAt) ? <NewBadge /> : null}
          </span>
          {item.meta ? (
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {item.meta}
            </span>
          ) : null}
          <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.location}</span>
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block font-mono text-sm font-bold tabular-nums text-foreground">
            {item.priceLabel}
          </span>
          <span className="mt-1 block text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
            View →
          </span>
        </span>
      </button>
    </li>
  );
}
