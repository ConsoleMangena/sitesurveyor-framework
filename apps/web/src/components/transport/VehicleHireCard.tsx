import { useState } from "react";
import type { FareBreakdown, HireVehicle, VehicleTier } from "../../lib/transportHire.ts";
import { VEHICLE_TIERS } from "../../lib/transportHire.ts";
import { Badge } from "../ui/badge.tsx";
import {
  IconBolt,
  IconBus,
  IconCar,
  IconCarSuv,
  IconChevronDown,
  IconChevronUp,
  IconCircleCheckFilled,
  IconClock,
  IconShieldCheckFilled,
  IconStarFilled,
  IconTruck,
  IconTruckDelivery,
  IconUsers,
  IconWeight,
} from "@tabler/icons-react";

interface VehicleHireCardProps {
  vehicle: HireVehicle;
  fareBreakdown: FareBreakdown;
  isSelected: boolean;
  onSelect: (vehicle: HireVehicle) => void;
}

function getTierIcon(tierId: string) {
  switch (tierId) {
    case "bakkie_4x4":
      return <IconTruck className="h-6 w-6 text-rose-600 dark:text-rose-400" />;
    case "crew_van":
      return <IconBus className="h-6 w-6 text-blue-600 dark:text-blue-400" />;
    case "heavy_truck":
      return <IconTruckDelivery className="h-6 w-6 text-amber-600 dark:text-amber-400" />;
    case "executive_suv":
      return <IconCarSuv className="h-6 w-6 text-purple-600 dark:text-purple-400" />;
    case "rapid_runner":
    default:
      return <IconBolt className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />;
  }
}

export function VehicleHireCard({
  vehicle,
  fareBreakdown,
  isSelected,
  onSelect,
}: VehicleHireCardProps) {
  const [showSpecs, setShowSpecs] = useState(false);
  const tier: VehicleTier = VEHICLE_TIERS[vehicle.tierId];

  return (
    <div
      onClick={() => onSelect(vehicle)}
      className={`group relative rounded-2xl border p-4 transition-all duration-200 cursor-pointer ${
        isSelected
          ? "border-rose-500 bg-rose-50/60 dark:bg-rose-950/25 shadow-lg ring-2 ring-rose-500/40"
          : "border-border/70 bg-card hover:border-border hover:bg-muted/40 hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: Vehicle Icon & Details */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl shrink-0 transition-transform group-hover:scale-105 ${
              isSelected ? "bg-rose-500/15" : "bg-muted"
            }`}
          >
            {getTierIcon(vehicle.tierId)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-sm text-foreground group-hover:text-rose-600 transition-colors">
                {vehicle.model}
              </span>
              <Badge
                variant="outline"
                className={`text-[9.5px] font-mono tracking-wider font-semibold uppercase px-1.5 py-0 ${
                  isSelected
                    ? "border-rose-400 bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300"
                    : "border-border bg-muted/60 text-muted-foreground"
                }`}
              >
                {tier.shortName}
              </Badge>
              {tier.badge && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400">
                  {tier.badge}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span className="font-mono text-[11px] font-semibold text-foreground/90">
                {vehicle.licensePlate}
              </span>
              <span>•</span>
              <span className="truncate">{vehicle.color}</span>
              <span>•</span>
              <span className="truncate">{tier.recommendedFor.split(",")[0]}</span>
            </div>
          </div>
        </div>

        {/* Right: Dynamic Distance-Based Fare */}
        <div className="text-right shrink-0">
          <div className="text-xl font-extrabold font-mono tracking-tight text-foreground">
            ${fareBreakdown.totalFare.toFixed(2)}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            ${tier.baseFare.toFixed(0)} base + ${tier.ratePerKm.toFixed(2)}/km
          </div>
        </div>
      </div>

      {/* Middle Row: Driver Profile & Fieldwork Capacities */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-border/50 text-xs">
        {/* Driver Profile */}
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[11px]">
            {vehicle.driverName.charAt(0)}
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-medium text-foreground">{vehicle.driverName}</span>
            <span className="flex items-center gap-0.5 text-amber-500 font-semibold text-[11px]">
              <IconStarFilled className="h-3 w-3 text-amber-500" />
              {vehicle.driverRating.toFixed(2)}
            </span>
            <span className="text-[10.5px] text-muted-foreground font-mono">
              ({vehicle.completedTrips} trips)
            </span>
          </div>
        </div>

        {/* Capacity Specs */}
        <div className="flex items-center gap-3 text-muted-foreground font-mono">
          <span className="flex items-center gap-1 text-[11px]" title="Passenger seats">
            <IconUsers className="h-3.5 w-3.5 text-foreground/70" />
            <span>{tier.seats} seats</span>
          </span>
          <span className="flex items-center gap-1 text-[11px]" title="Cargo Payload capacity">
            <IconWeight className="h-3.5 w-3.5 text-foreground/70" />
            <span>{tier.payloadKg.toLocaleString()} kg</span>
          </span>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <IconClock className="h-3.5 w-3.5" />
            <span>{vehicle.etaMinutes}m ETA</span>
          </span>
        </div>
      </div>

      {/* Expandable Field Features & Equipment */}
      <div className="mt-2.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowSpecs(!showSpecs);
          }}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-medium transition-colors"
        >
          <span>{showSpecs ? "Hide hardware specs" : "View field equipment specs"}</span>
          {showSpecs ? <IconChevronUp className="h-3 w-3" /> : <IconChevronDown className="h-3 w-3" />}
        </button>

        {showSpecs && (
          <div className="mt-2 pt-2 border-t border-dashed border-border/70 text-xs animate-in fade-in-50 duration-150">
            <div className="text-[10.5px] text-muted-foreground mb-1.5 font-medium">
              Hardware & Equipment on Board:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tier.features.map((feature) => (
                <span
                  key={feature}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-[11px] text-muted-foreground"
                >
                  <IconShieldCheckFilled className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>{feature}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Selected Indicator Pill */}
      {isSelected && (
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-medium shadow-sm">
          <IconCircleCheckFilled className="h-3.5 w-3.5" />
          <span>Selected</span>
        </div>
      )}
    </div>
  );
}
