import { useCallback, useState } from "react";

import { supabase } from "../../lib/supabase/client.ts";
import { useAsyncAction } from "../../hooks/useAsyncAction.ts";
import type { Database } from "../../lib/supabase/types.ts";
import type { MarketDotGroup, MarketDotSource } from "./marketDots.ts";

// Supabase types every view column nullable even where the underlying base
// columns are NOT NULL. Normalize those fields once at the fetch boundary so
// consumers can rely on DB truth.
type DbListing = Database["public"]["Views"]["public_market_listings"]["Row"];
type DbProfessional =
  Database["public"]["Views"]["public_market_professionals"]["Row"];
type DbJob = Database["public"]["Views"]["public_market_jobs"]["Row"];
type DbFirm = Database["public"]["Views"]["public_market_firms"]["Row"];
type DbEvent = Database["public"]["Views"]["public_market_events"]["Row"];
type DbPortfolioItem =
  Database["public"]["Views"]["public_market_portfolio_items"]["Row"];

export type ListingRow = Omit<
  DbListing,
  "id" | "name" | "price" | "location" | "created_at"
> & {
  id: string;
  name: string;
  price: number;
  location: string;
  created_at: string;
  photos: string[];
};
export type ProfessionalRow = Omit<
  DbProfessional,
  "id" | "name" | "rate" | "location" | "created_at"
> & {
  id: string;
  name: string;
  rate: number;
  location: string;
  created_at: string;
};
export type JobRow = Omit<DbJob, "id" | "rate" | "location" | "created_at"> & {
  id: string;
  rate: number;
  location: string;
  created_at: string;
};
export type FirmRow = Omit<
  DbFirm,
  "id" | "name" | "location" | "created_at"
> & {
  id: string;
  name: string;
  location: string;
  created_at: string;
};
export type EventRow = Omit<
  DbEvent,
  "id" | "starts_at" | "price" | "location" | "created_at"
> & {
  id: string;
  starts_at: string;
  price: number;
  location: string;
  created_at: string;
};

export interface MarketData {
  listings: ListingRow[];
  professionals: ProfessionalRow[];
  jobs: JobRow[];
  firms: FirmRow[];
  events: EventRow[];
}

export interface LoadFailure {
  reason: "timeout" | "error";
  message: string;
  missingRelation: boolean;
}

export interface ShowcaseItemRow {
  id: string;
  title: string;
  year: string | null;
  description: string | null;
  image_path: string | null;
}

const toListingRows = (rows: DbListing[]): ListingRow[] =>
  rows.map((r) => ({
    ...r,
    id: r.id ?? "",
    name: r.name ?? "",
    price: r.price ?? 0,
    location: r.location ?? "",
    created_at: r.created_at ?? "",
    photos: r.photos ?? [],
  }));
const toProfessionalRows = (rows: DbProfessional[]): ProfessionalRow[] =>
  rows.map((r) => ({
    ...r,
    id: r.id ?? "",
    name: r.name ?? "",
    rate: r.rate ?? 0,
    location: r.location ?? "",
    created_at: r.created_at ?? "",
  }));
const toJobRows = (rows: DbJob[]): JobRow[] =>
  rows.map((r) => ({
    ...r,
    id: r.id ?? "",
    rate: r.rate ?? 0,
    location: r.location ?? "",
    created_at: r.created_at ?? "",
  }));
export const toPortfolioItemRows = (rows: DbPortfolioItem[]): ShowcaseItemRow[] =>
  rows
    .filter((r) => r.image_path != null)
    .map((r) => ({
      id: r.id ?? "",
      title: r.title ?? "",
      year: r.year,
      description: r.description,
      image_path: r.image_path,
    }));
const toFirmRows = (rows: DbFirm[]): FirmRow[] =>
  rows.map((r) => ({
    ...r,
    id: r.id ?? "",
    name: r.name ?? "",
    location: r.location ?? "",
    created_at: r.created_at ?? "",
  }));
const toEventRows = (rows: DbEvent[]): EventRow[] =>
  rows.map((r) => ({
    ...r,
    id: r.id ?? "",
    starts_at: r.starts_at ?? "",
    price: r.price ?? 0,
    location: r.location ?? "",
    created_at: r.created_at ?? "",
  }));

