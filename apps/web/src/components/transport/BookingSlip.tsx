import { useState } from "react";
import type { FareBreakdown, HireBooking, HireLocation, HireVehicle, VehicleTier } from "../../lib/transportHire.ts";
import {
  generateBookingReference,
  saveBookingToStorage,
  VEHICLE_TIERS,
} from "../../lib/transportHire.ts";
import { Button } from "../ui/button.tsx";
import { Badge } from "../ui/badge.tsx";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  MapPin,
  Navigation,
  Phone,
  PhoneCall,
  ShieldCheck,
  Smartphone,
  Star,
  Truck,
  Users,
  Weight,
  X,
} from "lucide-react";

interface BookingSlipProps {
  vehicle: HireVehicle;
  pickup: HireLocation;
  dropoff: HireLocation;
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

  const [paymentMethod, setPaymentMethod] = useState<
    "ecocash" | "card" | "cash_on_site" | "corporate_invoice"
  >("ecocash");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<HireBooking | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!contactName.trim()) {
      setFormError("Please enter the contact / field surveyor name");
      return;
    }
    if (!contactPhone.trim()) {
      setFormError("Please enter a valid contact phone number");
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    // Simulate dispatch network latency
    setTimeout(() => {
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
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in-50">
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl p-6 sm:p-7">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {!confirmedBooking ? (
          <div>
            {/* Header */}
            <div className="flex items-center gap-3 pb-4 border-b border-border">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
                <Truck className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Confirm Vehicle Hire</h2>
                <p className="text-xs text-muted-foreground">
                  Direct dispatch with live GPS tracking and distance pricing
                </p>
              </div>
            </div>

            {/* Vehicle & Driver Summary Plate */}
            <div className="mt-4 p-4 rounded-xl bg-muted/40 border border-border/80">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-sm">{vehicle.model}</span>
                    <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                      {tier.shortName}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                    Registration: <span className="font-bold text-foreground">{vehicle.licensePlate}</span> • {vehicle.color}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-lg font-mono font-bold text-foreground">
                    ${fareBreakdown.totalFare.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    Est. Total Fare
                  </div>
                </div>
              </div>

              {/* Driver info & capacity */}
              <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">Driver: {vehicle.driverName}</span>
                  <span className="flex items-center gap-0.5 text-amber-500 font-semibold">
                    <Star className="h-3 w-3 fill-amber-500" />
                    {vehicle.driverRating.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground font-mono text-[11px]">
                  <span>{tier.seats} seats</span>
                  <span>•</span>
                  <span>{tier.payloadKg} kg payload</span>
                  <span>•</span>
                  <span className="text-emerald-600 font-semibold">{vehicle.etaMinutes}m ETA</span>
                </div>
              </div>
            </div>

            {/* Route Summary */}
            <div className="mt-4 p-3.5 rounded-xl border border-border/60 bg-card space-y-2.5">
              <div className="flex items-start gap-2.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 shrink-0 mt-0.5">
                  <MapPin className="h-3 w-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
                    Pickup Location
                  </div>
                  <div className="text-xs font-semibold text-foreground truncate">{pickup.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{pickup.subtitle}</div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 pl-0.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/15 text-rose-600 shrink-0 mt-0.5">
                  <Navigation className="h-3 w-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
                    Destination / Dropoff
                  </div>
                  <div className="text-xs font-semibold text-foreground truncate">{dropoff.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{dropoff.subtitle}</div>
                </div>
              </div>

              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs font-mono text-muted-foreground">
                <span>Distance: <strong className="text-foreground">{fareBreakdown.distanceKm} km</strong></span>
                <span>Est. Drive Time: <strong className="text-foreground">{durationMinutes > 0 ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m` : "Local"}</strong></span>
              </div>
            </div>

            {/* Itemized Fare Receipt */}
            <div className="mt-4 p-3.5 rounded-xl border border-dashed border-border bg-muted/20 text-xs">
              <div className="font-semibold text-foreground pb-2 border-b border-border/60 flex items-center justify-between">
                <span>Itemized Price Breakdown</span>
                <span className="font-mono text-muted-foreground text-[11px] font-normal">
                  Distance-based model
                </span>
              </div>

              <div className="mt-2 space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between text-muted-foreground">
                  <span>Base Pickup & Dispatch Fee</span>
                  <span className="text-foreground">${fareBreakdown.baseFare.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    Distance ({fareBreakdown.distanceKm} km × ${fareBreakdown.ratePerKm.toFixed(2)}/km)
                  </span>
                  <span className="text-foreground">${fareBreakdown.distanceCost.toFixed(2)}</span>
                </div>
                {fareBreakdown.tollAndRoadFee > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Highway Tolls & Transit Levy</span>
                    <span className="text-foreground">${fareBreakdown.tollAndRoadFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-border/60 flex justify-between font-bold text-xs text-foreground">
                  <span>Total Vehicle Hire</span>
                  <span className="text-rose-600 text-sm font-bold">
                    ${fareBreakdown.totalFare.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Passenger / Contact Input */}
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground uppercase font-mono tracking-wider mb-1">
                    Contact / Field Surveyor Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="e.g. Tendai Chikore"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground uppercase font-mono tracking-wider mb-1">
                    Contact Phone Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+263 77 123 4567"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-muted-foreground uppercase font-mono tracking-wider mb-1">
                  Site Notes & Cargo Requirements (Optional)
                </label>
                <input
                  type="text"
                  value={specialNotes}
                  onChange={(e) => setSpecialNotes(e.target.value)}
                  placeholder="e.g. Gate pass required at mining shaft, carry PVC casing ropes"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background focus:ring-1 focus:ring-rose-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="mt-4">
              <label className="block text-[11px] font-medium text-muted-foreground uppercase font-mono tracking-wider mb-2">
                Payment Option
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "ecocash", label: "EcoCash", icon: Smartphone },
                  { id: "card", label: "Card / POS", icon: CreditCard },
                  { id: "cash_on_site", label: "Cash on Site", icon: DollarSign },
                  { id: "corporate_invoice", label: "Corp Account", icon: Building2 },
                ].map((opt) => {
                  const Icon = opt.icon;
                  const isOptSelected = paymentMethod === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPaymentMethod(opt.id as typeof paymentMethod)}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-medium transition-all ${
                        isOptSelected
                          ? "border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold ring-1 ring-rose-500/30"
                          : "border-border bg-background hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4 mb-1" />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Form Error Notice */}
            {formError && (
              <div className="mt-3 flex items-center gap-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="bg-rose-600 hover:bg-rose-700 text-white font-semibold px-5"
              >
                {isSubmitting ? "Dispatching Vehicle..." : `Confirm & Book ($${fareBreakdown.totalFare.toFixed(2)})`}
              </Button>
            </div>
          </div>
        ) : (
          /* Booking Confirmation State */
          <div className="text-center py-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 mb-4 animate-in zoom-in-75">
              <CheckCircle2 className="h-10 w-10" />
            </div>

            <h3 className="text-xl font-bold text-foreground">Vehicle Dispatched!</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Your survey hire has been scheduled and driver has been notified.
            </p>

            {/* Booking Code Banner */}
            <div className="mt-5 p-4 rounded-xl bg-muted/60 border border-border inline-block min-w-[280px]">
              <div className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
                Booking Reference
              </div>
              <div className="text-2xl font-mono font-extrabold text-foreground tracking-wider mt-0.5">
                {confirmedBooking.bookingRef}
              </div>
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-mono text-[11px] font-semibold">
                <Clock className="h-3 w-3" />
                Driver arriving in ~{vehicle.etaMinutes} mins
              </div>
            </div>

            {/* Assigned Driver Card */}
            <div className="mt-5 text-left p-4 rounded-xl border border-border/80 bg-card space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                    {vehicle.driverName.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-foreground">{vehicle.driverName}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {vehicle.model} • <strong className="text-foreground">{vehicle.licensePlate}</strong>
                    </div>
                  </div>
                </div>

                <a
                  href={`tel:${vehicle.driverPhone}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-colors"
                >
                  <PhoneCall className="h-3.5 w-3.5" />
                  <span>Call</span>
                </a>
              </div>

              <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
                <span>Driver Contact: <strong className="text-foreground font-mono">{vehicle.driverPhone}</strong></span>
                <span>Payment: <strong className="uppercase font-mono text-foreground">{paymentMethod.replace("_", " ")}</strong></span>
              </div>
            </div>

            {/* Done Action */}
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-8 bg-foreground text-background hover:bg-foreground/90 font-semibold"
              >
                Back to Fleet
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
