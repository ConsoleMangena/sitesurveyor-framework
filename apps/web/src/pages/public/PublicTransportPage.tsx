import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  IconAdjustmentsHorizontal,
  IconArrowsExchange,
  IconChevronDown,
  IconClock,
  IconCurrentLocation,
  IconHistory,
  IconLayoutGrid,
  IconList,
  IconMap,
  IconMapPins,
  IconRoad,
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
import { PublicHeader } from "../../components/shared/PublicHeader.tsx";
import { PublicFooter } from "../../components/shared/PublicFooter.tsx";
import { useAuthStore } from "../../lib/auth/auth-store.ts";
import { cn } from "../../lib/utils.ts";
import TransportMap, { type TransportMapHandle } from "../../components/transport/TransportMap.tsx";
import { LocationSearchField } from "../../components/transport/LocationSearchField.tsx";
import { rememberLocation } from "../../components/transport/recentLocations.ts";
import { VehicleHireCard } from "../../components/transport/VehicleHireCard.tsx";
import { VehicleDetailDialog } from "../../components/transport/VehicleDetailDialog.tsx";
import { BookingSlip } from "../../components/transport/BookingSlip.tsx";
import { VEHICLE_TIER_THEME } from "../../components/transport/vehicleTierTheme.ts";
import { useAssistant } from "../../components/assistant/assistant-context.ts";
import { NearbyPrompt } from "../../components/shared/NearbyPrompt.tsx";
import { useDeviceLocation } from "../../lib/geo/useDeviceLocation.ts";
import { usePublicMeta } from "../../hooks/usePublicMeta.ts";
import { breadcrumbJsonLd } from "../../lib/seo/meta.ts";
import { groupByDistance } from "../../lib/geo/distance.ts";
import {
  calculateHireFare,
  calculateRoadDistanceKm,
  estimateDriveDurationMinutes,
  formatDriveDuration,
  generateFleetForCoordinates,
  isUpcomingTrip,
  loadSavedBookings,
  removeBookingFromStorage,
  SURVEY_GPS_PRESETS,
  TRIP_PROGRESS_STAGES,
  updateBookingStatus,
  VEHICLE_TIERS,
  type HireBooking,
  type HireVehicle,
  type LocationCoordinate,
  type VehicleTierId,
} from "../../lib/transportHire.ts";

type SortKey = "eta" | "price-asc" | "price-desc" | "rating" | "payload";

