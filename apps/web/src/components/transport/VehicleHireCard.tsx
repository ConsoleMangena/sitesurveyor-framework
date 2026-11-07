import { useState } from "react";
import type { FareBreakdown, HireVehicle, VehicleTier } from "../../lib/transportHire.ts";
import { VEHICLE_TIERS } from "../../lib/transportHire.ts";
import {
  IconBolt,
  IconBus,
  IconCarSuv,
  IconClock,
  IconShieldCheckFilled,
  IconStarFilled,
  IconTruck,
  IconTruckDelivery,
  IconUsers,
  IconWeight,
} from "@tabler/icons-react";
import { Button } from "../ui/button.tsx";

interface VehicleHireCardProps {
  vehicle: HireVehicle;
  fareBreakdown: FareBreakdown;
  isSelected: boolean;
  onSelect: (vehicle: HireVehicle) => void;
  onBookNow?: (vehicle: HireVehicle) => void;
}

function getTierIcon(tierId: string) {
  switch (tierId) {
    case "bakkie_4x4":
      return <IconTruck className="h-8 w-8 text-rose-600 dark:text-rose-400" />;
    case "crew_van":
      return <IconBus className="h-8 w-8 text-blue-600 dark:text-blue-400" />;
    case "heavy_truck":
      return <IconTruckDelivery className="h-8 w-8 text-amber-600 dark:text-amber-400" />;
    case "executive_suv":
      return <IconCarSuv className="h-8 w-8 text-purple-600 dark:text-purple-400" />;
    case "rapid_runner":
    default:
      return <IconBolt className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />;
  }
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

  return (
    <div
      onClick={() => onSelect(vehicle)}
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-card text-left transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(17,24,39,0.09)] cursor-pointer ${
        isSelected
          ? "border-rose-500 ring-2 ring-rose-500/30 shadow-lg"
          : "border-border/80 hover:border-border"
      }`}
    >
      {/* Top Banner (Photo/Icon area matching MarketRail) */}
      <div className="relative h-36 w-full shrink-0 overflow-hidden bg-muted/60 flex items-center justify-center border-b border-border/60">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-background/80 shadow-sm border border-border/60 transition-transform duration-300 group-hover:scale-110">
          {getTierIcon(vehicle.tierId)}
        </div>

        {/* Top-Left Category Badge */}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/95 px-2.5 py-1 text-[11px] font-semibold text-foreground/80 backdrop-blur-xs">
          <span>{tier.shortName}</span>
        </span>

        {/* Top-Right Badge: Selected or ETA */}
        {isSelected ? (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-rose-500 bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
            <span>Selected</span>
          </span>
        ) : (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 backdrop-blur-xs">
            <IconClock className="h-3 w-3" />
            <span>{vehicle.etaMinutes}m ETA</span>
          </span>
        )}

        {/* Selected Accent Banner */}
        {isSelected && (
          <div className="absolute bottom-0 inset-x-0 h-1 bg-rose-600" />
        )}
      </div>

      {/* Card Content Area */}
      <div className="flex flex-1 flex-col gap-2.5 p-4 sm:p-5">
        {/* Model Title & Plate */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 text-base font-bold tracking-tight text-foreground transition-colors group-hover:text-rose-600">
              {vehicle.model}
            </h3>
            {tier.badge && (
              <span className="inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-400">
                {tier.badge}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground font-mono">
            <span className="font-semibold text-foreground">{vehicle.licensePlate}</span>
            <span>•</span>
            <span className="truncate">{vehicle.color}</span>
          </div>
        </div>

        {/* Driver Profile */}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[11px]">
              {vehicle.driverName.charAt(0)}
            </div>
            <span className="font-medium text-foreground truncate max-w-[120px]">
              {vehicle.driverName}
            </span>
          </div>
          <div className="flex items-center gap-1 text-amber-500 font-semibold text-xs font-mono">
            <IconStarFilled className="h-3.5 w-3.5" />
            <span>{vehicle.driverRating.toFixed(2)}</span>
            <span className="text-muted-foreground text-[10.5px]">({vehicle.completedTrips})</span>
          </div>
        </div>

        {/* Field Capacities */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono pt-1">
          <span className="flex items-center gap-1" title="Seats">
            <IconUsers className="h-3.5 w-3.5 text-foreground/70" />
            <span>{tier.seats} seats</span>
          </span>
          <span className="flex items-center gap-1" title="Cargo Payload">
            <IconWeight className="h-3.5 w-3.5 text-foreground/70" />
            <span>{tier.payloadKg.toLocaleString()} kg</span>
          </span>
        </div>

        {/* Hardware Specifications Toggle */}
        <div className="pt-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowSpecs(!showSpecs);
            }}
            className="text-[11px] text-muted-foreground hover:text-foreground font-medium underline underline-offset-2 transition-colors"
          >
            {showSpecs ? "Hide hardware specs" : "View onboard hardware specs"}
          </button>
          {showSpecs && (
            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground animate-in fade-in-50 duration-150">
              {tier.features.map((f) => (
                <div key={f} className="flex items-center gap-1.5">
                  <IconShieldCheckFilled className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Price & Action Row (Matching Marketplace Card Footer) */}
        <div className="mt-auto pt-3 border-t border-border/80 flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Calculated Total Fare
            </div>
            <div className="text-xl font-mono font-extrabold text-foreground tracking-tight">
              ${fareBreakdown.totalFare.toFixed(2)}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">
              ${tier.baseFare.toFixed(0)} base + ${tier.ratePerKm.toFixed(2)}/km
            </div>
          </div>

          <Button
            type="button"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(vehicle);
              if (onBookNow) onBookNow(vehicle);
            }}
            className="bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs px-3.5 h-9 shrink-0 shadow-sm"
          >
            Hire Now
          </Button>
        </div>
      </div>
    </div>
  );
}
