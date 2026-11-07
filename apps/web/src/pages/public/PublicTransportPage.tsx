import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownUp,
  ArrowRight,
  Car,
  ChevronRight,
  Clock,
  Compass,
  History,
  Layers,
  MapPin,
  Navigation,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  Users,
  Weight,
  X,
} from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { Badge } from "../../components/ui/badge.tsx";
import { AccountMenu, AccountMenuAvatar, AccountMenuItem } from "../../components/account-menu.tsx";
import { ThemeToggle } from "../../components/theme/ThemeToggle.tsx";
import { useAuthStore } from "../../lib/auth/auth-store.ts";
import TransportMap, { type TransportMapHandle } from "../../components/transport/TransportMap.tsx";
import { VehicleHireCard } from "../../components/transport/VehicleHireCard.tsx";
import { BookingSlip } from "../../components/transport/BookingSlip.tsx";
import {
  calculateHireFare,
  calculateRoadDistanceKm,
  estimateDriveDurationMinutes,
  formatDriveDuration,
  generateFleetForLocation,
  loadSavedBookings,
  REGIONAL_HUBS,
  VEHICLE_TIERS,
  type HireBooking,
  type HireLocation,
  type HireVehicle,
  type VehicleTierId,
} from "../../lib/transportHire.ts";