/** Fleet registry layout, mirroring the market page's list/split/map toggle. */
type FleetView = "list" | "split" | "map";

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
  const navigate = useNavigate();

  usePublicMeta("/transport", {
    jsonLd: (origin) =>
      breadcrumbJsonLd(origin, [
        { name: "Home", path: "/" },
        { name: "Transport", path: "/transport" },
      ]),
  });
  const fleetMapRef = useRef<TransportMapHandle>(null);
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
  const [fleetView, setFleetView] = useState<FleetView>("split");

  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [detailVehicle, setDetailVehicle] = useState<HireVehicle | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [recentBookings, setRecentBookings] = useState<HireBooking[]>(() => loadSavedBookings());
  const [historyOpen, setHistoryOpen] = useState(false);
  const { openAssistant } = useAssistant();

  // Device GPS: pickup comes from the phone, not typed coordinates. A cached
  // fix from a previous visit is applied silently; a manual edit overrides it
  // and stops the automatic re-centring (appliedRef).
  const geo = useDeviceLocation();
  const appliedRef = useRef(false);
  const [manualPickup, setManualPickup] = useState(false);
  useEffect(() => {
    if (!geo.location || appliedRef.current || manualPickup) return;
    appliedRef.current = true;
    const { lat, lng } = geo.location;
    setPickup({ lat, lng, label: `My GPS location (${lat.toFixed(3)}, ${lng.toFixed(3)})`, isCustom: true });
    fleetMapRef.current?.centerCoordinate(lat, lng);
  }, [geo.location, manualPickup]);

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

  // Keep the nearby fleet sorted as one simple registry, without splitting the
  // Qoder layout into separate distance sections.
  const nearbyFleet = useMemo(
    () =>
      groupByDistance(
        filteredFleet.map((vehicle) => ({
          ...vehicle,
          lat: vehicle.currentLat,
          lng: vehicle.currentLng,
        })),
        { lat: pickup.lat, lng: pickup.lng },
      ).flatMap((group) => group.items.map(({ item }) => item)),
    [filteredFleet, pickup],
  );

  const activeVehicle = useMemo(() => {
    if (selectedVehicleId) return baseFleet.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;
    return filteredFleet[0] ?? null;
  }, [baseFleet, filteredFleet, selectedVehicleId]);

  const selectedExcluded = Boolean(
    selectedVehicleId && activeVehicle && !filteredFleet.some((vehicle) => vehicle.id === selectedVehicleId),
  );

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
    setManualPickup(false);
    appliedRef.current = false;
    void geo.locate();
  }, [geo]);

  const handleCoordinatesChange = useCallback(
    (type: "pickup" | "dropoff", coordinates: LocationCoordinate) => {
      rememberLocation(coordinates);
      if (type === "pickup") {
        setPickup(coordinates);
        // A typed or pinned pickup wins over the device fix from here on.
        setManualPickup(true);
      } else {
        setDropoff(coordinates);
      }
      setActivePinMode(null);
    },
    [],
  );

  // Arming a pin implies wanting to place it on the map. The registry map is
  // the page's only map, so reveal it if the fleet is in plain list view.
  const handleTogglePin = useCallback((type: "pickup" | "dropoff") => {
    setActivePinMode((current) => (current === type ? null : type));
    setFleetView((view) => (view === "list" ? "split" : view));
  }, []);

  const handleSelectVehicle = useCallback((vehicle: HireVehicle) => {
    setSelectedVehicleId(vehicle.id);
    document.querySelector(`[data-vehicle-id="${vehicle.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    fleetMapRef.current?.focusVehicle(vehicle);
  }, []);

  const handleOpenVehicleDetail = useCallback((vehicle: HireVehicle) => {
    setSelectedVehicleId(vehicle.id);
    setDetailVehicle(vehicle);
    setIsDetailOpen(true);
    fleetMapRef.current?.focusVehicle(vehicle);
  }, []);

  const handleShowVehicleOnMap = useCallback((vehicle: HireVehicle) => {
    setSelectedVehicleId(vehicle.id);
    setIsDetailOpen(false);
    // The registry map is the page's only map: make sure it is mounted before
    // the visitor lands on it, then bring the section into view.
    if (fleetView === "list") setFleetView("split");
    fleetMapRef.current?.focusVehicle(vehicle);
    fleetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [fleetView]);

  const handleBookFromDetail = useCallback((vehicle: HireVehicle) => {
    setSelectedVehicleId(vehicle.id);
    setIsDetailOpen(false);
    if (!user) {
      navigate("/login", { state: { from: "/transport" } });
      return;
    }
    setIsBookingOpen(true);
  }, [navigate, user]);

  const handleBookVehicleNow = useCallback((vehicle: HireVehicle) => {
    setSelectedVehicleId(vehicle.id);
    if (!user) {
      navigate("/login", { state: { from: "/transport" } });
      return;
    }
    setIsBookingOpen(true);
  }, [navigate, user]);

  const handleBookNearest = useCallback(() => {
    if (nearbyFleet[0]) handleBookVehicleNow(nearbyFleet[0]);
  }, [handleBookVehicleNow, nearbyFleet]);

  const handleBookingConfirmed = useCallback((booking: HireBooking) => {
    setRecentBookings((previous) => [booking, ...previous.slice(0, 19)]);
    toast.success(`Trip booked: ${booking.bookingRef}`, {
      description: `${booking.vehicle.model} · ${booking.vehicle.driverName} · $${booking.fareBreakdown.totalFare.toFixed(2)}`,
    });
  }, []);

  const handleCancelTrip = useCallback((bookingRef: string) => {
    // updateBookingStatus reads + writes localStorage and returns the full
    // next list, so the toast and the state swap both work off one result.
    const updated = updateBookingStatus(bookingRef, "cancelled");
    const target = updated.find((item) => item.bookingRef === bookingRef);
    setRecentBookings(updated);
    toast.success("Trip cancelled", {
      description: target ? `${bookingRef} · ${target.vehicle.model}` : bookingRef,
    });
  }, []);

  const handleAdvanceTrip = useCallback((booking: HireBooking) => {
    const stageIndex = TRIP_PROGRESS_STAGES.findIndex((stage) => stage.status === booking.status);
    const next = TRIP_PROGRESS_STAGES[stageIndex + 1];
    if (!next) return;
    setRecentBookings(updateBookingStatus(booking.bookingRef, next.status));
    if (next.status === "completed") {
      toast.success(`Trip completed: ${booking.bookingRef}`, {
        description: `${booking.vehicle.model} · $${booking.fareBreakdown.totalFare.toFixed(2)}`,
      });
    }
  }, []);

  const handleRemoveTrip = useCallback((bookingRef: string) => {
    setRecentBookings(removeBookingFromStorage(bookingRef));
    toast.success("Trip removed");
  }, []);

  const scrollToFleet = () => {
    fleetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const applyPreset = (preset: LocationCoordinate) => {
    setDropoff(preset);
    fleetMapRef.current?.centerCoordinate(preset.lat, preset.lng);
  };

  return (
    <div className="web3-surface">
      <PublicHeader
        section="Field Vehicle Hire"
        actions={
          <button
            type="button"
            onClick={() => user ? setHistoryOpen(true) : navigate("/login", { state: { from: "/transport" } })}
            className="public-site-tool"
            aria-label={`Open your trips, ${recentBookings.length} recorded`}
          >
            <IconHistory className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">Trips</span>
            {recentBookings.length > 0 ? (
              <span className="flex size-4 items-center justify-center rounded-full bg-primary font-mono text-[10px] font-semibold tabular-nums text-primary-foreground">
                {recentBookings.length}
              </span>
            ) : null}
          </button>
        }
        account={user ? (
          <AccountMenu
            user={user}
            trigger={
              <Button
                variant="outline"
                className="group h-8 gap-1.5 rounded-full py-1 pl-1 pr-2.5"
                aria-label={`Open account menu (${user.name})`}
              >
                <AccountMenuAvatar user={user} className="size-6" />
                <span className="max-w-[132px] truncate text-xs font-semibold max-sm:hidden">{user.name}</span>
                <IconChevronDown className="size-3 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
              </Button>
            }
          >
            <AccountMenuItem icon={IconLayoutGrid} label="Open your workspace" to="/workspace" />
            <AccountMenuItem icon={IconSettings} label="Settings" to="/workspace?view=settings" />
          </AccountMenu>
        ) : undefined}
      />

      <main>
        <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-start lg:gap-12 lg:py-16">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-micro font-semibold uppercase tracking-[0.14em] text-primary">
              <IconSteeringWheel className="size-3.5" aria-hidden="true" />
              Field vehicle hire
            </span>
            <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
              Hire a vehicle for a survey run
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background px-2.5 py-1 text-micro font-semibold text-muted-foreground">
                <IconCurrentLocation className="size-3.5 text-success" aria-hidden="true" />
                GPS pickup
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background px-2.5 py-1 text-micro font-semibold text-muted-foreground">
                <IconRoute className="size-3.5 text-primary" aria-hidden="true" />
                Road-distance fares
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background px-2.5 py-1 text-micro font-semibold text-muted-foreground">
                <IconTruck className="size-3.5 text-info" aria-hidden="true" />
                {TIER_IDS.length} vehicle classes
              </span>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" onClick={handleBookNearest} className="web3-btn web3-btn-primary gap-1.5">
                Book nearest vehicle
                <IconTruck className="size-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={scrollToFleet} className="web3-btn gap-1.5">
                Browse the sample fleet
                <IconChevronDown className="size-4" aria-hidden="true" />
              </button>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                {baseFleet.length} sample vehicles nearby
              </span>
            </div>
            <p className="mt-3 text-micro font-medium text-muted-foreground">
              Illustrative only, not live availability.
            </p>
          </div>

          <section
            aria-label="Route planner"
            className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-card"
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
                title="Swap pickup and destination"
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border/80 bg-background px-2.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              >
                <IconArrowsExchange className="size-3.5" aria-hidden="true" />
                Swap
              </button>
            </div>

            <div className="flex-1 space-y-4 px-4 py-4 sm:px-5">
              <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
                <span
                  aria-hidden="true"
                  className="col-start-1 row-start-1 mt-1.5 flex size-6 items-center justify-center rounded-full bg-success/12 text-[10px] font-bold text-success ring-1 ring-success/25"
                >
                  A
                </span>
                <span
                  aria-hidden="true"
                  className="col-start-1 row-span-2 row-start-1 mt-9 w-px justify-self-center border-l border-dashed border-border"
                />
                <div className="col-start-2 row-start-1 min-w-0">
                  <LocationSearchField
                    kind="pickup"
                    location={pickup}
                    pinActive={activePinMode === "pickup"}
                    isLocating={geo.status === "locating"}
                    onChange={(place) => handleCoordinatesChange("pickup", place)}
                    onTogglePin={() => handleTogglePin("pickup")}
                    onUseLocation={handleUseCurrentLocation}
                  />
                </div>
                <div className="col-start-2 row-start-2 min-w-0 py-4">
                  <NearbyPrompt geo={geo} count={baseFleet.length} noun="vehicles" />
                </div>
                <span
                  aria-hidden="true"
                  className="col-start-1 row-start-3 mt-1.5 flex size-6 items-center justify-center rounded-full bg-primary/12 text-[10px] font-bold text-primary ring-1 ring-primary/25"
                >
                  B
                </span>
                <div className="col-start-2 row-start-3 min-w-0">
                  <LocationSearchField
                    kind="dropoff"
                    location={dropoff}
                    pinActive={activePinMode === "dropoff"}
                    onChange={(place) => handleCoordinatesChange("dropoff", place)}
                    onTogglePin={() => handleTogglePin("dropoff")}
                  />
                </div>
              </div>

              <div className="space-y-2 border-t border-border/70 pt-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <IconMapPins className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  Survey baselines
                </p>
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

            <div className="web3-ticker web3-ticker--thirds shrink-0 border-t border-border/80">
              <div className="web3-ticker-cell">
                <span className="web3-ticker-label">
                  <IconRoad className="size-3.5" aria-hidden="true" />
                  Road distance
                </span>
                <span className="web3-ticker-value">{distanceKm.toLocaleString()} km</span>
              </div>
              <div className="web3-ticker-cell">
                <span className="web3-ticker-label">
                  <IconClock className="size-3.5" aria-hidden="true" />
                  Drive time
                </span>
                <span className="web3-ticker-value">{formatDriveDuration(durationMinutes)}</span>
              </div>
              <div className="web3-ticker-cell">
                <span className="web3-ticker-label">
                  <IconTruck className="size-3.5" aria-hidden="true" />
                  Sample fleet
                </span>
                <span className="web3-ticker-value">{baseFleet.length} vehicles</span>
              </div>
            </div>
          </section>
        </section>

        <section ref={fleetRef} className="market-registry mt-10 scroll-mt-[calc(var(--public-header-h)+1rem)] sm:mt-12">
          <div className="mx-auto w-full max-w-7xl space-y-7 px-4 py-11 sm:px-6 sm:py-14">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <span className="inline-flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.14em] text-primary">
                  <IconTruck className="size-3.5" aria-hidden="true" />
                  Fleet registry
                  <span aria-hidden="true" className="text-muted-foreground/60">/</span>
                  <button
                    type="button"
                    onClick={openAssistant}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <IconSparkles className="size-3.5" aria-hidden="true" />
                    Ask AI
                  </button>
                </span>
                <h2 className="market-section-title mt-2 text-balance text-foreground">
                  Browse the fleet
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
                  Every fare is recalculated for your route. Pick a class, search, or flip to the map
                  when location matters.
                </p>
              </div>
              <div role="group" aria-label="Fleet view" className="inline-flex rounded-lg border border-border bg-card p-1">
                {([
                  { value: "list", label: "List", icon: IconList },
                  { value: "split", label: "Split", icon: IconLayoutGrid },
                  { value: "map", label: "Map", icon: IconMap },
                ] as const).map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={fleetView === value}
                    onClick={() => setFleetView(value)}
                    className={cn(
                      "inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                      fleetView === value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
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
                    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-3 text-sm font-medium transition-colors sm:px-4",
                    selectedTier === "all"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <IconLayoutGrid className="size-4 shrink-0" aria-hidden="true" />
                  Everything
                  <span className="font-mono text-micro tabular-nums text-muted-foreground">
                    {tierCounts.all}
                  </span>
                </button>
                {TIER_IDS.map((tierId) => {
                  const TierIcon = VEHICLE_TIER_THEME[tierId].icon;
                  return (
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
                      <TierIcon
                        className="size-4 shrink-0"
                        style={{ color: VEHICLE_TIER_THEME[tierId].dot }}
                        aria-hidden="true"
                      />
                      {VEHICLE_TIERS[tierId].shortName}
                      <span className="font-mono text-micro tabular-nums text-muted-foreground">
                        {tierCounts[tierId]}
                      </span>
                    </button>
                  );
                })}
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

            <div
              className={cn(
                "items-start gap-6",
                fleetView === "list"
                  ? "block"
                  : cn("grid grid-cols-1", fleetView === "split" && "xl:grid-cols-[minmax(0,1fr)_340px]"),
              )}
            >
              <div className="min-w-0">
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
                  <div
                    className={cn(
                      "grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
                      fleetView === "split" && "xl:grid-cols-3",
                    )}
                  >
                    {nearbyFleet.map((vehicle) => (
                      <VehicleHireCard
                        key={vehicle.id}
                        vehicle={vehicle}
                        fareBreakdown={calculateHireFare(VEHICLE_TIERS[vehicle.tierId], distanceKm)}
                        isSelected={activeVehicle?.id === vehicle.id}
                        onSelect={handleOpenVehicleDetail}
                        onBookNow={handleBookVehicleNow}
                      />
                    ))}
                  </div>
                )}
              </div>

              {fleetView !== "list" ? (
                <aside
                  aria-label="Route and fleet map"
                  className={cn(
                    "market-map-frame overflow-hidden rounded-2xl border border-border/80 bg-card",
                    fleetView === "split"
                      ? "order-first xl:order-none xl:sticky xl:top-[calc(var(--public-header-h)+1.25rem)]"
                      : "order-first w-full",
                  )}
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <IconRoute className="size-4 text-primary" aria-hidden="true" />
                      <h3 className="text-sm font-semibold text-foreground">Route map</h3>
                    </div>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {filteredFleet.length} pinned
                    </span>
                  </div>
                  <TransportMap
                    ref={fleetMapRef}
                    pickup={pickup}
                    dropoff={dropoff}
                    vehicles={filteredFleet}
                    selectedVehicleId={activeVehicle?.id ?? null}
                    activePinMode={activePinMode}
                    onSelectVehicle={handleSelectVehicle}
                    onCoordinatesChange={handleCoordinatesChange}
                    className={fleetView === "map" ? "h-[65dvh] min-h-[440px]" : "h-[42svh] min-h-[300px] xl:h-[440px]"}
                  />
                  <div className="border-t border-border/80 px-4 py-2.5 text-micro text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium">Fleet mix</span>
                      {TIER_IDS.map((tierId) => (
                        <span key={tierId} className="inline-flex items-center gap-1">
                          <span
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: VEHICLE_TIER_THEME[tierId].dot }}
                            aria-hidden="true"
                          />
                          {VEHICLE_TIERS[tierId].shortName}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1.5">
                      Select a pin to open its card. Arm a pin in the planner to place it here, or
                      drag the A and B markers to reprice the route.
                    </p>
                  </div>
                </aside>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      {activeVehicle && selectedExcluded ? (
        <p role="status" className="sr-only">
          The selected vehicle is hidden by the current filters. Clear filters to choose it.
        </p>
      ) : null}

      <PublicFooter />

      {detailVehicle ? (
        <VehicleDetailDialog
          vehicle={detailVehicle}
          fareBreakdown={calculateHireFare(VEHICLE_TIERS[detailVehicle.tierId], distanceKm)}
          pickup={pickup}
          dropoff={dropoff}
          durationMinutes={durationMinutes}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          onBookNow={handleBookFromDetail}
          onShowOnMap={handleShowVehicleOnMap}
        />
      ) : null}

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
              Hires you confirm are kept on this device, with their reference, route and fare.
            </SheetDescription>
          </SheetHeader>

          <div className="market-detail-scroll flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {recentBookings.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-6 py-14 text-center">
                <IconHistory className="size-7 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-semibold text-foreground">No trips yet</p>
                <p className="max-w-xs text-xs leading-5 text-muted-foreground">
                  Hire a vehicle and its reference, route and fare will be listed here.
                </p>
              </div>
            ) : (
              <>
                {(() => {
                  const upcoming = recentBookings.filter((booking) => isUpcomingTrip(booking.status));
                  const past = recentBookings.filter((booking) => !isUpcomingTrip(booking.status));
                  return [
                    { key: "upcoming", title: "Upcoming", items: upcoming },
                    { key: "past", title: "Earlier", items: past },
                  ]
                    .filter((group) => group.items.length > 0)
                    .map((group) => (
                      <section key={group.key} className="space-y-2.5">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {group.title}
                        </h3>
                        {group.items.map((booking) => {
                          const upcoming = isUpcomingTrip(booking.status);
                          const stageIndex = TRIP_PROGRESS_STAGES.findIndex(
                            (stage) => stage.status === booking.status,
                          );
                          return (
                            <article
                              key={booking.bookingRef}
                              className="space-y-2.5 rounded-2xl border border-border/80 bg-card p-4"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                                  {booking.bookingRef}
                                </span>
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded-full px-2.5 py-1 text-micro font-semibold capitalize",
                                    booking.status === "completed" && "bg-success/10 text-success",
                                    booking.status === "cancelled" && "bg-muted text-muted-foreground",
                                    upcoming && "bg-info/10 text-info",
                                  )}
                                >
                                  {booking.status.replace("_", " ")}
                                </span>
                              </div>

                              <div>
                                <p className="text-sm font-semibold text-foreground">{booking.vehicle.model}</p>
                                <p className="text-xs text-muted-foreground">
                                  {booking.vehicle.licensePlate} · Driver {booking.vehicle.driverName}
                                </p>
                              </div>

                              {upcoming ? (
                                <ol className="flex items-center gap-1" aria-label="Trip progress">
                                  {TRIP_PROGRESS_STAGES.map((stage, index) => (
                                    <li key={stage.status} className="flex min-w-0 flex-1 flex-col gap-1">
                                      <span
                                        className={cn(
                                          "h-1 rounded-full",
                                          index <= stageIndex ? "bg-primary" : "bg-muted",
                                        )}
                                        aria-hidden="true"
                                      />
                                      <span
                                        className={cn(
                                          "truncate text-[10px] leading-tight",
                                          index <= stageIndex
                                            ? "font-medium text-foreground"
                                            : "text-muted-foreground",
                                        )}
                                      >
                                        {stage.label}
                                      </span>
                                    </li>
                                  ))}
                                </ol>
                              ) : null}

                              <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-2 font-mono text-micro tabular-nums text-muted-foreground">
                                <span className="truncate">
                                  {booking.pickup.label} → {booking.dropoff.label} · {booking.fareBreakdown.distanceKm} km
                                </span>
                                <span className="shrink-0 font-semibold text-foreground">
                                  ${booking.fareBreakdown.totalFare.toFixed(2)}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                {upcoming ? (
                                  <>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-9 flex-1 rounded-xl text-xs"
                                      onClick={() => handleAdvanceTrip(booking)}
                                      disabled={stageIndex >= TRIP_PROGRESS_STAGES.length - 1}
                                    >
                                      {stageIndex >= TRIP_PROGRESS_STAGES.length - 2
                                        ? "Complete trip"
                                        : "Advance status"}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-9 rounded-xl text-xs text-muted-foreground hover:text-destructive"
                                      onClick={() => handleCancelTrip(booking.bookingRef)}
                                    >
                                      Cancel
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 w-full rounded-xl text-xs text-muted-foreground hover:text-destructive"
                                    onClick={() => handleRemoveTrip(booking.bookingRef)}
                                  >
                                    Remove trip
                                  </Button>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </section>
                    ));
                })()}
              </>
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
                {TIER_IDS.map((tierId) => {
                  const TierIcon = VEHICLE_TIER_THEME[tierId].icon;
                  return (
                    <Button
                      key={tierId}
                      type="button"
                      variant={selectedTier === tierId ? "default" : "outline"}
                      className="h-10 justify-start gap-2 rounded-xl px-3 text-xs"
                      onClick={() => setSelectedTier(tierId)}
                    >
                      <TierIcon
                        className="size-4 shrink-0"
                        style={{ color: VEHICLE_TIER_THEME[tierId].dot }}
                        aria-hidden="true"
                      />
                      <span className="truncate">{VEHICLE_TIERS[tierId].shortName}</span>
                      <span className="ml-auto font-mono text-micro tabular-nums opacity-70">
                        {tierCounts[tierId]}
                      </span>
                    </Button>
                  );
                })}
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
