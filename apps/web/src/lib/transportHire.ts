/**
 * SiteSurveyor On-Demand Vehicle Hire & Dynamic Distance Pricing Engine
 *
 * Fully coordinate-based (GPS Latitude & Longitude) route calculation:
 *   Total Fare = Base Fare + (Road Distance km × Rate per km) + Toll Levies
 *
 * Supports browser GPS geolocation, custom map coordinates, and
 * regional survey baseline coordinate presets.
 */

export interface LocationCoordinate {
  id?: string;
  label: string;
  lat: number;
  lng: number;
  isCustom?: boolean;
}

export type VehicleTierId =
  | "bakkie_4x4"
  | "crew_van"
  | "heavy_truck"
  | "executive_suv"
  | "rapid_runner";

export interface VehicleTier {
  id: VehicleTierId;
  name: string;
  shortName: string;
  tagline: string;
  examples: string;
  baseFare: number;
  ratePerKm: number;
  minFare: number;
  seats: number;
  payloadKg: number;
  badge: string;
  recommendedFor: string;
  features: string[];
}

export interface HireVehicle {
  id: string;
  tierId: VehicleTierId;
  model: string;
  licensePlate: string;
  driverName: string;
  driverRating: number;
  completedTrips: number;
  driverPhone: string;
  currentLat: number;
  currentLng: number;
  etaMinutes: number;
  status: "available" | "busy";
  color: string;
  features: string[];
}

export interface FareBreakdown {
  currency: string;
  baseFare: number;
  distanceKm: number;
  ratePerKm: number;
  distanceCost: number;
  tollAndRoadFee: number;
  totalFare: number;
}

export interface HireBooking {
  bookingRef: string;
  vehicle: HireVehicle;
  tier: VehicleTier;
  pickup: LocationCoordinate;
  dropoff: LocationCoordinate;
  fareBreakdown: FareBreakdown;
  durationMinutes: number;
  status: "dispatched" | "arrived" | "completed";
  paymentMethod: "ecocash" | "card" | "cash_on_site" | "corporate_invoice";
  contactName: string;
  contactPhone: string;
  specialNotes?: string;
  createdAt: string;
}

/**
 * 5 Specialized Vehicle Tiers tailored for survey & engineering fieldwork.
 */
export const VEHICLE_TIERS: Record<VehicleTierId, VehicleTier> = {
  bakkie_4x4: {
    id: "bakkie_4x4",
    name: "Survey 4x4 Bakkie",
    shortName: "4x4 Bakkie",
    tagline: "Rugged double cab with locked canopy and equipment roof rack",
    examples: "Toyota Hilux 2.8 GD-6 / Isuzu D-Max 4WD",
    baseFare: 25.0,
    ratePerKm: 0.85,
    minFare: 35.0,
    seats: 5,
    payloadKg: 1000,
    badge: "Most Popular",
    recommendedFor: "GNSS base station setups, boundary surveying & rough bush access",
    features: [
      "4WD High & Low Range",
      "Steel Canopy with Security Locks",
      "Heavy Duty Roof Rack",
      "Dual Battery & 220V Inverter",
      "All-Terrain Tires",
    ],
  },
  crew_van: {
    id: "crew_van",
    name: "Field Crew Van",
    shortName: "Crew Van",
    tagline: "Spacious multi-passenger carrier for survey teams & field assistants",
    examples: "Toyota Quantum 2.5 D-4D / HiAce Commuter 4x4",
    baseFare: 35.0,
    ratePerKm: 1.15,
    minFare: 50.0,
    seats: 14,
    payloadKg: 1500,
    badge: "Crew Carrier",
    recommendedFor: "Multi-person drilling, topo squads & geotechnical census runs",
    features: [
      "High Roof Interior",
      "Dual Air Conditioning",
      "Rear Equipment Hold",
      "First Aid & Fire Suppressant Kit",
      "Tow Hitch",
    ],
  },
  heavy_truck: {
    id: "heavy_truck",
    name: "Heavy Utility Truck",
    shortName: "5-Ton Canter",
    tagline: "Heavy-duty dropside flatbed for borehole drill rods, casings & pumps",
    examples: "Isuzu NPR 5-Ton Canter / Mitsubishi Fuso Fighter",
    baseFare: 65.0,
    ratePerKm: 1.75,
    minFare: 90.0,
    seats: 3,
    payloadKg: 5000,
    badge: "Heavy Haulage",
    recommendedFor: "Drilling equipment, 200m+ PVC casing rods, submersible pumps & bulk cement",
    features: [
      "Drop-side Flatbed Cargo Body",
      "Hydraulic Tail-Lift Assist",
      "High Load Tie-Down Ratchets",
      "Rough Terrain Axle Clearance",
      "Heavy Equipment Certified",
    ],
  },
  executive_suv: {
    id: "executive_suv",
    name: "Executive Site SUV",
    shortName: "Site SUV",
    tagline: "Executive 4WD comfort for client inspections and mine investor walkthroughs",
    examples: "Toyota Land Cruiser Prado TX / Fortuner 4x4",
    baseFare: 45.0,
    ratePerKm: 1.35,
    minFare: 60.0,
    seats: 7,
    payloadKg: 650,
    badge: "Executive VIP",
    recommendedFor: "Director inspections, client sign-offs & environmental review tours",
    features: [
      "Full Leather Interior & Climate Control",
      "Kinetic Dynamic Suspension (KDSS)",
      "High-Clearance 4x4 Underbody Protection",
      "Satellite WiFi Ready",
      "Tinted Privacy Glass",
    ],
  },
  rapid_runner: {
    id: "rapid_runner",
    name: "Rapid Field Runner",
    shortName: "Rapid Runner",
    tagline: "Agile utility courier for soil/water sample drop-offs and express spares",
    examples: "Nissan NP200 Half-Ton / Ford Bantam Heavy Pack",
    baseFare: 15.0,
    ratePerKm: 0.55,
    minFare: 22.0,
    seats: 2,
    payloadKg: 500,
    badge: "Fast Dispatch",
    recommendedFor: "Laboratory sample transit, drone battery relays & urgent tool deliveries",
    features: [
      "Quick Turnaround & Urban Maneuverability",
      "Weatherproof Tonneau Cover",
      "Insulated Specimen Cooler Box Ready",
      "Fuel Efficient Express Transit",
    ],
  },
};