export default function PublicTransportPage() {
  const { user } = useAuthStore();
  const mapRef = useRef<TransportMapHandle>(null);

  // Locations state
  const [pickup, setPickup] = useState<HireLocation>(REGIONAL_HUBS[0]); // Default Harare Central
  const [dropoff, setDropoff] = useState<HireLocation>(REGIONAL_HUBS[2]); // Default Bulawayo Main
  const [selectedTier, setSelectedTier] = useState<VehicleTierId | "all">("all");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  // Mobile View Tab
  const [mobileTab, setMobileTab] = useState<"fleet" | "map">("fleet");

  // Booking Modal State
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [recentBookings, setRecentBookings] = useState<HireBooking[]>(() => loadSavedBookings());
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Distance & Drive Time
  const distanceKm = useMemo(() => {
    if (!pickup || !dropoff) return 0;
    return calculateRoadDistanceKm(
      pickup.latitude,
      pickup.longitude,
      dropoff.latitude,
      dropoff.longitude,
    );
  }, [pickup, dropoff]);

  const durationMinutes = useMemo(() => {
    return estimateDriveDurationMinutes(distanceKm);
  }, [distanceKm]);

  // Generate fleet for current pickup location
  const fleet = useMemo(() => {
    return generateFleetForLocation(pickup, selectedTier);
  }, [pickup, selectedTier]);

  // Automatically select the first vehicle if none selected or selected one not in filtered fleet
  const activeVehicle = useMemo(() => {
    if (selectedVehicleId) {
      const found = fleet.find((v) => v.id === selectedVehicleId);
      if (found) return found;
    }
    return fleet[0] || null;
  }, [fleet, selectedVehicleId]);

  // Swap pickup & dropoff
  const handleSwapLocations = useCallback(() => {
    setPickup(dropoff);
    setDropoff(pickup);
  }, [pickup, dropoff]);

  // Set quick corridor route
  const handleSelectQuickRoute = useCallback(
    (originId: string, destId: string) => {
      const orig = REGIONAL_HUBS.find((h) => h.id === originId);
      const dest = REGIONAL_HUBS.find((h) => h.id === destId);
      if (orig && dest) {
        setPickup(orig);
        setDropoff(dest);
        setSelectedVehicleId(null);
      }
    },
    [],
  );

  // Handle map click for custom coordinate pin
  const handleMapClickCoordinate = useCallback(
    (lat: number, lng: number) => {
      // Create a custom field pin as dropoff if user clicks the map
      const customPin: HireLocation = {
        id: `custom-pin-${Date.now()}`,
        name: `Field Site (${lat.toFixed(3)}, ${lng.toFixed(3)})`,
        subtitle: "Custom GPS Coordinates pinned on map",
        latitude: lat,
        longitude: lng,
        region: "Field Worksite",
        type: "custom_pin",
      };
      setDropoff(customPin);
    },
    [],
  );

  const handleSelectVehicle = useCallback((vehicle: HireVehicle) => {
    setSelectedVehicleId(vehicle.id);
    if (mapRef.current) {
      mapRef.current.focusVehicle(vehicle);
    }
  }, []);

  const handleBookingConfirmed = useCallback((booking: HireBooking) => {
    setRecentBookings((prev) => [booking, ...prev.slice(0, 19)]);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground antialiased selection:bg-rose-500/20 selection:text-rose-600">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 font-bold text-foreground">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-600 text-white font-mono text-sm font-extrabold shadow-sm">
                S
              </span>
              <span className="tracking-tight text-base">SiteSurveyor</span>
            </Link>

            <span className="hidden sm:inline-block h-4 w-px bg-border" />

            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-mono text-xs font-semibold">
              <Truck className="h-3.5 w-3.5" />
              <span>Vehicle Hire</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/market"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors"
            >
              <Store className="h-3.5 w-3.5" />
              <span>Marketplace</span>
            </Link>

            {recentBookings.length > 0 && (
              <button
                type="button"
                onClick={() => setShowHistoryModal(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md bg-muted/60 hover:bg-muted text-foreground transition-colors"
              >
                <History className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">Trips</span>
                <Badge variant="secondary" className="px-1 py-0 text-[10px] h-4 font-mono">
                  {recentBookings.length}
                </Badge>
              </button>
            )}

            <ThemeToggle />

            {user ? (
              <AccountMenu
                user={user}
                trigger={
                  <button
                    type="button"
                    className="rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <AccountMenuAvatar user={user} />
                  </button>
                }
              >
                <AccountMenuItem icon={Settings} label="Settings" to="/settings" />
              </AccountMenu>
            ) : (
              <Button asChild size="sm" variant="default" className="text-xs bg-rose-600 hover:bg-rose-700 text-white h-8">
                <Link to="/auth/sign-in">Sign In</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5">
        {/* Mobile View Toggle Bar */}
        <div className="md:hidden flex items-center p-1 bg-muted/60 rounded-xl mb-4 border border-border/80">
          <button
            type="button"
            onClick={() => setMobileTab("fleet")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
              mobileTab === "fleet"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Car className="h-3.5 w-3.5" />
            <span>Vehicles ({fleet.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("map")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all ${
              mobileTab === "map"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Map & Route</span>
          </button>
        </div>

        {/* Desktop Split Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          {/* Left Column: Route Selector, Tier Filter & Available Vehicles List */}
          <div
            className={`md:col-span-6 lg:col-span-5 space-y-4 ${
              mobileTab === "fleet" ? "block" : "hidden md:block"
            }`}
          >
            {/* Header Title */}
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                Field Vehicle Hire
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                On-demand survey 4x4 bakkies, crew vans & heavy haulage. Dynamic Uber-style distance pricing.
              </p>
            </div>

            {/* Route Planning Card */}
            <div className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-3">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-bold uppercase tracking-wider font-mono text-muted-foreground">
                  Trip Route
                </span>
                <button
                  type="button"
                  onClick={handleSwapLocations}
                  className="inline-flex items-center gap-1 text-[11px] font-mono text-rose-600 hover:text-rose-700 dark:text-rose-400 font-semibold transition-colors"
                >
                  <ArrowDownUp className="h-3 w-3" />
                  <span>Swap Direction</span>
                </button>
              </div>

              {/* Pickup Selector */}
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Pickup Location (Survey Depot / Station)</span>
                </label>
                <select
                  value={pickup.id}
                  onChange={(e) => {
                    const found = REGIONAL_HUBS.find((h) => h.id === e.target.value);
                    if (found) setPickup(found);
                  }}
                  className="w-full text-xs rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground focus:ring-1 focus:ring-rose-500 focus:outline-none"
                >
                  {REGIONAL_HUBS.map((hub) => (
                    <option key={hub.id} value={hub.id}>
                      {hub.name} ({hub.region})
                    </option>
                  ))}
                </select>
                <div className="text-[10px] text-muted-foreground pl-3.5 truncate">
                  {pickup.subtitle}
                </div>
              </div>

              {/* Dropoff Selector */}
              <div className="space-y-1 pt-1">
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  <span>Dropoff / Field Destination</span>
                </label>
                <select
                  value={dropoff.id}
                  onChange={(e) => {
                    const found = REGIONAL_HUBS.find((h) => h.id === e.target.value);
                    if (found) setDropoff(found);
                  }}
                  className="w-full text-xs rounded-lg border border-border bg-background px-3 py-2 font-medium text-foreground focus:ring-1 focus:ring-rose-500 focus:outline-none"
                >
                  {dropoff.type === "custom_pin" && (
                    <option value={dropoff.id}>{dropoff.name}</option>
                  )}
                  {REGIONAL_HUBS.map((hub) => (
                    <option key={hub.id} value={hub.id}>
                      {hub.name} ({hub.region})
                    </option>
                  ))}
                </select>
                <div className="text-[10px] text-muted-foreground pl-3.5 truncate">
                  {dropoff.subtitle}
                </div>
              </div>

              {/* Quick Route Shortcuts */}
              <div className="pt-2 border-t border-border/60">
                <div className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider mb-1.5">
                  Frequent Corridors:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: "Harare ↔ Bulawayo", orig: "hre-central", dest: "byo-central" },
                    { label: "Harare ↔ Mutare", orig: "hre-central", dest: "mut-central" },
                    { label: "Bulawayo ↔ Vic Falls", orig: "byo-central", dest: "vic-central" },
                    { label: "Gweru ↔ Kwekwe", orig: "gwe-central", dest: "kwe-central" },
                    { label: "Masvingo ↔ Beitbridge", orig: "mas-central", dest: "bei-central" },
                  ].map((route) => (
                    <button
                      key={route.label}
                      type="button"
                      onClick={() => handleSelectQuickRoute(route.orig, route.dest)}
                      className="px-2 py-0.5 rounded-md bg-muted/60 hover:bg-muted text-[11px] font-mono text-muted-foreground hover:text-foreground border border-border/40 transition-colors"
                    >
                      {route.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Distance & ETA Readout Band */}
              {distanceKm > 0 && (
                <div className="pt-2.5 border-t border-border/80 flex items-center justify-between text-xs bg-muted/20 -mx-4 -mb-4 px-4 py-3 rounded-b-xl">
                  <div className="flex items-center gap-3 font-mono">
                    <div>
                      <span className="text-[10px] text-muted-foreground block">ROAD DISTANCE</span>
                      <strong className="text-sm text-foreground">{distanceKm} km</strong>
                    </div>
                    <div className="h-6 w-px bg-border" />
                    <div>
                      <span className="text-[10px] text-muted-foreground block">EST. DRIVE TIME</span>
                      <strong className="text-sm text-foreground">{formatDriveDuration(durationMinutes)}</strong>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                      <Sparkles className="h-3 w-3" />
                      Live Route
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Vehicle Tier Category Filter Tabs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase font-mono tracking-wider text-muted-foreground">
                  Available Fleet Near {pickup.name.split(" ")[0]} ({fleet.length})
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  Rates from $0.55/km
                </span>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedTier("all")}
                  className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                    selectedTier === "all"
                      ? "bg-foreground text-background font-semibold shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  All Vehicles
                </button>
                {(Object.keys(VEHICLE_TIERS) as VehicleTierId[]).map((tierId) => {
                  const t = VEHICLE_TIERS[tierId];
                  const isCurSelected = selectedTier === tierId;
                  return (
                    <button
                      key={tierId}
                      type="button"
                      onClick={() => setSelectedTier(tierId)}
                      className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                        isCurSelected
                          ? "bg-foreground text-background font-semibold shadow-sm"
                          : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {t.shortName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Fleet List */}
            <div className="space-y-3">
              {fleet.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-dashed border-border text-muted-foreground">
                  <Truck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <div className="text-sm font-semibold">No vehicles in this category</div>
                  <div className="text-xs mt-1">Try selecting "All Vehicles" to see the full fleet</div>
                </div>
              ) : (
                fleet.map((vehicle) => {
                  const fare = calculateHireFare(VEHICLE_TIERS[vehicle.tierId], distanceKm);
                  const isSelected = activeVehicle?.id === vehicle.id;
                  return (
                    <VehicleHireCard
                      key={vehicle.id}
                      vehicle={vehicle}
                      fareBreakdown={fare}
                      isSelected={isSelected}
                      onSelect={handleSelectVehicle}
                    />
                  );
                })
              )}
            </div>

            {/* Bottom Book Vehicle CTA Bar */}
            {activeVehicle && (
              <div className="sticky bottom-4 z-20 p-4 rounded-xl border border-rose-500/40 bg-card/95 backdrop-blur-md shadow-xl flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-muted-foreground font-mono">
                    Selected: <strong className="text-foreground">{activeVehicle.model}</strong>
                  </div>
                  <div className="text-lg font-mono font-bold text-foreground">
                    ${calculateHireFare(VEHICLE_TIERS[activeVehicle.tierId], distanceKm).totalFare.toFixed(2)}
                    <span className="text-xs font-normal text-muted-foreground ml-1">
                      ({distanceKm} km total)
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={() => setIsBookingOpen(true)}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-6 shadow-md"
                >
                  <span>Book Vehicle</span>
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            )}
          </div>

          {/* Right Column: Interactive Leaflet Map */}
          <div
            className={`md:col-span-6 lg:col-span-7 h-[500px] md:h-[calc(100vh-140px)] sticky top-20 ${
              mobileTab === "map" ? "block" : "hidden md:block"
            }`}
          >
            <TransportMap
              ref={mapRef}
              pickup={pickup}
              dropoff={dropoff}
              vehicles={fleet}
              selectedVehicleId={activeVehicle?.id || null}
              onSelectVehicle={handleSelectVehicle}
              onMapClickCoordinate={handleMapClickCoordinate}
              className="h-full shadow-md"
            />
          </div>
        </div>
      </main>

      {/* Booking Slip Modal */}
      {activeVehicle && (
        <BookingSlip
          vehicle={activeVehicle}
          pickup={pickup}
          dropoff={dropoff}
          fareBreakdown={calculateHireFare(VEHICLE_TIERS[activeVehicle.tierId], distanceKm)}
          durationMinutes={durationMinutes}
          isOpen={isBookingOpen}
          onClose={() => setIsBookingOpen(false)}
          onBookingConfirmed={handleBookingConfirmed}
        />
      )}

      {/* Trip History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in-50">
          <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowHistoryModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 pb-4 border-b border-border">
              <History className="h-5 w-5 text-rose-600" />
              <h2 className="text-lg font-bold text-foreground">Recent Vehicle Hires</h2>
            </div>

            <div className="mt-4 space-y-3">
              {recentBookings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  No vehicle hire trips recorded yet.
                </div>
              ) : (
                recentBookings.map((b) => (
                  <div key={b.bookingRef} className="p-3.5 rounded-xl border border-border bg-muted/20 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-foreground">{b.bookingRef}</span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-mono text-[10px] font-semibold">
                        {b.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="text-muted-foreground">
                      <span className="font-medium text-foreground">{b.vehicle.model}</span> • {b.vehicle.licensePlate} • Driver: {b.vehicle.driverName}
                    </div>

                    <div className="flex items-center justify-between text-muted-foreground font-mono text-[11px] pt-1 border-t border-border/40">
                      <span>{b.pickup.name.split(" ")[0]} → {b.dropoff.name.split(" ")[0]} ({b.fareBreakdown.distanceKm} km)</span>
                      <strong className="text-foreground">${b.fareBreakdown.totalFare.toFixed(2)}</strong>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