export const FALLBACK_MARKET_DATA: MarketData = {
  listings: [
    {
      id: "demo-listing-1",
      name: 'Leica TS16 P 1" R1000 Robotic Total Station',
      price: 14500,
      location: "Zurich, Switzerland",
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      photos: [],
      category: "instrument",
      type: "Total Station",
      condition: "Excellent",
      seller: "Alpine Geomatics AG",
      description: "Serviced with current calibration certificate. Includes CS20 field controller, batteries, charger, and tribrach.",
      latitude: 47.3769,
      longitude: 8.5417,
      currency: "USD",
      listing_type: "sale",
      specs: ['1" Angular Accuracy', "1000m R1000 EDM", "AutoLock & ATRplus"],
    },
    {
      id: "demo-listing-2",
      name: "Trimble R12i GNSS Receiver & TSC7 Field Kit",
      price: 12800,
      location: "Denver, Colorado, USA",
      created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
      photos: [],
      category: "instrument",
      type: "GNSS Receiver",
      condition: "Like New",
      seller: "Rocky Mountain Survey Supply",
      description: "Tilt compensation enabled with Trimble ProPoint engine. TSC7 running Trimble Access 2024 with worldwide geoid models.",
      latitude: 39.7392,
      longitude: -104.9903,
      currency: "USD",
      listing_type: "sale",
      specs: ["ProPoint GNSS Engine", "TIP Inertial Tilt", "4G LTE Modem"],
    },
    {
      id: "demo-listing-3",
      name: "DJI Matrice 350 RTK + Zenmuse P1 Photogrammetry",
      price: 9200,
      location: "Tokyo, Japan",
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      photos: [],
      category: "instrument",
      type: "UAV / Drone",
      condition: "Mint",
      seller: "Nippon Spatial Works",
      description: "Full-frame 45MP surveying camera with mechanical shutter, 4 BS65 smart batteries, BS65 battery station, and transport case.",
      latitude: 35.6762,
      longitude: 139.6503,
      currency: "USD",
      listing_type: "sale",
      specs: ["45MP Full-Frame Sensor", "O3 Enterprise Transmission", "55 Min Flight Time"],
    },
    {
      id: "demo-listing-4",
      name: "Faro Focus Core 3D Laser Scanner",
      price: 18000,
      location: "Munich, Germany",
      created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
      photos: [],
      category: "instrument",
      type: "Laser Scanner",
      condition: "Refurbished",
      seller: "Bavaria 3D Solutions",
      description: "Factory calibrated with 70m range, dual axis compensator, carbon tripod, and Faro Scene processing software license.",
      latitude: 48.1351,
      longitude: 11.5820,
      currency: "USD",
      listing_type: "hire",
      specs: ["70m Range", "Dual-Axis Compensator", "High-Dynamic Range (HDR)"],
    },
    {
      id: "demo-listing-5",
      name: "Seco 2.5m Carbon Fiber Snap-Lock Rover Rod & Bipod",
      price: 380,
      location: "London, UK",
      created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
      photos: [],
      category: "accessory",
      type: "Pole & Bipod",
      condition: "Brand New",
      seller: "Thames Geospatial Gear",
      description: "Lightweight carbon fiber rover rod with 40-minute vial and thumb-release quick clamp bipod.",
      latitude: 51.5074,
      longitude: -0.1278,
      currency: "USD",
      listing_type: "sale",
      specs: ["2.5m Telescopic Height", "Snap-Lock Pins", "Thumb-Release Bipod"],
    },
    {
      id: "demo-listing-6",
      name: "Geomax Zenith60 IMU-GNSS Smart Antenna",
      price: 7400,
      location: "Sydney, Australia",
      created_at: new Date(Date.now() - 9 * 86400000).toISOString(),
      photos: [],
      category: "instrument",
      type: "GNSS Receiver",
      condition: "Good",
      seller: "Pacific Survey Equipment",
      description: "Calibration-free tilt sensor, NovAtel OEM7 multi-frequency tracking, UHF radio modem and X-PAD Ultimate license.",
      latitude: -33.8688,
      longitude: 151.2093,
      currency: "USD",
      listing_type: "sale",
      specs: ["Calibration-Free IMU", "555 Channels Multi-Constellation", "IP68 Submersible"],
    },
    {
      id: "demo-listing-7",
      name: "Spectra Precision GL422N Dual Grade Laser",
      price: 2600,
      location: "Toronto, Canada",
      created_at: new Date(Date.now() - 11 * 86400000).toISOString(),
      photos: [],
      category: "instrument",
      type: "Grade Laser",
      condition: "Very Good",
      seller: "Great Lakes Instrument Co.",
      description: "Automatic self-leveling dual slope laser with HL760 digital readout receiver and wireless remote.",
      latitude: 43.6532,
      longitude: -79.3832,
      currency: "USD",
      listing_type: "hire",
      specs: ["Dual Slope Self-Leveling", "800m Operating Range", "Digital Fingerprint Pairing"],
    },
  ],
  professionals: [
    {
      id: "demo-prof-1",
      name: "Elena Rostova, PLS",
      rate: 120,
      rate_per: "hour",
      rating: 5.0,
      reviews: 24,
      skills: ["Geodetic Control", "Tunnel Deformation", "High-Precision GNSS"],
      location: "Vienna, Austria",
      created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      title: "Chief Geodetic Surveyor",
      discipline: "Geodetic Engineering",
      bio: "15+ years experience in high-precision geodetic control networks, deformation monitoring of dams and tunnels across Central Europe.",
      latitude: 48.2082,
      longitude: 16.3738,
      currency: "USD",
      is_verified: true,
      availability: "available",
      avatar_path: null,
      banner_path: null,
      certifications: ["Licensed Land Surveyor (PLS)", "FIG Commission 6"],
      experience: "15 years",
    },
    {
      id: "demo-prof-2",
      name: "Marcus Vance",
      rate: 140,
      rate_per: "hour",
      rating: 4.9,
      reviews: 19,
      skills: ["Multibeam Bathymetry", "Side-Scan Sonar", "Sub-Bottom Profiling"],
      location: "Singapore",
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      title: "Senior Hydrographic & Marine Surveyor",
      discipline: "Hydrographic Survey",
      bio: "Category A IHO/FIG/ICA certified hydrographer specializing in multibeam bathymetry, side-scan sonar, and sub-bottom port infrastructure profiling.",
      latitude: 1.3521,
      longitude: 103.8198,
      currency: "USD",
      is_verified: true,
      availability: "available",
      avatar_path: null,
      banner_path: null,
      certifications: ["IHO Cat A Hydrographer", "BOSIET Offshore"],
      experience: "12 years",
    },
    {
      id: "demo-prof-3",
      name: "Sarah Chen",
      rate: 95,
      rate_per: "hour",
      rating: 4.8,
      reviews: 31,
      skills: ["UAV Photogrammetry", "Airborne LiDAR", "DTM Extraction"],
      location: "Vancouver, Canada",
      created_at: new Date(Date.now() - 8 * 86400000).toISOString(),
      title: "UAV Aerial Photogrammetry Specialist",
      discipline: "Aerial Survey & LiDAR",
      bio: "Transport Canada Advanced Drone Operations certified. High-accuracy topographic point clouds and DTM extraction for civil infrastructure.",
      latitude: 49.2827,
      longitude: -123.1207,
      currency: "USD",
      is_verified: true,
      availability: "available",
      avatar_path: null,
      banner_path: null,
      certifications: ["BCLS Candidate", "Transport Canada Advanced RPAS"],
      experience: "8 years",
    },
    {
      id: "demo-prof-4",
      name: "Tendai Moyo",
      rate: 130,
      rate_per: "hour",
      rating: 5.0,
      reviews: 16,
      skills: ["Laser Scanning", "Stockpile Volumetrics", "Gyroscopic Alignment"],
      location: "Johannesburg, South Africa",
      created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
      title: "Mine Survey & Volumetrics Lead",
      discipline: "Mining & Volumetrics",
      bio: "Open-pit and underground mine surveying specialist with extensive experience in Laser scanning, stockpile inventory, and gyroscopic alignment.",
      latitude: -26.2041,
      longitude: 28.0473,
      currency: "USD",
      is_verified: true,
      availability: "available",
      avatar_path: null,
      banner_path: null,
      certifications: ["Mine Surveyor's Certificate of Competency", "PLATO"],
      experience: "14 years",
    },
  ],
  jobs: [
    {
      id: "demo-job-1",
      title: "High-Speed Rail Alignment & Topographic Survey",
      rate: 85,
      location: "Paris, France",
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      discipline: "Rail & Infrastructure",
      description: "Seeking a 2-person survey team for 40km rail corridor baseline leveling, control network densification, and clearance envelope verification.",
      latitude: 48.8566,
      longitude: 2.3522,
      currency: "USD",
      employment_type: "contract",
      rate_per: "hour",
      requirements: ['Robotic Total Station (1")', "Digital Level (0.3mm/km)"],
    },
    {
      id: "demo-job-2",
      title: "Offshore Wind Turbine Monopile As-Built Inspection",
      rate: 150,
      location: "Rotterdam, Netherlands",
      created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
      discipline: "Offshore Marine",
      description: "Dimensional control and laser scanning of newly installed monopile foundations in the North Sea. Offshore survivability certs required.",
      latitude: 51.9244,
      longitude: 4.4777,
      currency: "USD",
      employment_type: "contract",
      rate_per: "hour",
      requirements: ["GWO Offshore Safety", "Laser Tracker / Scanner Experience"],
    },
    {
      id: "demo-job-3",
      title: "Metropolitan SUE Level A Utility Investigation",
      rate: 115,
      location: "Chicago, Illinois, USA",
      created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
      discipline: "Subsurface Utility Engineering",
      description: "Subsurface utility engineering project combining electromagnetic pipe location, GPR grid scanning, and vacuum test hole verification.",
      latitude: 41.8781,
      longitude: -87.6298,
      currency: "USD",
      employment_type: "contract",
      rate_per: "hour",
      requirements: ["OSHA 10", "GPR Certified Operator"],
    },
  ],
  firms: [
    {
      id: "demo-firm-1",
      name: "Apex Geomatics International",
      location: "London, UK",
      created_at: new Date(Date.now() - 14 * 86400000).toISOString(),
      about: "Multidisciplinary land surveying and geodetic consultancy supporting major transport, commercial construction, and water infrastructure throughout the UK and Europe.",
      latitude: 51.5074,
      longitude: -0.1278,
      founded_year: 2004,
      staff_count: 48,
      verified: true,
      services: ["Cadastral", "Topographic", "BIM Laser Scanning", "Monitoring"],
    },
    {
      id: "demo-firm-2",
      name: "Meridian Survey & Engineering Ltd",
      location: "Auckland, New Zealand",
      created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
      about: "Premier land development consultants offering boundary definition, coastal bathymetric profiling, and precision machine control alignment.",
      latitude: -36.8485,
      longitude: 174.7633,
      founded_year: 2011,
      staff_count: 24,
      verified: true,
      services: ["Cadastral Subdivisions", "Hydrographic", "Civil Engineering"],
    },
    {
      id: "demo-firm-3",
      name: "Vanguard 3D Reality Capture",
      location: "Austin, Texas, USA",
      created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
      about: "State-of-the-art mobile mapping, airborne LiDAR, and scan-to-BIM modeling firm providing digital twins for industrial and infrastructure clients.",
      latitude: 30.2672,
      longitude: -97.7431,
      founded_year: 2018,
      staff_count: 16,
      verified: true,
      services: ["Mobile LiDAR", "Scan-to-BIM", "Industrial Metrology"],
    },
  ],
  events: [
    {
      id: "demo-event-1",
      title: "Advanced Terrestrial LiDAR & Scan-to-BIM Masterclass",
      starts_at: new Date(Date.now() + 14 * 86400000).toISOString(),
      price: 450,
      location: "Frankfurt, Germany",
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      kind: "Training",
      provider: "European Geospatial Academy",
      description: "Hands-on registration, noise filtering, point cloud meshing, and Revit IFC LOD 350 modeling workflow certification.",
      latitude: 50.1109,
      longitude: 8.6821,
      certification_body: "EGA Accredited",
      currency: "USD",
      ends_at: new Date(Date.now() + 16 * 86400000).toISOString(),
      seats_left: 8,
    },
    {
      id: "demo-event-2",
      title: "GNSS RTK & Network Rover Field Certification Workshop",
      starts_at: new Date(Date.now() + 21 * 86400000).toISOString(),
      price: 320,
      location: "Houston, Texas, USA",
      created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
      kind: "Workshop",
      provider: "Gulf Coast Survey Institute",
      description: "Multipath troubleshooting, coordinate transformation systems, and real-time kinematic boundary measurement techniques.",
      latitude: 29.7604,
      longitude: -95.3698,
      certification_body: "TSPS Approved PDH",
      currency: "USD",
      ends_at: new Date(Date.now() + 22 * 86400000).toISOString(),
      seats_left: 12,
    },
    {
      id: "demo-event-3",
      title: "UAV Surveying & Photogrammetric GCP Accuracy Seminar",
      starts_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      price: 500,
      location: "Melbourne, Australia",
      created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
      kind: "Seminar",
      provider: "Australasian Spatial Institute",
      description: "Setting and surveying ground control targets, camera calibration, rolling shutter compensation, and ASPRS vertical accuracy compliance.",
      latitude: -37.8136,
      longitude: 144.9631,
      certification_body: "SSSI CPD Points",
      currency: "USD",
      ends_at: new Date(Date.now() + 31 * 86400000).toISOString(),
      seats_left: 15,
    },
  ],
};

