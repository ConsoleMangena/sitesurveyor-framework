import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconAdjustmentsHorizontal,
  IconArrowsExchange,
  IconBuildingStore,
  IconChevronDown,
  IconCrosshair,
  IconCurrentLocation,
  IconHistory,
  IconMapPin,
  IconRoute,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconSteeringWheel,
  IconTruck,
  IconX,
} from "@tabler/icons-react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet.tsx";
import { AccountMenu, AccountMenuAvatar, AccountMenuItem } from "../../components/account-menu.tsx";
import { ThemeToggle } from "../../components/theme/ThemeToggle.tsx";
import { useAuthStore } from "../../lib/auth/auth-store.ts";
import { cn } from "../../lib/utils.ts";
import TransportMap, { type TransportMapHandle } from "../../components/transport/TransportMap.tsx";
import { VehicleHireCard } from "../../components/transport/VehicleHireCard.tsx";
import { BookingSlip } from "../../components/transport/BookingSlip.tsx";
import { VEHICLE_TIER_THEME } from "../../components/transport/vehicleTierTheme.ts";
import {
  calculateHireFare,
  calculateRoadDistanceKm,
  estimateDriveDurationMinutes,
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

type SortKey = "eta" | "price-asc" | "price-desc" | "rating" | "payload";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "eta", label: "Fastest ETA" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "rating", label: "Highest rated driver" },
  { value: "payload", label: "Largest payload" },
];

const SEAT_OPTIONS = [
  { value: 0, label: "Any" },
  { value: 2, label: "2+" },
  { value: 5, label: "5+" },
  { value: 7, label: "7+" },
  { value: 14, label: "14+" },
];

const PAYLOAD_OPTIONS = [
  { value: 0, label: "Any" },
  { value: 500, label: "500 kg+" },
  { value: 1000, label: "1 t+" },
  { value: 5000, label: "5 t+" },
];

const TIER_IDS = Object.keys(VEHICLE_TIERS) as VehicleTierId[];

function payloadLabel(kg: number): string {
  return kg >= 1000 ? `${kg / 1000} t` : `${kg} kg`;
}

