import { useState } from "react";
import type { FareBreakdown, HireVehicle, VehicleTier } from "../../lib/transportHire.ts";
import { VEHICLE_TIERS } from "../../lib/transportHire.ts";
import {
  IconArrowUpRight,
  IconChevronDown,
  IconClock,
  IconShieldCheckFilled,
  IconStarFilled,
  IconUser,
  IconUsers,
  IconWeight,
} from "@tabler/icons-react";
import { Button } from "../ui/button.tsx";
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
  onBookNow,
}: VehicleHireCardProps) {
  const [showSpecs, setShowSpecs] = useState(false);
  const tier: VehicleTier = VEHICLE_TIERS[vehicle.tierId];
  const theme = VEHICLE_TIER_THEME[vehicle.tierId];
  const TierIcon = theme.icon;

  return (
    <article
      data-vehicle-id={vehicle.id}
      data-selected={isSelected ? "true" : undefined}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card text-left transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1 hover:border-border hover:shadow-[0_16px_36px_rgba(17,24,39,0.09)]",
        isSelected && "border-primary ring-2 ring-primary/40",
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(vehicle)}
        aria-label={`Show ${vehicle.model} on the map`}
        aria-pressed={isSelected}
        className={cn(
          "relative h-40 w-full shrink-0 overflow-hidden border-b border-border/60 bg-gradient-to-br focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
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
              width="22"
              height="22"
              patternUnits="userSpaceOnUse"
            >
              <path d="M22 0H0v22" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#fleet-grid-${vehicle.id})`} />
        </svg>

        <span className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              "flex size-16 items-center justify-center rounded-2xl border border-border/70 bg-background/85 shadow-sm backdrop-blur-xs transition-transform duration-300 group-hover:scale-105",
              theme.badgeText,
            )}
          >
            <TierIcon className="size-8" aria-hidden="true" />
          </span>
        </span>

        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/95 px-2.5 py-1 text-micro font-semibold text-foreground/80 backdrop-blur-xs">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: theme.dot }}
            aria-hidden="true"
          />
          {tier.shortName}
        </span>

        {isSelected ? (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-micro font-semibold text-primary-foreground shadow-sm">
            Selected
          </span>
        ) : (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-2.5 py-1 font-mono text-micro font-semibold tabular-nums text-success backdrop-blur-xs">
            <IconClock className="size-3" aria-hidden="true" />
            {vehicle.etaMinutes}m ETA
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="flex items-start gap-1.5">
          <button
            type="button"
            onClick={() => onSelect(vehicle)}
            className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <h3 className="line-clamp-2 text-base font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
              {vehicle.model}
            </h3>
          </button>
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

        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">{vehicle.licensePlate}</span>
            {" · "}
            {vehicle.color}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums text-warning">
            <IconStarFilled className="size-3.5 text-warning" aria-hidden="true" />
            {vehicle.driverRating.toFixed(2)}
            <span className="font-mono text-micro font-medium text-muted-foreground">
              ({vehicle.completedTrips})
            </span>
          </span>
        </span>

        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <IconUser className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{vehicle.driverName}</span>
        </span>

        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <IconUsers className="size-3.5 shrink-0" aria-hidden="true" />
            {tier.seats} seats
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IconWeight className="size-3.5 shrink-0" aria-hidden="true" />
            {tier.payloadKg.toLocaleString()} kg
          </span>
        </span>

        <div>
          <button
            type="button"
            onClick={() => setShowSpecs((value) => !value)}
            aria-expanded={showSpecs}
            className="inline-flex min-h-8 items-center gap-1 rounded text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Onboard hardware
            <IconChevronDown
              className={cn("size-3.5 transition-transform", showSpecs && "rotate-180")}
              aria-hidden="true"
            />
          </button>
          {showSpecs ? (
            <ul className="mt-1 space-y-1 rounded-xl border border-border/60 bg-muted/30 p-2.5">
              {tier.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-1.5 text-micro leading-5 text-muted-foreground"
                >
                  <IconShieldCheckFilled
                    className="mt-0.5 size-3.5 shrink-0 text-success"
                    aria-hidden="true"
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-border/70 pt-3">
          <div className="min-w-0">
            <p className="font-mono text-base font-bold tabular-nums tracking-tight text-foreground">
              ${fareBreakdown.totalFare.toFixed(2)}
            </p>
            <p className="truncate font-mono text-micro tabular-nums text-muted-foreground">
              ${tier.baseFare.toFixed(0)} base + ${tier.ratePerKm.toFixed(2)}/km
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onSelect(vehicle);
              onBookNow?.(vehicle);
            }}
            className="h-9 shrink-0 gap-1 rounded-xl px-3.5 text-xs font-semibold"
          >
            Hire now
            <IconArrowUpRight className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </article>
  );
}
