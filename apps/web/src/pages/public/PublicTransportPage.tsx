import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconAdjustmentsHorizontal,
  IconArrowsExchange,
  IconBolt,
  IconBus,
  IconCar,
  IconCarSuv,
  IconClock,
  IconCompass,
  IconCrosshair,
  IconCurrentLocation,
  IconHistory,
  IconMapPin,
  IconMapPinFilled,
  IconRoute,
  IconSettings,
  IconSparkles,
  IconSteeringWheel,
  IconBuildingStore,
  IconTruck,
  IconTruckDelivery,
  IconX,
} from "@tabler/icons-react";
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
  formatCoordinates,
  formatDriveDuration,
  generateFleetForCoordinates,
  loadSavedBookings,
  SURVEY_GPS_PRESETS,
  VEHICLE_TIERS,
  type HireBooking,
  type HireVehicle,
  type LocationCoordinate,
  type VehicleTierId,
} from "../../lib/transportHire.ts";

export default function PublicTransportPage() {
  const { user } = useAuthStore();
  const mapRef = useRef<TransportMapHandle>(null);

  // Exact Coordinates State (Default: Harare Core -> Bulawayo Base)
  const [pickup, setPickup] = useState<LocationCoordinate>({
    id: "hre-core",
    label: "Harare Core Depot",
    lat: -17.8292,
    lng: 31.0522,
  });

  const [dropoff, setDropoff] = useState<LocationCoordinate>({
    id: "byo-base",
    label: "Bulawayo Hub Station",
    lat: -20.1500,
    lng: 28.5833,
  });

  // Pin placement mode: null | "pickup" | "dropoff"
  const [activePinMode, setActivePinMode] = useState<"pickup" | "dropoff" | null>(null);

  // Vehicle Category Filter
  const [selectedTier, setSelectedTier] = useState<VehicleTierId | "all">("all");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  // Mobile View Mode
  const [mobileView, setMobileView] = useState<"fleet" | "map">("fleet");

  // Geolocation Loading
  const [isLocating, setIsLocating] = useState(false);

  // Booking Modal & History
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [recentBookings, setRecentBookings] = useState<HireBooking[]>(() => loadSavedBookings());
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Dynamic Distance & Duration
  const distanceKm = useMemo(() => {
    return calculateRoadDistanceKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
  }, [pickup, dropoff]);

  const durationMinutes = useMemo(() => {
    return estimateDriveDurationMinutes(distanceKm);
  }, [distanceKm]);

  // Generate Fleet stationed around current pickup coordinate
  const fleet = useMemo(() => {
    return generateFleetForCoordinates(pickup, selectedTier);
  }, [pickup, selectedTier]);

  const activeVehicle = useMemo(() => {
    if (selectedVehicleId) {
      const found = fleet.find((v) => v.id === selectedVehicleId);
      if (found) return found;
    }
    return fleet[0] || null;
  }, [fleet, selectedVehicleId]);

  // Swap pickup & dropoff coordinates
  const handleSwapCoordinates = useCallback(() => {
    setPickup(dropoff);
    setDropoff(pickup);
  }, [pickup, dropoff]);

  // Request browser geolocation for current device GPS
  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const userLat = Math.round(pos.coords.latitude * 100000) / 100000;
        const userLng = Math.round(pos.coords.longitude * 100000) / 100000;
        const newPickup: LocationCoordinate = {
          lat: userLat,
          lng: userLng,
          label: `My GPS Location (${userLat.toFixed(3)}, ${userLng.toFixed(3)})`,
          isCustom: true,
        };
        setPickup(newPickup);
        if (mapRef.current) {
          mapRef.current.centerCoordinate(userLat, userLng);
        }
      },
      (err) => {
        setIsLocating(false);
        alert(`Could not fetch GPS location: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  // Update coordinates from map drag or click
  const handleCoordinatesChange = useCallback(
    (type: "pickup" | "dropoff", newCoords: LocationCoordinate) => {
      if (type === "pickup") {
        setPickup(newCoords);
      } else {
        setDropoff(newCoords);
      }
      setActivePinMode(null);
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
    <div className="relative h-screen w-screen flex flex-col bg-background text-foreground antialiased overflow-hidden selection:bg-rose-500/20 selection:text-rose-600">
      {/* Top Header */}
      <header className="relative z-30 w-full h-14 border-b border-border/80 bg-background/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 font-bold text-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-600 text-white font-mono text-sm font-extrabold shadow-sm">
              S
            </span>
            <span className="tracking-tight text-base font-bold hidden sm:inline">
              SiteSurveyor
            </span>
          </Link>

          <span className="hidden sm:inline-block h-4 w-px bg-border" />

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-mono text-xs font-semibold">
            <IconSteeringWheel className="h-4 w-4" />
            <span>Vehicle Hire</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Mobile View Toggle */}
          <div className="md:hidden flex items-center p-0.5 bg-muted rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setMobileView("fleet")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                mobileView === "fleet" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Fleet ({fleet.length})
            </button>
            <button
              type="button"
              onClick={() => setMobileView("map")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                mobileView === "map" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              Map
            </button>
          </div>

          <Link
            to="/market"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium px-2.5 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <IconBuildingStore className="h-4 w-4" />
            <span>Market</span>
          </Link>

          {recentBookings.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistoryModal(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-muted/70 hover:bg-muted text-foreground transition-colors"
            >
              <IconHistory className="h-4 w-4 text-muted-foreground" />
              <span className="hidden sm:inline">Trips</span>
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] h-4 font-mono">
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
              <AccountMenuItem icon={IconSettings} label="Settings" to="/settings" />
            </AccountMenu>
          ) : (
            <Button asChild size="sm" variant="default" className="text-xs bg-rose-600 hover:bg-rose-700 text-white h-8 rounded-lg">
              <Link to="/auth/sign-in">Sign In</Link>
            </Button>
          )}
        </div>
      </header>

      {/* Main Interactive Work Area */}
      <div className="relative flex-1 w-full h-[calc(100vh-3.5rem)] overflow-hidden">
        {/* Edge-to-Edge Background Leaflet Map */}
        <div className="absolute inset-0 z-0">
          <TransportMap
            ref={mapRef}
            pickup={pickup}
            dropoff={dropoff}
            vehicles={fleet}
            selectedVehicleId={activeVehicle?.id || null}
            activePinMode={activePinMode}
            onSelectVehicle={handleSelectVehicle}
            onCoordinatesChange={handleCoordinatesChange}
            className="w-full h-full rounded-none border-0"
          />
        </div>

        {/* Floating Uber-Style Ride Panel (Left Column / Bottom Drawer) */}
        <div
          className={`absolute top-4 left-4 bottom-4 w-full max-w-[440px] z-20 flex flex-col rounded-3xl bg-background/95 backdrop-blur-xl border border-border/80 shadow-2xl overflow-hidden transition-all duration-300 ${
            mobileView === "fleet" ? "translate-y-0" : "translate-y-full md:translate-y-0 pointer-events-none md:pointer-events-auto opacity-0 md:opacity-100"
          }`}
        >
          {/* Panel Header */}
          <div className="p-4 pb-3 border-b border-border/70 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-extrabold text-foreground tracking-tight flex items-center gap-2">
                  <span>Site Vehicle Dispatch</span>
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                </h1>
                <p className="text-[11px] text-muted-foreground">
                  Coordinate GPS routing • Dynamic distance pricing
                </p>
              </div>

              <div className="text-right">
                <span className="font-mono text-xs font-bold text-foreground">
                  {fleet.length} Available
                </span>
                <span className="block text-[10px] text-muted-foreground font-mono">
                  near pickup
                </span>
              </div>
            </div>
          </div>

          {/* Scrollable Content Deck */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Coordinate Planning Box (Uber-style connected stops) */}
            <div className="p-3.5 rounded-2xl border border-border bg-card/90 shadow-sm space-y-3">
              {/* Pickup Coordinate Row */}
              <div className="flex items-start gap-2.5">
                <div className="flex flex-col items-center mt-1">
                  <span className="h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                  <span className="w-0.5 h-10 bg-border/80 my-1 border-dashed" />
                  <span className="h-3 w-3 rounded-sm bg-rose-500 ring-4 ring-rose-500/20" />
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  {/* Pickup Input Block */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono uppercase font-bold text-emerald-600 dark:text-emerald-400">
                        Pickup Location (GPS)
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleUseCurrentLocation}
                          disabled={isLocating}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-semibold transition-colors"
                        >
                          <IconCurrentLocation className="h-3 w-3" />
                          <span>{isLocating ? "Locating..." : "My GPS"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActivePinMode(activePinMode === "pickup" ? null : "pickup")}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold transition-colors ${
                            activePinMode === "pickup"
                              ? "bg-emerald-600 text-white"
                              : "bg-muted hover:bg-muted/80 text-muted-foreground"
                          }`}
                        >
                          <IconMapPin className="h-3 w-3" />
                          <span>{activePinMode === "pickup" ? "Click Map..." : "Pin"}</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <span className="text-[9px] uppercase font-mono text-muted-foreground">Latitude</span>
                        <input
                          type="number"
                          step="0.0001"
                          value={pickup.lat}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) setPickup((prev) => ({ ...prev, lat: val }));
                          }}
                          className="w-full px-2.5 py-1.5 text-xs font-mono font-semibold rounded-lg border border-border bg-background focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-mono text-muted-foreground">Longitude</span>
                        <input
                          type="number"
                          step="0.0001"
                          value={pickup.lng}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) setPickup((prev) => ({ ...prev, lng: val }));
                          }}
                          className="w-full px-2.5 py-1.5 text-xs font-mono font-semibold rounded-lg border border-border bg-background focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {pickup.label}
                    </div>
                  </div>

                  {/* Dropoff Input Block */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono uppercase font-bold text-rose-600 dark:text-rose-400">
                        Dropoff / Field Destination (GPS)
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleSwapCoordinates}
                          title="Swap pickup and dropoff coordinates"
                          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <IconArrowsExchange className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setActivePinMode(activePinMode === "dropoff" ? null : "dropoff")}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold transition-colors ${
                            activePinMode === "dropoff"
                              ? "bg-rose-600 text-white"
                              : "bg-muted hover:bg-muted/80 text-muted-foreground"
                          }`}
                        >
                          <IconCrosshair className="h-3 w-3" />
                          <span>{activePinMode === "dropoff" ? "Click Map..." : "Pin"}</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <span className="text-[9px] uppercase font-mono text-muted-foreground">Latitude</span>
                        <input
                          type="number"
                          step="0.0001"
                          value={dropoff.lat}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) setDropoff((prev) => ({ ...prev, lat: val }));
                          }}
                          className="w-full px-2.5 py-1.5 text-xs font-mono font-semibold rounded-lg border border-border bg-background focus:ring-1 focus:ring-rose-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-mono text-muted-foreground">Longitude</span>
                        <input
                          type="number"
                          step="0.0001"
                          value={dropoff.lng}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) setDropoff((prev) => ({ ...prev, lng: val }));
                          }}
                          className="w-full px-2.5 py-1.5 text-xs font-mono font-semibold rounded-lg border border-border bg-background focus:ring-1 focus:ring-rose-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {dropoff.label}
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick GPS Presets */}
              <div className="pt-2 border-t border-border/60">
                <div className="text-[9.5px] uppercase font-mono text-muted-foreground tracking-wider mb-1.5">
                  Survey Station Coordinates:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SURVEY_GPS_PRESETS.slice(0, 5).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setDropoff(preset);
                        if (mapRef.current) {
                          mapRef.current.centerCoordinate(preset.lat, preset.lng);
                        }
                      }}
                      className="px-2 py-0.5 rounded-md bg-muted/60 hover:bg-muted text-[10.5px] font-mono text-muted-foreground hover:text-foreground border border-border/40 transition-colors"
                    >
                      {preset.label.split(" ")[0]} ({preset.lat.toFixed(1)}, {preset.lng.toFixed(1)})
                    </button>
                  ))}
                </div>
              </div>

              {/* Calculated Distance Strip */}
              {distanceKm > 0 && (
                <div className="pt-2 border-t border-border flex items-center justify-between text-xs font-mono bg-muted/30 -mx-3.5 -mb-3.5 px-3.5 py-2.5 rounded-b-2xl">
                  <div>
                    <span className="text-[9.5px] text-muted-foreground block">ROAD DISTANCE</span>
                    <strong className="text-sm font-bold text-foreground">{distanceKm} km</strong>
                  </div>
                  <div className="h-5 w-px bg-border" />
                  <div>
                    <span className="text-[9.5px] text-muted-foreground block">EST. DRIVE TIME</span>
                    <strong className="text-sm font-bold text-foreground">{formatDriveDuration(durationMinutes)}</strong>
                  </div>
                  <div className="h-5 w-px bg-border" />
                  <div className="text-right">
                    <span className="text-[9.5px] text-muted-foreground block">SPEED PROFILE</span>
                    <strong className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs">75 km/h avg</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Vehicle Tier Category Filter Tabs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase font-mono tracking-wider text-muted-foreground">
                  Select Vehicle Category
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  Base + Per-Km
                </span>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedTier("all")}
                  className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all ${
                    selectedTier === "all"
                      ? "bg-foreground text-background font-bold shadow-sm"
                      : "bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  All ({fleet.length})
                </button>
                {(Object.keys(VEHICLE_TIERS) as VehicleTierId[]).map((tierId) => {
                  const t = VEHICLE_TIERS[tierId];
                  const isCurSelected = selectedTier === tierId;
                  return (
                    <button
                      key={tierId}
                      type="button"
                      onClick={() => setSelectedTier(tierId)}
                      className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all ${
                        isCurSelected
                          ? "bg-foreground text-background font-bold shadow-sm"
                          : "bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {t.shortName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Available Vehicles List */}
            <div className="space-y-2.5 pb-20">
              {fleet.length === 0 ? (
                <div className="p-8 text-center rounded-2xl border border-dashed border-border text-muted-foreground">
                  <IconTruck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <div className="text-xs font-semibold">No vehicles found in this category</div>
                  <div className="text-[11px] mt-1">Select "All" to browse the full available fleet</div>
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
          </div>

          {/* Sticky Book Vehicle Action Bar */}
          {activeVehicle && (
            <div className="p-4 border-t border-border/80 bg-background/95 backdrop-blur-md shrink-0 flex items-center justify-between gap-3 shadow-lg">
              <div className="min-w-0">
                <div className="text-[11px] text-muted-foreground font-mono truncate">
                  {activeVehicle.model.split(" ")[0]} {activeVehicle.model.split(" ")[1]} ({activeVehicle.etaMinutes}m away)
                </div>
                <div className="text-xl font-extrabold font-mono text-foreground tracking-tight">
                  ${calculateHireFare(VEHICLE_TIERS[activeVehicle.tierId], distanceKm).totalFare.toFixed(2)}
                  <span className="text-[10px] font-normal text-muted-foreground ml-1.5 font-mono">
                    ({distanceKm} km total)
                  </span>
                </div>
              </div>

              <Button
                type="button"
                onClick={() => setIsBookingOpen(true)}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-6 py-2.5 h-11 rounded-2xl shadow-md shrink-0"
              >
                <span>Book Vehicle</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Booking Confirmation Sheet Modal */}
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

      {/* Trip History Sheet Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in-50">
          <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShowHistoryModal(false)}
              className="absolute top-5 right-5 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <IconX className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 pb-4 border-b border-border">
              <IconHistory className="h-5 w-5 text-rose-600" />
              <h2 className="text-lg font-bold text-foreground">Recent Vehicle Hires</h2>
            </div>

            <div className="mt-4 space-y-3">
              {recentBookings.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  No vehicle hire trips recorded yet.
                </div>
              ) : (
                recentBookings.map((b) => (
                  <div key={b.bookingRef} className="p-3.5 rounded-2xl border border-border bg-muted/20 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-foreground">{b.bookingRef}</span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-mono text-[10px] font-semibold">
                        {b.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="text-muted-foreground">
                      <strong className="text-foreground">{b.vehicle.model}</strong> • {b.vehicle.licensePlate} • Driver: {b.vehicle.driverName}
                    </div>

                    <div className="flex items-center justify-between text-muted-foreground font-mono text-[11px] pt-1.5 border-t border-border/40">
                      <span>
                        [{b.pickup.lat.toFixed(2)}, {b.pickup.lng.toFixed(2)}] → [{b.dropoff.lat.toFixed(2)}, {b.dropoff.lng.toFixed(2)}] ({b.fareBreakdown.distanceKm} km)
                      </span>
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
