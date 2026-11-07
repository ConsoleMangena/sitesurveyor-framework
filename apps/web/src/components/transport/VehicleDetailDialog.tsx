import type {
  FareBreakdown,
  HireVehicle,
  LocationCoordinate,
  VehicleTier,
} from "../../lib/transportHire.ts";
import {
  formatCoordinates,
  formatDriveDuration,
  VEHICLE_TIERS,
} from "../../lib/transportHire.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog.tsx";
import { Button } from "../ui/button.tsx";
import {
  IconArrowUpRight,
  IconCheck,
  IconClock,
  IconCrosshair,
  IconCurrentLocation,
  IconMapPin,
  IconPhone,
  IconRoute,
  IconShieldCheckFilled,
  IconStarFilled,
  IconSteeringWheel,
  IconUser,
  IconUsers,
  IconWeight,
} from "@tabler/icons-react";
import { cn } from "../../lib/utils.ts";
import { VEHICLE_TIER_THEME } from "./vehicleTierTheme.ts";

interface VehicleDetailDialogProps {
  vehicle: HireVehicle | null;
  fareBreakdown: FareBreakdown | null;
  pickup: LocationCoordinate;
  dropoff: LocationCoordinate;
  durationMinutes: number;
  isOpen: boolean;
  onClose: () => void;
  onBookNow: (vehicle: HireVehicle) => void;
  onShowOnMap: (vehicle: HireVehicle) => void;
}