export default function PublicTransportPage() {
  const { user } = useAuthStore();
  const mapRef = useRef<TransportMapHandle>(null);
  const fleetRef = useRef<HTMLDivElement>(null);

  const [pickup, setPickup] = useState<LocationCoordinate>({
    id: "hre-core",
    label: "Harare Core Depot",
    lat: -17.8292,
    lng: 31.0522,
  });

  const [dropoff, setDropoff] = useState<LocationCoordinate>({
    id: "byo-base",
    label: "Bulawayo Hub Station",
    lat: -20.15,
    lng: 28.5833,
  });

  const [activePinMode, setActivePinMode] = useState<"pickup" | "dropoff" | null>(null);
  const [search, setSearch] = useState("");
  const [selectedTier, setSelectedTier] = useState<VehicleTierId | "all">("all");
  const [minSeats, setMinSeats] = useState(0);
  const [minPayload, setMinPayload] = useState(0);
  const [sort, setSort] = useState<SortKey>("eta");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [geoNotice, setGeoNotice] = useState<string | null>(null);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [recentBookings, setRecentBookings] = useState<HireBooking[]>(() => loadSavedBookings());
  const [historyOpen, setHistoryOpen] = useState(false);

  const distanceKm = useMemo(
    () => calculateRoadDistanceKm(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng),
    [pickup, dropoff],
  );

  const durationMinutes = useMemo(() => estimateDriveDurationMinutes(distanceKm), [distanceKm]);

  const baseFleet = useMemo(() => generateFleetForCoordinates(pickup, "all"), [pickup]);

  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = { all: baseFleet.length };
    for (const tierId of TIER_IDS) {
      counts[tierId] = baseFleet.filter((vehicle) => vehicle.tierId === tierId).length;
    }
    return counts;
  }, [baseFleet]);

  const filteredFleet = useMemo(() => {
    const query = search.trim().toLowerCase();
    return baseFleet
      .filter((vehicle) => selectedTier === "all" || vehicle.tierId === selectedTier)
      .filter((vehicle) => VEHICLE_TIERS[vehicle.tierId].seats >= minSeats)
      .filter((vehicle) => VEHICLE_TIERS[vehicle.tierId].payloadKg >= minPayload)
      .filter((vehicle) => {
        if (!query) return true;
        return (
          vehicle.model.toLowerCase().includes(query) ||
          vehicle.licensePlate.toLowerCase().includes(query) ||
          vehicle.driverName.toLowerCase().includes(query) ||
          vehicle.color.toLowerCase().includes(query) ||
          VEHICLE_TIERS[vehicle.tierId].name.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        if (sort === "eta") return a.etaMinutes - b.etaMinutes;
        if (sort === "rating") return b.driverRating - a.driverRating;
        if (sort === "payload") {
          return VEHICLE_TIERS[b.tierId].payloadKg - VEHICLE_TIERS[a.tierId].payloadKg;
        }
        const fareA = calculateHireFare(VEHICLE_TIERS[a.tierId], distanceKm).totalFare;
        const fareB = calculateHireFare(VEHICLE_TIERS[b.tierId], distanceKm).totalFare;
        return sort === "price-asc" ? fareA - fareB : fareB - fareA;
      });
  }, [baseFleet, selectedTier, minSeats, minPayload, search, sort, distanceKm]);

  const activeVehicle = useMemo(() => {
    if (selectedVehicleId) {
      const found = filteredFleet.find((vehicle) => vehicle.id === selectedVehicleId);
      if (found) return found;
    }
    return filteredFleet[0] ?? null;
  }, [filteredFleet, selectedVehicleId]);

  const resetFilters = useCallback(() => {
    setSearch("");
    setSelectedTier("all");
    setMinSeats(0);
    setMinPayload(0);
  }, []);

  const activeFilters = useMemo(() => {
    const filters: { key: string; label: string; value: string; clear: () => void }[] = [];
    if (search.trim()) {
      filters.push({ key: "search", label: "Search", value: search.trim(), clear: () => setSearch("") });
    }
    if (selectedTier !== "all") {
      filters.push({
        key: "tier",
        label: "Class",
        value: VEHICLE_TIERS[selectedTier].shortName,
        clear: () => setSelectedTier("all"),
      });
    }
    if (minSeats > 0) {
      filters.push({ key: "seats", label: "Seats", value: `${minSeats}+`, clear: () => setMinSeats(0) });
    }
    if (minPayload > 0) {
      filters.push({
        key: "payload",
        label: "Payload",
        value: `${payloadLabel(minPayload)}+`,
        clear: () => setMinPayload(0),
      });
    }
    return filters;
  }, [search, selectedTier, minSeats, minPayload]);

  const handleSwapCoordinates = useCallback(() => {
    setPickup(dropoff);
    setDropoff(pickup);
  }, [pickup, dropoff]);

  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoNotice("This browser cannot share a GPS fix. Type the coordinates or drop a pin instead.");
      return;
    }

    setIsLocating(true);
    setGeoNotice(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const lat = Math.round(position.coords.latitude * 100000) / 100000;
        const lng = Math.round(position.coords.longitude * 100000) / 100000;
        setPickup({
          lat,
          lng,
          label: `My GPS location (${lat.toFixed(3)}, ${lng.toFixed(3)})`,
          isCustom: true,
        });
        mapRef.current?.centerCoordinate(lat, lng);
      },
      (error) => {
        setIsLocating(false);
        setGeoNotice(`Could not read your GPS: ${error.message}. Drop a pin on the map instead.`);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const handleCoordinatesChange = useCallback(
    (type: "pickup" | "dropoff", coordinates: LocationCoordinate) => {
      if (type === "pickup") {
        setPickup(coordinates);
      } else {
        setDropoff(coordinates);
      }
      setActivePinMode(null);
    },
    [],
  );

  const handleSelectVehicle = useCallback((vehicle: HireVehicle) => {
    setSelectedVehicleId(vehicle.id);
    mapRef.current?.focusVehicle(vehicle);
  }, []);

  const handleBookVehicleNow = useCallback((vehicle: HireVehicle) => {
    setSelectedVehicleId(vehicle.id);
    setIsBookingOpen(true);
  }, []);

  const handleBookingConfirmed = useCallback((booking: HireBooking) => {
    setRecentBookings((previous) => [booking, ...previous.slice(0, 19)]);
  }, []);

  const scrollToFleet = () => {
    fleetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const applyPreset = (preset: LocationCoordinate) => {
    setDropoff(preset);
    mapRef.current?.centerCoordinate(preset.lat, preset.lng);
  };

  return (
    <div className="web3-surface">
      <header className="web3-header">
        <div className="web3-header-inner">
          <span className="flex min-w-0 items-baseline gap-2">
            <Link to="/" aria-label="SiteSurveyor home" className="web3-brand">
              <img src="/logo.svg" alt="" className="web3-brand-logo" aria-hidden="true" />
              <span className="web3-brand-name">SiteSurveyor</span>
            </Link>
            <span className="web3-brand-sub hidden truncate sm:inline">/ Field Vehicle Hire</span>
          </span>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link
              to="/market"
              className="web3-btn shrink-0 gap-1.5 px-2.5 sm:px-4"
              title="Instruments, people, jobs and training from the market"
            >
              <IconBuildingStore className="size-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Marketplace</span>
            </Link>

            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="web3-btn shrink-0 gap-1.5 px-2.5 sm:px-4"
              aria-label={`Open your trips, ${recentBookings.length} recorded`}
            >
              <IconHistory className="size-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Trips</span>
              {recentBookings.length > 0 ? (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary font-mono text-[11px] font-semibold tabular-nums text-primary-foreground">
                  {recentBookings.length}
                </span>
              ) : null}
            </button>

            <ThemeToggle />

            {user ? (
              <AccountMenu
                user={user}
                trigger={
                  <Button
                    variant="outline"
                    className="group h-10 gap-2 rounded-full py-1.5 pl-1.5 pr-3"
                    aria-label={`Open account menu (${user.name})`}
                  >
                    <AccountMenuAvatar user={user} />
                    <span className="max-w-[132px] truncate text-sm font-semibold max-sm:hidden">
                      {user.name}
                    </span>
                    <IconChevronDown
                      className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
                      aria-hidden="true"
                    />
                  </Button>
                }
              >
                <AccountMenuItem icon={IconSettings} label="Settings" to="/settings" />
              </AccountMenu>
            ) : (
              <Link
                to="/login"
                className="web3-btn web3-btn-primary shrink-0 whitespace-nowrap px-3 text-xs sm:px-4 sm:text-sm"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-12 lg:py-16">
          <div className="flex min-w-0 flex-col gap-6 lg:gap-7">
            <div className="max-w-xl">
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button type="button" onClick={scrollToFleet} className="web3-btn gap-1.5">
                  Browse the fleet
                  <IconChevronDown className="size-4" aria-hidden="true" />
                </button>
                <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                  <span className="web3-live-dot" aria-hidden="true" />
                  Live vehicle dispatch
                </span>
              </div>
              <p className="mt-4 text-sm font-medium text-success">
                {baseFleet.length} vehicles staged within 5 km of your pickup
              </p>
            </div>

            <section
              aria-label="Route planner"
              className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-card lg:flex-1"
            >
              <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/80 px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <IconSteeringWheel className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="market-map-title text-foreground">Plan the route</h2>
                    <p className="text-micro text-muted-foreground">
                      Exact GPS coordinates, priced by road distance
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSwapCoordinates}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border/80 bg-background px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  <IconArrowsExchange className="size-3.5" aria-hidden="true" />
                  Swap
                </button>
              </div>

              <div className="flex-1 space-y-4 px-4 py-4 sm:px-5">
                <div className="flex items-start gap-3">
                  <div className="mt-1.5 flex shrink-0 flex-col items-center">
                    <span className="size-2.5 rounded-full bg-success ring-4 ring-success/15" aria-hidden="true" />
                    <span className="my-1 h-16 w-px border-l border-dashed border-border" aria-hidden="true" />
                    <span className="size-2.5 rounded-xs bg-primary ring-4 ring-primary/15" aria-hidden="true" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span className="text-xs font-semibold text-foreground">Pickup</span>
                        <span className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleUseCurrentLocation}
                            disabled={isLocating}
                            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border/80 bg-background px-2.5 text-micro font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
                          >
                            <IconCurrentLocation className="size-3" aria-hidden="true" />
                            {isLocating ? "Locating…" : "My GPS"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setActivePinMode(activePinMode === "pickup" ? null : "pickup")
                            }
                            aria-pressed={activePinMode === "pickup"}
                            className={cn(
                              "inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-micro font-semibold transition-colors",
                              activePinMode === "pickup"
                                ? "border-success bg-success text-success-foreground"
                                : "border-border/80 bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                          >
                            <IconMapPin className="size-3" aria-hidden="true" />
                            {activePinMode === "pickup" ? "Click the map…" : "Drop pin"}
                          </button>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          step="0.0001"
                          aria-label="Pickup latitude"
                          value={pickup.lat}
                          onChange={(event) => {
                            const value = Number.parseFloat(event.target.value);
                            if (!Number.isNaN(value)) setPickup((previous) => ({ ...previous, lat: value }));
                          }}
                          className="h-10 rounded-xl border-border/80 bg-background font-mono text-sm tabular-nums shadow-none"
                        />
                        <Input
                          type="number"
                          step="0.0001"
                          aria-label="Pickup longitude"
                          value={pickup.lng}
                          onChange={(event) => {
                            const value = Number.parseFloat(event.target.value);
                            if (!Number.isNaN(value)) setPickup((previous) => ({ ...previous, lng: value }));
                          }}
                          className="h-10 rounded-xl border-border/80 bg-background font-mono text-sm tabular-nums shadow-none"
                        />
                      </div>
                      <p className="truncate text-micro text-muted-foreground">{pickup.label}</p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span className="text-xs font-semibold text-foreground">Destination</span>
                        <button
                          type="button"
                          onClick={() =>
                            setActivePinMode(activePinMode === "dropoff" ? null : "dropoff")
                          }
                          aria-pressed={activePinMode === "dropoff"}
                          className={cn(
                            "inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-micro font-semibold transition-colors",
                            activePinMode === "dropoff"
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border/80 bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <IconCrosshair className="size-3" aria-hidden="true" />
                          {activePinMode === "dropoff" ? "Click the map…" : "Drop pin"}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          step="0.0001"
                          aria-label="Destination latitude"
                          value={dropoff.lat}
                          onChange={(event) => {
                            const value = Number.parseFloat(event.target.value);
                            if (!Number.isNaN(value)) setDropoff((previous) => ({ ...previous, lat: value }));
                          }}
                          className="h-10 rounded-xl border-border/80 bg-background font-mono text-sm tabular-nums shadow-none"
                        />
                        <Input
                          type="number"
                          step="0.0001"
                          aria-label="Destination longitude"
                          value={dropoff.lng}
                          onChange={(event) => {
                            const value = Number.parseFloat(event.target.value);
                            if (!Number.isNaN(value)) setDropoff((previous) => ({ ...previous, lng: value }));
                          }}
                          className="h-10 rounded-xl border-border/80 bg-background font-mono text-sm tabular-nums shadow-none"
                        />
                      </div>
                      <p className="truncate text-micro text-muted-foreground">{dropoff.label}</p>
                    </div>
                  </div>
                </div>

                {geoNotice ? (
                  <p
                    role="status"
                    className="rounded-xl border border-warning/25 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning"
                  >
                    {geoNotice}
                  </p>
                ) : null}

                <div className="space-y-2 border-t border-border/70 pt-3">
                  <p className="text-xs font-semibold text-foreground">Survey baselines</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SURVEY_GPS_PRESETS.slice(0, 6).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        aria-pressed={dropoff.id === preset.id}
                        className={cn(
                          "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          dropoff.id === preset.id
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border/80 bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {preset.label.replace(/ (Depot|Station|Yard|Hub|Base|Post|Terminal|Outpost|Belt)$/, "")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="web3-ticker shrink-0 border-t border-border/80">
                <div className="web3-ticker-cell">
                  <span className="web3-ticker-label">Road distance</span>
                  <span className="web3-ticker-value">{distanceKm.toLocaleString()} km</span>
                </div>
                <div className="web3-ticker-cell">
                  <span className="web3-ticker-label">Drive time</span>
                  <span className="web3-ticker-value">{formatDriveDuration(durationMinutes)}</span>
                </div>
                <div className="web3-ticker-cell">
                  <span className="web3-ticker-label">Dispatch</span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
                    <IconSparkles className="size-3.5" aria-hidden="true" />
                    Fleet ready
                  </span>
                </div>
              </div>
            </section>
          </div>

          <div
            aria-label="Interactive dispatch map"
            className="market-map-frame flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-card"
          >
            <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/80 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <IconRoute className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="market-map-title text-foreground">Live route and nearby fleet</h2>
                  <p className="text-micro text-muted-foreground">
                    Drag a marker or click the map to move the route
                  </p>
                </div>
              </div>
              <span className="font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                {filteredFleet.length} vehicles mapped
              </span>
            </div>

            <div className="flex min-h-0 flex-1">
              <TransportMap
                ref={mapRef}
                pickup={pickup}
                dropoff={dropoff}
                vehicles={filteredFleet}
                selectedVehicleId={activeVehicle?.id ?? null}
                activePinMode={activePinMode}
                onSelectVehicle={handleSelectVehicle}
                onCoordinatesChange={handleCoordinatesChange}
                className="h-[360px] sm:h-[440px] lg:h-full lg:min-h-[500px]"
              />
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/80 px-4 py-2.5 text-micro text-muted-foreground sm:px-5">
              <span>Two-way map and fleet discovery</span>
              <span className="shrink-0 font-mono tabular-nums">
                {distanceKm.toLocaleString()} km · {formatDriveDuration(durationMinutes)}
              </span>
            </div>
          </div>
        </section>

        <section ref={fleetRef} className="market-registry mt-10 scroll-mt-16 sm:mt-12">
          <div className="mx-auto w-full max-w-7xl space-y-7 px-4 py-11 sm:px-6 sm:py-14">
            <div className="max-w-2xl">
              <h2 className="market-section-title text-balance text-foreground">Browse the fleet</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
                Every fare is recalculated for your route. Pick a class, or search to see every match in one list.
              </p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/80 bg-background shadow-[0_1px_2px_rgba(15,23,20,0.05)]">
              <div className="space-y-2.5 p-2.5 sm:p-3">
                <div className="flex gap-2.5">
                  <div className="relative min-w-0 flex-1">
                    <label htmlFor="fleet-search" className="sr-only">
                      Search the fleet
                    </label>
                    <IconSearch
                      className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="fleet-search"
                      placeholder="Search models, drivers, plates…"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      className="h-11 rounded-xl border-border/80 bg-background pl-11 pr-11 text-sm shadow-none"
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        aria-label="Clear search"
                        className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <IconX className="size-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>

                  <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
                    <SelectTrigger
                      aria-label="Sort vehicles"
                      className="hidden h-11 w-[190px] shrink-0 rounded-xl bg-background text-sm sm:flex"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {SORT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    variant={activeFilters.length > 0 ? "default" : "outline"}
                    size="icon"
                    className="size-11 shrink-0 rounded-xl sm:hidden"
                    onClick={() => setMobileFiltersOpen(true)}
                    aria-expanded={mobileFiltersOpen}
                    aria-label={
                      activeFilters.length > 0 ? `Filters, ${activeFilters.length} applied` : "Filters"
                    }
                  >
                    <IconAdjustmentsHorizontal className="size-4" aria-hidden="true" />
                  </Button>
                </div>

                <div className="hidden flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/70 pt-2.5 sm:flex">
                  <div role="group" aria-label="Filter by seats" className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Seats</span>
                    <span className="inline-flex items-center gap-1 rounded-xl bg-muted/70 p-1">
                      {SEAT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={minSeats === option.value}
                          onClick={() => setMinSeats(option.value)}
                          className={cn(
                            "min-h-9 rounded-lg px-3 text-xs font-medium transition-colors",
                            minSeats === option.value
                              ? "bg-background text-foreground shadow-[0_1px_2px_rgba(15,23,20,0.10)]"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </span>
                  </div>

                  <span className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />

                  <div role="group" aria-label="Filter by payload" className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Payload</span>
                    <span className="inline-flex items-center gap-1 rounded-xl bg-muted/70 p-1">
                      {PAYLOAD_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={minPayload === option.value}
                          onClick={() => setMinPayload(option.value)}
                          className={cn(
                            "min-h-9 rounded-lg px-3 text-xs font-medium transition-colors",
                            minPayload === option.value
                              ? "bg-background text-foreground shadow-[0_1px_2px_rgba(15,23,20,0.10)]"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </span>
                  </div>
                </div>

                {activeFilters.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 pt-2.5">
                    <span className="text-xs font-medium text-muted-foreground">Filtered by</span>
                    {activeFilters.map((filter) => (
                      <button
                        key={filter.key}
                        type="button"
                        onClick={filter.clear}
                        aria-label={`Clear ${filter.label.toLowerCase()} filter: ${filter.value}`}
                        className="inline-flex min-h-9 max-w-[16rem] items-center gap-1.5 rounded-lg bg-muted px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/70"
                      >
                        <span className="shrink-0 text-muted-foreground">{filter.label}:</span>
                        <span className="truncate">{filter.value}</span>
                        <IconX className="size-3.5 shrink-0" aria-hidden="true" />
                      </button>
                    ))}
                    {activeFilters.length > 1 ? (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="ml-auto min-h-9 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                      >
                        Clear all
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div
                role="group"
                aria-label="Filter by vehicle class"
                className="scrollbar-none flex items-center gap-0.5 overflow-x-auto border-t border-border/80 px-1.5 sm:px-2.5"
              >
                <button
                  type="button"
                  aria-pressed={selectedTier === "all"}
                  onClick={() => setSelectedTier("all")}
                  className={cn(
                    "shrink-0 whitespace-nowrap border-b-2 px-3.5 py-3 text-sm font-medium transition-colors sm:px-4",
                    selectedTier === "all"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  Everything
                  <span className="ml-1.5 font-mono text-micro tabular-nums text-muted-foreground">
                    {tierCounts.all}
                  </span>
                </button>
                {TIER_IDS.map((tierId) => (
                  <button
                    key={tierId}
                    type="button"
                    aria-pressed={selectedTier === tierId}
                    onClick={() => setSelectedTier(tierId)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-3 text-sm font-medium transition-colors sm:px-4",
                      selectedTier === tierId
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: VEHICLE_TIER_THEME[tierId].dot }}
                      aria-hidden="true"
                    />
                    {VEHICLE_TIERS[tierId].shortName}
                    <span className="font-mono text-micro tabular-nums text-muted-foreground">
                      {tierCounts[tierId]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {filteredFleet.length === 0
                  ? "No vehicles match your filters."
                  : `Showing ${filteredFleet.length} of ${baseFleet.length} vehicles for ${distanceKm.toLocaleString()} km`}
              </p>
              {activeFilters.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={resetFilters}
                  className="min-h-11 px-4 text-sm"
                >
                  Reset filters
                </Button>
              ) : null}
            </div>

            {filteredFleet.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-14 text-center">
                <IconTruck className="size-8 text-muted-foreground/60" aria-hidden="true" />
                <h3 className="mt-4 text-base font-semibold text-foreground">No vehicles in this section</h3>
                <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                  Try another class, widen the capacity filters, or reset to see the whole fleet.
                </p>
                <Button type="button" variant="outline" className="mt-5 min-h-11" onClick={resetFilters}>
                  Reset filters
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {filteredFleet.map((vehicle) => (
                  <VehicleHireCard
                    key={vehicle.id}
                    vehicle={vehicle}
                    fareBreakdown={calculateHireFare(VEHICLE_TIERS[vehicle.tierId], distanceKm)}
                    isSelected={activeVehicle?.id === vehicle.id}
                    onSelect={handleSelectVehicle}
                    onBookNow={handleBookVehicleNow}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Fares follow the route · base fee + road distance + tolls</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {TIER_IDS.map((tierId) => (
              <span key={tierId} className="inline-flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: VEHICLE_TIER_THEME[tierId].dot }}
                  aria-hidden="true"
                />
                {VEHICLE_TIERS[tierId].shortName}
              </span>
            ))}
          </div>
        </div>
      </footer>

      {activeVehicle ? (
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
      ) : null}

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent
          side="right"
          className="web3-theme flex w-[min(92vw,30rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <SheetHeader className="shrink-0 border-b border-border/80 px-5 py-5 text-left">
            <SheetTitle className="market-sheet-title text-foreground">Your trips</SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              Dispatched hires keep their reference and fare on this device.
            </SheetDescription>
          </SheetHeader>

          <div className="market-detail-scroll flex-1 space-y-3 overflow-y-auto px-5 py-5">
            {recentBookings.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
                <IconHistory className="size-7 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-semibold text-foreground">No trips yet</p>
                <p className="max-w-xs text-xs leading-5 text-muted-foreground">
                  Hire a vehicle and its dispatch reference, route and fare will be listed here.
                </p>
              </div>
            ) : (
              recentBookings.map((booking) => (
                <article
                  key={booking.bookingRef}
                  className="space-y-2 rounded-2xl border border-border/80 bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                      {booking.bookingRef}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-success/10 px-2.5 py-1 text-micro font-semibold capitalize text-success">
                      {booking.status.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{booking.vehicle.model}</p>
                  <p className="text-xs text-muted-foreground">
                    {booking.vehicle.licensePlate} · Driver {booking.vehicle.driverName}
                  </p>
                  <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-2 font-mono text-micro tabular-nums text-muted-foreground">
                    <span className="truncate">
                      {booking.pickup.lat.toFixed(2)}, {booking.pickup.lng.toFixed(2)} →{" "}
                      {booking.dropoff.lat.toFixed(2)}, {booking.dropoff.lng.toFixed(2)} ·{" "}
                      {booking.fareBreakdown.distanceKm} km
                    </span>
                    <span className="shrink-0 font-semibold text-foreground">
                      ${booking.fareBreakdown.totalFare.toFixed(2)}
                    </span>
                  </div>
                </article>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SheetContent
          side="bottom"
          className="web3-theme flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-3xl p-0"
        >
          <SheetHeader className="shrink-0 border-b border-border/80 px-5 py-4 text-left">
            <SheetTitle className="market-sheet-title text-foreground">Filter the fleet</SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              Narrow the vehicles staged near your pickup.
            </SheetDescription>
          </SheetHeader>

          <div className="market-detail-scroll flex-1 space-y-6 overflow-y-auto px-5 py-5">
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-foreground">Vehicle class</legend>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={selectedTier === "all" ? "default" : "outline"}
                  className="h-10 justify-start gap-2 rounded-xl px-3 text-xs"
                  onClick={() => setSelectedTier("all")}
                >
                  Everything
                  <span className="ml-auto font-mono text-micro tabular-nums opacity-70">
                    {tierCounts.all}
                  </span>
                </Button>
                {TIER_IDS.map((tierId) => (
                  <Button
                    key={tierId}
                    type="button"
                    variant={selectedTier === tierId ? "default" : "outline"}
                    className="h-10 justify-start gap-2 rounded-xl px-3 text-xs"
                    onClick={() => setSelectedTier(tierId)}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: VEHICLE_TIER_THEME[tierId].dot }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{VEHICLE_TIERS[tierId].shortName}</span>
                    <span className="ml-auto font-mono text-micro tabular-nums opacity-70">
                      {tierCounts[tierId]}
                    </span>
                  </Button>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-foreground">Minimum seats</legend>
              <div className="grid grid-cols-5 gap-1.5">
                {SEAT_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={minSeats === option.value ? "default" : "outline"}
                    className="h-10 rounded-xl px-1 text-xs"
                    onClick={() => setMinSeats(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold text-foreground">Minimum payload</legend>
              <div className="grid grid-cols-4 gap-1.5">
                {PAYLOAD_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={minPayload === option.value ? "default" : "outline"}
                    className="h-10 rounded-xl px-1 text-xs"
                    onClick={() => setMinPayload(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground" htmlFor="mobile-sort">
                Order
              </label>
              <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
                <SelectTrigger id="mobile-sort" className="h-11 w-full rounded-xl bg-background text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-border/80 px-5 py-4">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-xl text-sm"
              onClick={resetFilters}
            >
              Reset
            </Button>
            <Button
              type="button"
              className="h-11 flex-[2] rounded-xl text-sm font-semibold"
              onClick={() => setMobileFiltersOpen(false)}
            >
              Show {filteredFleet.length} vehicles
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