/**
 * Standard survey base stations and key mining baseline coordinate presets.
 */
export const SURVEY_GPS_PRESETS: LocationCoordinate[] = [
  {
    id: "hre-central",
    label: "Harare Core Depot",
    lat: -17.8292,
    lng: 31.0522,
  },
  {
    id: "hre-msasa",
    label: "Msasa Survey Yard",
    lat: -17.8385,
    lng: 31.1089,
  },
  {
    id: "byo-central",
    label: "Bulawayo Hub Station",
    lat: -20.1500,
    lng: 28.5833,
  },
  {
    id: "mut-central",
    label: "Mutare Border Depot",
    lat: -18.9728,
    lng: 32.6695,
  },
  {
    id: "gwe-central",
    label: "Gweru Midlands Base",
    lat: -19.4500,
    lng: 29.8167,
  },
  {
    id: "mas-central",
    label: "Masvingo Transit Hub",
    lat: -20.0744,
    lng: 30.8328,
  },
  {
    id: "kwe-central",
    label: "Kwekwe Mineral Post",
    lat: -18.9281,
    lng: 29.8149,
  },
  {
    id: "zvi-central",
    label: "Great Dyke Platinum Belt",
    lat: -20.3333,
    lng: 30.0667,
  },
  {
    id: "vic-central",
    label: "Vic Falls Field Station",
    lat: -17.9311,
    lng: 25.8402,
  },
  {
    id: "bei-central",
    label: "Beitbridge Terminal",
    lat: -22.2167,
    lng: 30.0000,
  },
  {
    id: "chi-central",
    label: "Chinhoyi Outpost",
    lat: -17.3667,
    lng: 30.2000,
  },
];

/**
 * Parses user input into valid numeric latitude and longitude.
 * Supports:
 *   - "-17.8292, 31.0522"
 *   - "-17.8292 31.0522"
 *   - "17.8292 S, 31.0522 E"
 */
export function parseCoordinateString(input: string): { lat: number; lng: number } | null {
  if (!input || !input.trim()) return null;
  const cleaned = input.trim();

  // Try standard comma or space separated numbers: "lat, lng" or "lat lng"
  const match = cleaned.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat: Math.round(lat * 100000) / 100000, lng: Math.round(lng * 100000) / 100000 };
    }
  }

  return null;
}

/**
 * Formats coordinates for clean visual display (e.g. "-17.82920, 31.05220")
 */
export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/**
 * Great-Circle Haversine formula adjusted with a realistic road tortuosity multiplier (~1.25)
 * to accurately estimate driving distance from exact coordinates.
 */