export function VehicleDetailDialog({
  vehicle,
  fareBreakdown,
  pickup,
  dropoff,
  durationMinutes,
  isOpen,
  onClose,
  onBookNow,
  onShowOnMap,
}: VehicleDetailDialogProps) {
  if (!vehicle) return null;

  const tier: VehicleTier = VEHICLE_TIERS[vehicle.tierId];
  const theme = VEHICLE_TIER_THEME[vehicle.tierId];
  const TierIcon = theme.icon;

  // Deduplicate tier features and specific vehicle features
  const allFeatures = Array.from(new Set([...tier.features, ...(vehicle.features ?? [])]));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden p-0 sm:max-w-3xl">
        {/* Banner with Tier Theme */}
        <div
          className={cn(
            "relative flex min-h-[140px] w-full shrink-0 items-end overflow-hidden border-b border-border/70 p-5 sm:min-h-[160px] sm:p-6",
            theme.bannerBg,
          )}
        >
          <svg
            className="pointer-events-none absolute inset-0 size-full text-foreground/[0.06]"
            aria-hidden="true"
          >
            <defs>
              <pattern
                id={`detail-grid-${vehicle.id}`}
                width="24"
                height="24"
                patternUnits="userSpaceOnUse"
              >
                <path d="M24 0H0v24" fill="none" stroke="currentColor" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#detail-grid-${vehicle.id})`} />
          </svg>

          <div className="relative z-10 flex w-full flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <span
                className={cn(
                  "flex size-14 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-background/90 shadow-sm backdrop-blur-xs sm:size-16",
                  theme.badgeText,
                )}
              >
                <TierIcon className="size-8 sm:size-9" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-2.5 py-0.5 text-micro font-semibold text-foreground/80 backdrop-blur-xs">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: theme.dot }}
                    aria-hidden="true"
                  />
                  {tier.shortName}
                </span>
                <DialogHeader className="p-0 text-left">
                  <DialogTitle className="mt-1 text-lg font-bold text-foreground sm:text-2xl">
                    {vehicle.model}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground sm:text-sm">
                    {vehicle.licensePlate} · {vehicle.color} · Available for immediate dispatch
                  </DialogDescription>
                </DialogHeader>
              </div>
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/15 px-3 py-1 font-mono text-xs font-semibold tabular-nums text-success backdrop-blur-xs">
              <IconClock className="size-3.5" aria-hidden="true" />
              {vehicle.etaMinutes}m ETA to pickup
            </span>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
          {/* Key Quick Specifications */}
          <section aria-label="Vehicle specifications">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Capacity & Class Specifications
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <IconUsers className="size-4" aria-hidden="true" />
                  <span>Seating</span>
                </div>
                <p className="mt-1 font-mono text-base font-bold text-foreground">
                  {tier.seats} <span className="text-xs font-normal text-muted-foreground">seats</span>
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <IconWeight className="size-4" aria-hidden="true" />
                  <span>Max Payload</span>
                </div>
                <p className="mt-1 font-mono text-base font-bold text-foreground">
                  {tier.payloadKg.toLocaleString()}{" "}
                  <span className="text-xs font-normal text-muted-foreground">kg</span>
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <IconSteeringWheel className="size-4" aria-hidden="true" />
                  <span>Base Rate</span>
                </div>
                <p className="mt-1 font-mono text-base font-bold text-foreground">
                  ${tier.baseFare.toFixed(0)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    + ${tier.ratePerKm.toFixed(2)}/km
                  </span>
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <IconRoute className="size-4" aria-hidden="true" />
                  <span>Min. Fare</span>
                </div>
                <p className="mt-1 font-mono text-base font-bold text-foreground">
                  ${tier.minFare.toFixed(0)}{" "}
                  <span className="text-xs font-normal text-muted-foreground">per trip</span>
                </p>
              </div>
            </div>
          </section>

          {/* Assigned Driver Profile */}
          <section aria-label="Assigned driver profile">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Assigned Field Driver
            </h3>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <IconUser className="size-6" aria-hidden="true" />
                </span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-foreground">{vehicle.driverName}</p>
                    <IconShieldCheckFilled
                      className="size-4 text-info"
                      aria-label="Verified driver"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Site-inducted & cross-border certified driver
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1 font-semibold text-warning">
                  <IconStarFilled className="size-4" aria-hidden="true" />
                  <span className="text-sm font-bold">{vehicle.driverRating.toFixed(2)}</span>
                  <span className="font-normal text-muted-foreground">
                    ({vehicle.completedTrips} trips)
                  </span>
                </div>
                {vehicle.driverPhone ? (
                  <span className="inline-flex items-center gap-1 font-mono text-muted-foreground">
                    <IconPhone className="size-3.5" aria-hidden="true" />
                    {vehicle.driverPhone}
                  </span>
                ) : null}
              </div>
            </div>
          </section>

          {/* Onboard Hardware & Survey Features */}
          <section aria-label="Onboard hardware and equipment">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Onboard Hardware & Worksite Equipment
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {allFeatures.map((feature) => (
                <div
                  key={feature}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-card p-2.5 text-xs text-foreground shadow-xs"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                    <IconCheck className="size-3" aria-hidden="true" />
                  </span>
                  <span className="font-medium">{feature}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Route & Transparent Distance Fare */}
          {fareBreakdown ? (
            <section aria-label="Fare breakdown">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Trip Route & Calculated Distance Fare
              </h3>
              <div className="mt-3 overflow-hidden rounded-xl border border-border/80 bg-card">
                <div className="grid grid-cols-1 divide-y divide-border/60 border-b border-border/80 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                  <div className="p-3.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <IconCurrentLocation className="size-3.5 text-success" aria-hidden="true" />
                      <span>Pickup coordinates</span>
                    </div>
                    <p className="mt-1 font-mono text-xs font-semibold text-foreground">
                      {formatCoordinates(pickup.lat, pickup.lng)}
                    </p>
                  </div>
                  <div className="p-3.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <IconCrosshair className="size-3.5 text-info" aria-hidden="true" />
                      <span>Dropoff coordinates</span>
                    </div>
                    <p className="mt-1 font-mono text-xs font-semibold text-foreground">
                      {formatCoordinates(dropoff.lat, dropoff.lng)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 p-4 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Base dispatch rate</span>
                    <span className="font-mono tabular-nums text-foreground">
                      ${fareBreakdown.baseFare.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>
                      Road distance ({fareBreakdown.distanceKm.toFixed(1)} km × $
                      {fareBreakdown.ratePerKm.toFixed(2)}/km)
                    </span>
                    <span className="font-mono tabular-nums text-foreground">
                      ${fareBreakdown.distanceCost.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Tolls & Worksite Access Fee</span>
                    <span className="font-mono tabular-nums text-foreground">
                      ${fareBreakdown.tollAndRoadFee.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border/80 pt-2 text-sm font-semibold text-foreground">
                    <span>Total Fare ({formatDriveDuration(durationMinutes)})</span>
                    <span className="font-mono text-lg font-bold text-primary">
                      ${fareBreakdown.totalFare.toFixed(2)} {fareBreakdown.currency}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        {/* Action Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/80 bg-background px-5 py-3.5 sm:px-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => onShowOnMap(vehicle)}
            className="h-10 gap-1.5 rounded-xl px-4 text-xs font-semibold"
          >
            <IconMapPin className="size-4" aria-hidden="true" />
            <span>Show on map</span>
          </Button>

          <Button
            type="button"
            onClick={() => onBookNow(vehicle)}
            className="h-10 gap-1.5 rounded-xl px-5 text-xs font-semibold shadow-sm"
          >
            <span>
              {fareBreakdown
                ? `Hire this vehicle · $${fareBreakdown.totalFare.toFixed(2)}`
                : "Hire this vehicle"}
            </span>
            <IconArrowUpRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

