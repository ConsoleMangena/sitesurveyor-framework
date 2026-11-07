import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
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
  IconSliders,
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
        {/* Hero Section: Route Planner Deck & Live Map Frame */}
        <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-12 lg:py-16">
          {/* Left Column: Headline & Coordinate Dispatch Deck */}
          <div className="flex min-w-0 flex-col gap-6 lg:gap-7">
            <div className="max-w-xl space-y-5">
              <div>
                <p className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-rose-600 dark:text-rose-400">
                  <IconSteeringWheel className="size-4" aria-hidden="true" />
                  Field transport network
                </p>
                <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-[3.35rem] lg:leading-[1.08]">
                  Move your fieldwork forward.
                </h1>
                <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
                  Find the right vehicle for your route, compare live fleet availability, and book field transport with clear distance-based fares.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={scrollToFleet}
                  className="web3-btn gap-1.5"
                >
                  Browse available fleet
                  <IconChevronDown className="size-4" aria-hidden="true" />
                </button>
                <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                  <span className="web3-live-dot" aria-hidden="true" />
                  Live vehicle dispatch
                </span>
              </div>
            </div>

            {/* Coordinate Dispatch Deck */}
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
              <div className="space-y-4 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                      <IconRoute className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-foreground">Plan your route</h2>
                      <p className="text-xs text-muted-foreground">Set pickup and destination coordinates</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSwapCoordinates}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400"
                  >
                    <IconArrowsExchange className="h-3.5 w-3.5" />
                    <span>Swap</span>
                  </button>
                </div>
              </div>

              {/* Connected Track: Pickup -> Destination */}
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center mt-1.5">
                  <span className="h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                  <span className="w-0.5 h-12 bg-border/80 my-1 border-dashed" />
                  <span className="h-3 w-3 rounded-sm bg-rose-500 ring-4 ring-rose-500/20" />
                </div>

                <div className="min-w-0 flex-1 space-y-3.5">
                  {/* Pickup Coordinate Row */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10.5px] font-mono uppercase font-bold text-emerald-600 dark:text-emerald-400">
                        Pickup GPS
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

                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        step="0.0001"
                        value={pickup.lat}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) setPickup((p) => ({ ...p, lat: val }));
                        }}
                        className="h-9 font-mono text-xs font-semibold rounded-xl bg-background"
                        placeholder="Latitude"
                      />
                      <Input
                        type="number"
                        step="0.0001"
                        value={pickup.lng}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) setPickup((p) => ({ ...p, lng: val }));
                        }}
                        className="h-9 font-mono text-xs font-semibold rounded-xl bg-background"
                        placeholder="Longitude"
                      />
                    </div>
                    <div className="text-[10.5px] text-muted-foreground truncate mt-0.5">
                      {pickup.label}
                    </div>
                  </div>

                  {/* Dropoff Coordinate Row */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10.5px] font-mono uppercase font-bold text-rose-600 dark:text-rose-400">
                        Destination GPS
                      </span>
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

                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        step="0.0001"
                        value={dropoff.lat}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) setDropoff((p) => ({ ...p, lat: val }));
                        }}
                        className="h-9 font-mono text-xs font-semibold rounded-xl bg-background"
                        placeholder="Latitude"
                      />
                      <Input
                        type="number"
                        step="0.0001"
                        value={dropoff.lng}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) setDropoff((p) => ({ ...p, lng: val }));
                        }}
                        className="h-9 font-mono text-xs font-semibold rounded-xl bg-background"
                        placeholder="Longitude"
                      />
                    </div>
                    <div className="text-[10.5px] text-muted-foreground truncate mt-0.5">
                      {dropoff.label}
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Survey Station Presets */}
              <div className="pt-2 border-t border-border/60">
                <div className="text-[10px] uppercase font-mono text-muted-foreground tracking-wider mb-1.5">
                  Preset Baseline Coordinates:
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
                      className="px-2.5 py-1 rounded-lg bg-muted/60 hover:bg-muted text-[11px] font-mono text-muted-foreground hover:text-foreground border border-border/50 transition-colors"
                    >
                      {preset.label.split(" ")[0]} ({preset.lat.toFixed(1)}, {preset.lng.toFixed(1)})
                    </button>
                  ))}
                </div>
              </div>

              {/* Highway Distance & Duration Readout */}
              <div className="pt-3 border-t border-border flex items-center justify-between text-xs font-mono bg-muted/20 -mx-5 -mb-5 px-5 py-3 rounded-b-2xl">
                <div>
                  <span className="text-[10px] text-muted-foreground block">ROAD DISTANCE</span>
                  <strong className="text-sm font-bold text-foreground">{distanceKm} km</strong>
                </div>
                <div className="h-6 w-px bg-border" />
                <div>
                  <span className="text-[10px] text-muted-foreground block">EST. DRIVE TIME</span>
                  <strong className="text-sm font-bold text-foreground">{formatDriveDuration(durationMinutes)}</strong>
                </div>
                <div className="h-6 w-px bg-border" />
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground block">DISPATCH STATUS</span>
                  <strong className="text-emerald-600 dark:text-emerald-400 font-semibold text-xs inline-flex items-center gap-1">
                    <IconSparkles className="h-3 w-3" />
                    Fleet Ready
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Map Frame (Matching PublicMarketPage market-map-frame) */}
          <div
            aria-label="Interactive dispatch map"
            className="market-map-frame flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm"
          >
            <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/80 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600">
                  <IconRoute className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="market-map-title text-foreground font-bold text-sm">
                    Live Route & Nearby Fleet
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Drag markers or click map to update GPS coordinates
                  </p>
                </div>
              </div>
              <span className="font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                {filteredFleet.length} vehicles available
              </span>
            </div>

            <div className="flex min-h-0 flex-1">
              <TransportMap
                ref={mapRef}
                pickup={pickup}
                dropoff={dropoff}
                vehicles={filteredFleet}
                selectedVehicleId={activeVehicle?.id || null}
                activePinMode={activePinMode}
                onSelectVehicle={handleSelectVehicle}
                onCoordinatesChange={handleCoordinatesChange}
                className="h-[360px] sm:h-[440px] lg:h-full lg:min-h-[500px]"
              />
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/80 px-4 py-2.5 text-xs text-muted-foreground sm:px-5 font-mono">
              <span>Direct highway routing calculation</span>
              <span className="shrink-0 font-bold text-foreground">
                {distanceKm} km route • {formatDriveDuration(durationMinutes)}
              </span>
            </div>
          </div>
        </section>

        {/* Bottom Fleet Registry Section (Matching PublicMarketPage market-registry) */}
        <section ref={fleetRef} className="market-registry mt-10 scroll-mt-16 sm:mt-12">
          <div className="mx-auto w-full max-w-7xl space-y-7 px-4 py-11 sm:px-6 sm:py-14">
            <div className="max-w-2xl">
              <h2 className="market-section-title text-balance text-foreground">
                Hire a vehicle for your next field trip
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Compare nearby vehicles, driver ratings, capacity, and a route-based fare before booking.
              </p>
            </div>

            {/* Search & Filter Toolbar (Matching Market Search Deck) */}
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-background shadow-[0_1px_2px_rgba(15,23,20,0.05)]">
              <div className="space-y-3 p-3 sm:p-4">
                <div className="flex gap-2.5">
                  <div className="relative min-w-0 flex-1">
                    <label htmlFor="fleet-search" className="sr-only">
                      Search fleet
                    </label>
                    <IconSearch
                      className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="fleet-search"
                      placeholder="Search vehicle model, driver name, license plate..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
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

                  <Select
                    value={sort}
                    onValueChange={(val) => setSort(val as SortKey)}
                  >
                    <SelectTrigger className="hidden h-11 w-[200px] shrink-0 rounded-xl bg-background text-sm sm:flex">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      {SORT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Scope Category Filter Tabs */}
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
                    Everything ({baseFleet.length})
                  </button>
                  {(Object.keys(VEHICLE_TIERS) as VehicleTierId[]).map((tierId) => {
                    const t = VEHICLE_TIERS[tierId];
                    const isCur = selectedTier === tierId;
                    const count = baseFleet.filter((v) => v.tierId === tierId).length;
                    return (
                      <button
                        key={tierId}
                        type="button"
                        onClick={() => setSelectedTier(tierId)}
                        className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all ${
                          isCur
                            ? "bg-foreground text-background font-bold shadow-sm"
                            : "bg-muted/70 text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        {t.shortName} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 3-Column Marketplace-Style Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
              {filteredFleet.length === 0 ? (
                <div className="col-span-full py-16 text-center rounded-2xl border border-dashed border-border bg-card/50">
                  <IconTruck className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                  <h3 className="text-base font-bold text-foreground">No vehicles found</h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Try adjusting your search query or selecting a different vehicle category.
                  </p>
                </div>
              ) : (
                filteredFleet.map((vehicle) => {
                  const fare = calculateHireFare(VEHICLE_TIERS[vehicle.tierId], distanceKm);
                  const isSelected = activeVehicle?.id === vehicle.id;
                  return (
                    <VehicleHireCard
                      key={vehicle.id}
                      vehicle={vehicle}
                      fareBreakdown={fare}
                      isSelected={isSelected}
                      onSelect={handleSelectVehicle}
                      onBookNow={handleBookVehicleNow}
                    />
                  );
                })
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Booking Confirmation Dialog Modal */}
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

      {/* Trip History Dialog Modal */}
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
                  <div
                    key={b.bookingRef}
                    className="p-4 rounded-2xl border border-border bg-muted/20 text-xs space-y-2"
                  >
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