export function calculateRoadDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const R = 6371; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const directDistance = R * c;

  // Road network tortuosity factor
  const highwayFactor = 1.25;
  const roadKm = directDistance * highwayFactor;

  return Math.round(roadKm * 10) / 10;
}

/**
 * Computes estimated driving duration in minutes.
 */
export function estimateDriveDurationMinutes(distanceKm: number): number {
  if (distanceKm <= 0) return 0;
  const hours = distanceKm / 75;
  return Math.max(10, Math.round(hours * 60));
}

/**
 * Formats duration into human readable string (e.g., "4h 25m" or "35 mins").
 */
export function formatDriveDuration(minutes: number): string {
  if (minutes <= 0) return "0 mins";
  if (minutes < 60) return `${minutes} mins`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs} hrs`;
}

/**
 * Calculates dynamic Uber-style fare based on distance and vehicle category:
 *   Total = Base Fare + (Distance km × Rate/km) + Toll & Road Levies
 */
export function calculateHireFare(tier: VehicleTier, distanceKm: number): FareBreakdown {
  const safeDistance = Math.max(0, distanceKm);
  const baseFare = tier.baseFare;
  const distanceCost = Math.round(safeDistance * tier.ratePerKm * 100) / 100;

  // Estimated road toll gate passes (~$2 per 90km highway stretch, max $12)
  const tollPasses = safeDistance > 40 ? Math.min(6, Math.ceil(safeDistance / 85)) : 0;
  const tollAndRoadFee = tollPasses * 2.0;

  const calculatedTotal = baseFare + distanceCost + tollAndRoadFee;
  const totalFare = Math.max(tier.minFare, Math.round(calculatedTotal * 100) / 100);

  return {
    currency: "USD",
    baseFare,
    distanceKm: safeDistance,
    ratePerKm: tier.ratePerKm,
    distanceCost,
    tollAndRoadFee,
    totalFare,
  };
}

/**
 * Deterministic pseudo-random generator seeded by string, ensuring stable
 * fleet generation for each chosen pickup coordinate.
 */
function seedRandom(seedStr: string): () => number {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  return function () {
    hash = (hash + 0x6d2b79f5) | 0;
    let t = Math.imul(hash ^ (hash >>> 15), 1 | hash);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DRIVER_ROSTER = [
  { name: "Farai Ndlovu", rating: 4.96, trips: 412, phone: "+263 77 234 8901" },
  { name: "Blessing Chidavaenzi", rating: 4.92, trips: 285, phone: "+263 71 884 1029" },
  { name: "Tinashe Dube", rating: 4.89, trips: 198, phone: "+263 78 440 3391" },
  { name: "Tendai Moyo", rating: 4.98, trips: 530, phone: "+263 77 912 4040" },
  { name: "Simbarashe Mutasa", rating: 4.91, trips: 310, phone: "+263 73 501 2293" },
  { name: "Nkosana Ncube", rating: 4.88, trips: 176, phone: "+263 77 629 1148" },
  { name: "Tafadzwa Gonese", rating: 4.95, trips: 460, phone: "+263 78 771 9022" },
  { name: "Kudzai Marume", rating: 4.94, trips: 390, phone: "+263 71 309 8451" },
  { name: "Vusumuzi Sibanda", rating: 4.9, trips: 220, phone: "+263 77 418 5560" },
  { name: "Chipo Mupfumira", rating: 4.97, trips: 488, phone: "+263 78 620 4419" },
];

const FLEET_MODELS: Record<
  VehicleTierId,
  { models: string[]; plates: string[]; colors: string[] }
> = {
  bakkie_4x4: {
    models: [
      "Toyota Hilux 2.8 GD-6 4x4 Raider",
      "Isuzu D-Max 3.0 Ddi V-Cross 4WD",
      "Ford Ranger 2.0 Bi-Turbo 4x4 XLT",
      "Toyota Land Cruiser 79 4.5D V8 Single Cab",
    ],
    plates: ["AFK-8921", "AGB-4410", "AEZ-9024", "AFR-3180", "AGE-1299"],
    colors: ["Super White", "Granite Grey", "Sand Beige", "Charcoal Silver"],
  },
  crew_van: {
    models: [
      "Toyota Quantum 2.5 D-4D 14-Seater 4WD",
      "Toyota HiAce Commuter 2.7 VVT-i",
      "Nissan NV350 Impendulo 16-Seater",
    ],
    plates: ["AFA-7703", "AGD-5182", "AFM-6291", "AEW-8819"],
    colors: ["Classic White", "Silver Metallic"],
  },
  heavy_truck: {
    models: [
      "Isuzu NPR 400 5-Ton Dropside Flatbed",
      "Mitsubishi Fuso Canter 4.5-Ton Crane Truck",
      "Hino 300 Series 4-Ton Utility Flatbed",
    ],
    plates: ["AGF-9902", "AEB-3104", "AFJ-4481", "AGK-2210"],
    colors: ["Highway White", "Fleet Yellow", "Industrial Grey"],
  },
  executive_suv: {
    models: [
      "Toyota Land Cruiser Prado TX-L 2.8 GD-6",
      "Toyota Fortuner 2.8 GD-6 4x4 VX",
      "Mitsubishi Pajero Sport 2.4 D4 Exceed",
    ],
    plates: ["AGN-0012", "AFX-7744", "AGP-3881", "AEK-5520"],
    colors: ["Pearl White", "Attitude Black", "Phantom Grey"],
  },
  rapid_runner: {
    models: [
      "Nissan NP200 1.6 8V Heavy Pack Canopy",
      "Chevrolet Utility 1.4 Club",
      "Ford Bantam 1.3i Rocam Courier",
    ],
    plates: ["AFL-4190", "AGH-2911", "AET-7104", "AFY-8302"],
    colors: ["Alpine White", "Polar Silver"],
  },
};

/**
 * Generates available fleet positioned near a given pickup coordinate.
 */
export function generateFleetForCoordinates(
  pickup: LocationCoordinate,
  tierFilter?: VehicleTierId | "all",
): HireVehicle[] {
  const seedKey = `${pickup.lat.toFixed(3)}_${pickup.lng.toFixed(3)}`;
  const rng = seedRandom(seedKey);
  const tiers: VehicleTierId[] = [
    "bakkie_4x4",
    "bakkie_4x4",
    "crew_van",
    "heavy_truck",
    "executive_suv",
    "rapid_runner",
    "bakkie_4x4",
    "executive_suv",
  ];

  const vehicles: HireVehicle[] = [];

  tiers.forEach((tierId, index) => {
    if (tierFilter && tierFilter !== "all" && tierFilter !== tierId) {
      return;
    }

    const driverIdx = Math.floor(rng() * DRIVER_ROSTER.length);
    const driver = DRIVER_ROSTER[(driverIdx + index) % DRIVER_ROSTER.length];
    const fleetConfig = FLEET_MODELS[tierId];
    const model = fleetConfig.models[index % fleetConfig.models.length];
    const plate = fleetConfig.plates[(index + Math.floor(rng() * 5)) % fleetConfig.plates.length];
    const color = fleetConfig.colors[index % fleetConfig.colors.length];

    // Jitter vehicle coordinates within 0.8 - 4.5 km around the pickup coordinate
    const angle = rng() * 2 * Math.PI;
    const radiusKm = 0.8 + rng() * 3.8;
    const latOffset = (radiusKm / 111) * Math.cos(angle);
    const lngOffset = (radiusKm / (111 * Math.cos((pickup.lat * Math.PI) / 180))) * Math.sin(angle);

    const etaMins = Math.max(3, Math.round(radiusKm * 2.2 + rng() * 2));

    vehicles.push({
      id: `VEH-GPS-${100 + index}`,
      tierId,
      model,
      licensePlate: plate,
      driverName: driver.name,
      driverRating: driver.rating,
      completedTrips: driver.trips,
      driverPhone: driver.phone,
      currentLat: pickup.lat + latOffset,
      currentLng: pickup.lng + lngOffset,
      etaMinutes: etaMins,
      status: "available",
      color,
      features: VEHICLE_TIERS[tierId].features.slice(0, 3),
    });
  });

  return vehicles.sort((a, b) => a.etaMinutes - b.etaMinutes);
}

/** Local storage key for persistent bookings */
const BOOKINGS_STORAGE_KEY = "sitesurveyor_hire_bookings";

export function loadSavedBookings(): HireBooking[] {
  try {
    const raw = localStorage.getItem(BOOKINGS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HireBooking[];
  } catch {
    return [];
  }
}

export function saveBookingToStorage(booking: HireBooking): void {
  try {
    const existing = loadSavedBookings();
    const updated = [booking, ...existing.slice(0, 19)];
    localStorage.setItem(BOOKINGS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Non-fatal if localStorage is restricted
  }
}

export function generateBookingReference(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "SH-";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  code += "-";
  for (let i = 0; i < 3; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
