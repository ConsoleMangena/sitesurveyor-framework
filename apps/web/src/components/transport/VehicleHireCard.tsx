import type { FareBreakdown, HireVehicle, VehicleTier } from "../../lib/transportHire.ts";
import { VEHICLE_TIERS } from "../../lib/transportHire.ts";
import {
  IconArrowUpRight,
  IconClock,
  IconStarFilled,
  IconUsers,
  IconWeight,
} from "@tabler/icons-react";
import { cn } from "../../lib/utils.ts";
import { VEHICLE_TIER_THEME } from "./vehicleTierTheme.ts";

interface VehicleHireCardProps {
  vehicle: HireVehicle;
  fareBreakdown: FareBreakdown;
  isSelected: boolean;
  onSelect: (vehicle: HireVehicle) => void;
  onBookNow?: (vehicle: HireVehicle) => void;
}

export function VehicleHireCard({
  vehicle,
  fareBreakdown,
  isSelected,
  onSelect,
}: VehicleHireCardProps) {
  const tier: VehicleTier = VEHICLE_TIERS[vehicle.tierId];
  const theme = VEHICLE_TIER_THEME[vehicle.tierId];
  const TierIcon = theme.icon;

  return (
    <button
      type="button"
      data-vehicle-id={vehicle.id}
      data-testid={`vehicle-tile-${vehicle.id}`}
      data-selected={isSelected ? "true" : undefined}
      aria-label={`View ${vehicle.model} details, fare $${fareBreakdown.totalFare.toFixed(2)}`}
      onClick={() => onSelect(vehicle)}
      className={cn(
        "group flex w-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-card text-left transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1 hover:border-border hover:shadow-[0_16px_36px_rgba(17,24,39,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isSelected && "border-primary ring-2 ring-primary/40",
      )}
    >
      {/* Compact Top Banner (Market Tile Style) */}
      <div
        className={cn(
          "relative h-32 w-full shrink-0 overflow-hidden border-b border-border/60 bg-gradient-to-br transition-colors",
          theme.bannerBg,
        )}
      >
        <svg
          className="pointer-events-none absolute inset-0 size-full text-foreground/[0.07]"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id={`fleet-grid-${vehicle.id}`}
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <path d="M20 0H0v20" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#fleet-grid-${vehicle.id})`} />
        </svg>

        <span className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              "flex size-12 items-center justify-center rounded-xl border border-border/70 bg-background/85 shadow-xs backdrop-blur-xs transition-transform duration-300 group-hover:scale-105 sm:size-14",
              theme.badgeText,
            )}
          >
            <TierIcon className="size-6 sm:size-7" aria-hidden="true" />
          </span>
        </span>

        {/* Tier Chip */}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/95 px-2.5 py-0.5 text-micro font-semibold text-foreground/80 backdrop-blur-xs">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: theme.dot }}
            aria-hidden="true"
          />
          {tier.shortName}
        </span>

        {/* Selected or ETA Badge */}
        {isSelected ? (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-micro font-semibold text-primary-foreground shadow-xs">
            Selected
          </span>
        ) : (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2.5 py-0.5 font-mono text-micro font-semibold tabular-nums text-success backdrop-blur-xs">
            <IconClock className="size-3" aria-hidden="true" />
            {vehicle.etaMinutes}m ETA
          </span>
        )}
      </div>

      {/* Body Content */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        {/* Title & Badge */}
        <span className="flex items-start gap-1.5">
          <span className="line-clamp-1 min-w-0 flex-1 text-sm font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary sm:text-base">
            {vehicle.model}
          </span>
          {tier.badge ? (
            <span
              className={cn(
                "mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-micro font-semibold",
                theme.badgeBg,
                theme.badgeText,
              )}
            >
              {tier.badge}
            </span>
          ) : null}
        </span>

        {/* Driver, Plate & Rating */}
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{vehicle.driverName}</span>
            {" · "}
            <span className="font-mono text-micro text-muted-foreground">{vehicle.licensePlate}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums text-warning">
            <IconStarFilled className="size-3.5 fill-warning text-warning" aria-hidden="true" />
            {vehicle.driverRating.toFixed(2)}
          </span>
        </span>

        {/* Capacity Specs */}
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <IconUsers className="size-3.5 shrink-0" aria-hidden="true" />
            {tier.seats} seats
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <IconWeight className="size-3.5 shrink-0" aria-hidden="true" />
            {tier.payloadKg.toLocaleString()} kg
          </span>
        </span>

        {/* Footer: Price & Circular Action Arrow */}
        <span className="mt-auto flex items-center justify-between gap-3 border-t border-border/70 pt-3">
          <span className="min-w-0">
            <span className="block font-mono text-base font-bold tabular-nums text-foreground">
              ${fareBreakdown.totalFare.toFixed(2)}
            </span>
            <span className="block font-mono text-micro text-muted-foreground">
              ${tier.ratePerKm.toFixed(2)}/km
            </span>
          </span>
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-bg text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
          >
            <IconArrowUpRight className="size-4" />
          </span>
        </span>
      </div>
    </button>
  );
}
