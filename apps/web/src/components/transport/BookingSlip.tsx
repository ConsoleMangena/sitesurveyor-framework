import { useEffect, useRef, useState } from "react";
import type {
  FareBreakdown,
  HireBooking,
  HireVehicle,
  LocationCoordinate,
  VehicleTier,
} from "../../lib/transportHire.ts";
import {
  formatCoordinates,
  formatDriveDuration,
  generateBookingReference,
  saveBookingToStorage,
  VEHICLE_TIERS,
} from "../../lib/transportHire.ts";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { Label } from "../ui/label.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog.tsx";
import {
  IconAlertCircle,
  IconBuilding,
  IconCash,
  IconCircleCheckFilled,
  IconClock,
  IconCreditCard,
  IconCrosshair,
  IconCurrentLocation,
  IconDeviceMobile,
  IconPhoneCall,
  IconStarFilled,
} from "@tabler/icons-react";
import { cn } from "../../lib/utils.ts";
import { VEHICLE_TIER_THEME } from "./vehicleTierTheme.ts";
import { getVehiclePlaceholder } from "./transportPlaceholders.ts";

type PaymentMethod = "ecocash" | "card" | "cash_on_site" | "corporate_invoice";

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; icon: typeof IconCash }[] = [
  { id: "ecocash", label: "EcoCash", icon: IconDeviceMobile },
  { id: "card", label: "Card / POS", icon: IconCreditCard },
  { id: "cash_on_site", label: "Cash on site", icon: IconCash },
  { id: "corporate_invoice", label: "Corporate", icon: IconBuilding },
];

interface BookingSlipProps {
  vehicle: HireVehicle;
  pickup: LocationCoordinate;
  dropoff: LocationCoordinate;
  fareBreakdown: FareBreakdown;
  durationMinutes: number;
  isOpen: boolean;
  onClose: () => void;
  onBookingConfirmed: (booking: HireBooking) => void;
}