const FETCH_TIMEOUT_MS = 6_000;

export async function fetchMarketData(): Promise<MarketData> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const [listingsRes, professionalsRes, jobsRes, firmsRes, eventsRes] =
      await Promise.allSettled([
        supabase
          .from("public_market_listings")
          .select("*")
          .order("created_at", { ascending: false })
          .abortSignal(controller.signal),
        supabase
          .from("public_market_professionals")
          .select("*")
          .abortSignal(controller.signal),
        supabase
          .from("public_market_jobs")
          .select("*")
          .order("created_at", { ascending: false })
          .abortSignal(controller.signal),
        supabase
          .from("public_market_firms")
          .select("*")
          .order("created_at", { ascending: false })
          .abortSignal(controller.signal),
        supabase
          .from("public_market_events")
          .select("*")
          .order("starts_at", { ascending: true })
          .abortSignal(controller.signal),
      ]);

    const getRows = <T>(res: PromiseSettledResult<{ data: T[] | null; error: unknown }>): T[] => {
      if (res.status === "fulfilled" && !res.value.error && Array.isArray(res.value.data)) {
        return res.value.data;
      }
      return [];
    };

    const listings = toListingRows(getRows(listingsRes));
    const professionals = toProfessionalRows(getRows(professionalsRes));
    const jobs = toJobRows(getRows(jobsRes));
    const firms = toFirmRows(getRows(firmsRes));
    const events = toEventRows(getRows(eventsRes));

    if (
      listings.length > 0 ||
      professionals.length > 0 ||
      jobs.length > 0 ||
      firms.length > 0 ||
      events.length > 0
    ) {
      return {
        listings: listings.length > 0 ? listings : FALLBACK_MARKET_DATA.listings,
        professionals: professionals.length > 0 ? professionals : FALLBACK_MARKET_DATA.professionals,
        jobs: jobs.length > 0 ? jobs : FALLBACK_MARKET_DATA.jobs,
        firms: firms.length > 0 ? firms : FALLBACK_MARKET_DATA.firms,
        events: events.length > 0 ? events : FALLBACK_MARKET_DATA.events,
      };
    }
    return FALLBACK_MARKET_DATA;
  } catch (error) {
    console.warn("Using fallback market data due to fetch error:", error);
    return FALLBACK_MARKET_DATA;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function classifyFailure(error: unknown): LoadFailure {
  const aborted = error instanceof Error && error.name === "AbortError";
  const postgrestError = error as { code?: string; message?: string };
  return {
    reason: aborted ? "timeout" : "error",
    message: !aborted ? (postgrestError.message ?? "Unknown error") : "",
    missingRelation:
      !aborted &&
      (postgrestError.code === "42P01" ||
        postgrestError.code === "PGRST202" ||
        postgrestError.code === "PGRST205" ||
        /does not exist|schema cache|could not find/i.test(
          postgrestError.message ?? "",
        )),
  };
}

/** Live public-market feed with retry; safe to mount in several surfaces. */
export function useMarketFeed() {
  const [data, setData] = useState<MarketData | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    try {
      setData(await fetchMarketData());
      setFailure(null);
    } catch (error) {
      setFailure(classifyFailure(error));
    }
  }, []);

  useAsyncAction(load, [load, attempt]);

  // Reset to the loading state synchronously here (event handler, not render)
  // so the globe and registry show placeholders while refetching.
  const retry = useCallback(() => {
    setData(null);
    setFailure(null);
    setAttempt((value) => value + 1);
  }, []);

  return { data, failure, loading: data === null, retry };
}

const toSource = (
  row: {
    id: string;
    location: string;
    latitude: number | null;
    longitude: number | null;
  } & { name?: string | null; title?: string | null },
): MarketDotSource => ({
  id: row.id,
  name: row.name ?? row.title ?? "",
  location: row.location,
  latitude: row.latitude,
  longitude: row.longitude,
});

/** All published rows as globe pin groups (no scope filtering). */
export function marketGroupsFromData(data: MarketData): MarketDotGroup[] {
  return [
    { rows: data.listings.map(toSource), kind: "listing" as const },
    { rows: data.professionals.map(toSource), kind: "professional" as const },
    { rows: data.jobs.map(toSource), kind: "job" as const },
    { rows: data.firms.map(toSource), kind: "firm" as const },
    { rows: data.events.map(toSource), kind: "event" as const },
  ];
}