export function BookingSlip({
  vehicle,
  pickup,
  dropoff,
  fareBreakdown,
  durationMinutes,
  isOpen,
  onClose,
  onBookingConfirmed,
}: BookingSlipProps) {
  const tier: VehicleTier = VEHICLE_TIERS[vehicle.tierId];
  const theme = VEHICLE_TIER_THEME[vehicle.tierId];
  const TierIcon = theme.icon;
  const contentRef = useRef<HTMLDivElement>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("ecocash");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<HireBooking | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setConfirmedBooking(null);
    setFormError(null);
    setIsSubmitting(false);
  }, [isOpen, vehicle.id]);

  const handleConfirm = () => {
    if (!contactName.trim()) {
      setFormError("Enter the contact or field surveyor name.");
      return;
    }
    if (!contactPhone.trim()) {
      setFormError("Enter a contact phone number the driver can reach.");
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    window.setTimeout(() => {
      const booking: HireBooking = {
        bookingRef: generateBookingReference(),
        vehicle,
        tier,
        pickup,
        dropoff,
        fareBreakdown,
        durationMinutes,
        status: "dispatched",
        paymentMethod,
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        specialNotes: specialNotes.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      saveBookingToStorage(booking);
      setConfirmedBooking(booking);
      setIsSubmitting(false);
      onBookingConfirmed(booking);
    }, 850);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent
        ref={contentRef}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus({ preventScroll: true });
        }}
        className="web3-theme flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-2xl border border-border/80 bg-background p-0 shadow-2xl sm:max-w-lg sm:gap-0 sm:p-0"
      >
        <div
          className={cn(
            "relative shrink-0 border-b bg-gradient-to-br px-5 py-5 sm:px-6",
            theme.bannerBg,
            theme.border,
          )}
        >
          <div className="flex items-start gap-3 pr-10">
            <div className="relative size-12 shrink-0 overflow-hidden rounded-xl border border-border/70 bg-muted">
              <img
                src={vehicle.photoUrl || getVehiclePlaceholder(vehicle.tierId, vehicle.model)}
                alt={vehicle.model}
                className="h-full w-full object-cover"
                onError={(e) => {
                  const fallback = getVehiclePlaceholder(vehicle.tierId, vehicle.model);
                  if (e.currentTarget.src !== fallback) {
                    e.currentTarget.src = fallback;
                  }
                }}
              />
            </div>
            <DialogHeader className="min-w-0 gap-1 text-left">
              <DialogTitle className="market-dialog-title text-balance text-foreground">
                {confirmedBooking ? "Vehicle dispatched" : "Confirm dispatch"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {confirmedBooking
                  ? "The driver has your pickup coordinates and is on the way."
                  : `${tier.name} · priced for ${fareBreakdown.distanceKm} km of road`}
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        {confirmedBooking ? (
          <>
            <div className="market-detail-scroll flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/80 bg-card px-5 py-6 text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-success/10 text-success">
                  <IconCircleCheckFilled className="size-8" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-micro font-medium text-muted-foreground">Booking reference</p>
                  <p className="mt-0.5 font-mono text-xl font-bold tabular-nums tracking-tight text-foreground">
                    {confirmedBooking.bookingRef}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                  <IconClock className="size-3.5" aria-hidden="true" />
                  Driver arriving in ~{vehicle.etaMinutes} min
                </span>
              </div>

              <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {vehicle.driverName.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {vehicle.driverName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {vehicle.model} ·{" "}
                        <span className="font-mono font-semibold text-foreground">
                          {vehicle.licensePlate}
                        </span>
                      </p>
                    </div>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    className="h-9 shrink-0 gap-1.5 rounded-xl px-3.5 text-xs font-semibold"
                  >
                    <a href={`tel:${vehicle.driverPhone}`}>
                      <IconPhoneCall className="size-3.5" aria-hidden="true" />
                      Call
                    </a>
                  </Button>
                </div>

                <dl className="grid grid-cols-2 gap-3 border-t border-border/70 pt-3 text-xs">
                  <div className="min-w-0">
                    <dt className="text-micro text-muted-foreground">Driver contact</dt>
                    <dd className="mt-0.5 truncate font-mono font-semibold tabular-nums text-foreground">
                      {vehicle.driverPhone}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-micro text-muted-foreground">Payment</dt>
                    <dd className="mt-0.5 truncate font-semibold text-foreground">
                      {PAYMENT_OPTIONS.find((option) => option.id === paymentMethod)?.label}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-micro text-muted-foreground">Total fare</dt>
                    <dd className="mt-0.5 font-mono font-semibold tabular-nums text-foreground">
                      ${confirmedBooking.fareBreakdown.totalFare.toFixed(2)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-micro text-muted-foreground">Contact</dt>
                    <dd className="mt-0.5 truncate font-semibold text-foreground">
                      {confirmedBooking.contactName}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/80 bg-background px-5 py-4 sm:px-6">
              <Button
                type="button"
                className="h-11 rounded-xl px-5 text-sm font-semibold"
                onClick={onClose}
              >
                Back to the fleet
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="market-detail-scroll flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="rounded-2xl border border-border/80 bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{vehicle.model}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      <span className="font-mono font-semibold text-foreground">
                        {vehicle.licensePlate}
                      </span>{" "}
                      · {vehicle.color}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-lg font-bold tabular-nums tracking-tight text-foreground">
                      ${fareBreakdown.totalFare.toFixed(2)}
                    </p>
                    <p className="text-micro text-muted-foreground">Estimated total</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 text-xs">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
                    <span className="truncate font-medium text-foreground">{vehicle.driverName}</span>
                    <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold tabular-nums text-warning">
                      <IconStarFilled className="size-3" aria-hidden="true" />
                      {vehicle.driverRating.toFixed(2)}
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-2 font-mono text-micro tabular-nums text-muted-foreground">
                    {tier.seats} seats · {tier.payloadKg.toLocaleString()} kg ·{" "}
                    <span className="font-semibold text-success">{vehicle.etaMinutes}m ETA</span>
                  </span>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                    <IconCurrentLocation className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">Pickup</p>
                    <p className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatCoordinates(pickup.lat, pickup.lng)}
                    </p>
                    <p className="truncate text-micro text-muted-foreground">{pickup.label}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <IconCrosshair className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">Destination</p>
                    <p className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatCoordinates(dropoff.lat, dropoff.lng)}
                    </p>
                    <p className="truncate text-micro text-muted-foreground">{dropoff.label}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-3 font-mono text-micro tabular-nums text-muted-foreground">
                  <span>
                    Distance{" "}
                    <span className="font-semibold text-foreground">{fareBreakdown.distanceKm} km</span>
                  </span>
                  <span>
                    Drive time{" "}
                    <span className="font-semibold text-foreground">
                      {formatDriveDuration(durationMinutes)}
                    </span>
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4">
                <p className="text-xs font-semibold text-foreground">Fare breakdown</p>
                <dl className="mt-2 space-y-1.5 font-mono text-xs tabular-nums">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">Base pickup fee</dt>
                    <dd className="shrink-0 text-foreground">${fareBreakdown.baseFare.toFixed(2)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">
                      {fareBreakdown.distanceKm} km @ ${fareBreakdown.ratePerKm.toFixed(2)}/km
                    </dt>
                    <dd className="shrink-0 text-foreground">
                      ${fareBreakdown.distanceCost.toFixed(2)}
                    </dd>
                  </div>
                  {fareBreakdown.tollAndRoadFee > 0 ? (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">Highway transit and tolls</dt>
                      <dd className="shrink-0 text-foreground">
                        ${fareBreakdown.tollAndRoadFee.toFixed(2)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-2">
                    <dt className="font-sans text-xs font-semibold text-foreground">Total due</dt>
                    <dd className="shrink-0 text-sm font-bold text-primary">
                      ${fareBreakdown.totalFare.toFixed(2)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="hire-contact-name" className="text-xs font-semibold">
                      Contact / surveyor name
                    </Label>
                    <Input
                      id="hire-contact-name"
                      value={contactName}
                      onChange={(event) => setContactName(event.target.value)}
                      placeholder="e.g. Tendai Chikore"
                      autoComplete="name"
                      className="h-11 rounded-xl border-border/80 bg-background text-sm shadow-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="hire-contact-phone" className="text-xs font-semibold">
                      Contact phone
                    </Label>
                    <Input
                      id="hire-contact-phone"
                      type="tel"
                      value={contactPhone}
                      onChange={(event) => setContactPhone(event.target.value)}
                      placeholder="+263 77 123 4567"
                      autoComplete="tel"
                      className="h-11 rounded-xl border-border/80 bg-background text-sm shadow-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="hire-notes" className="text-xs font-semibold">
                    Site notes <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="hire-notes"
                    value={specialNotes}
                    onChange={(event) => setSpecialNotes(event.target.value)}
                    placeholder="Gate access, equipment to carry, rendezvous point…"
                    className="h-11 rounded-xl border-border/80 bg-background text-sm shadow-none"
                  />
                </div>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold text-foreground">Payment method</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PAYMENT_OPTIONS.map((option) => {
                    const OptionIcon = option.icon;
                    const selected = paymentMethod === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setPaymentMethod(option.id)}
                        className={cn(
                          "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-colors",
                          selected
                            ? "border-primary bg-primary/10 font-semibold text-primary ring-1 ring-primary/30"
                            : "border-border/80 bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <OptionIcon className="size-4" aria-hidden="true" />
                        <span className="text-center leading-tight">{option.label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {formError ? (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-xs leading-5 text-destructive"
                >
                  <IconAlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {formError}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/80 bg-background px-5 py-4 sm:px-6">
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl px-4 text-sm"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-11 rounded-xl px-5 text-sm font-semibold"
                onClick={handleConfirm}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? "Dispatching…"
                  : `Confirm hire · $${fareBreakdown.totalFare.toFixed(2)}`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
