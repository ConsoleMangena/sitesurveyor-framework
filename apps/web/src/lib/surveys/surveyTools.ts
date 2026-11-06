import type { SurveyCategory } from "../repositories/satelliteSurveys.ts";

export type ToolCategory =
  | "geophysical"
  | "optical_positioning"
  | "sampling_geology"
  | "hydrology_water"
  | "geotechnical_hazard"
  | "safety_ppe";

export const TOOL_CATEGORY_LABELS: Record<ToolCategory, string> = {
  geophysical: "Geophysical & Subsurface",
  optical_positioning: "Positioning & Geodesy",
  sampling_geology: "Geological & Soil Sampling",
  hydrology_water: "Hydrology & Water Quality",
  geotechnical_hazard: "Geotechnical & Monitoring",
  safety_ppe: "Field Safety & Communications",
};

export interface SurveyToolItem {
  id: string;
  name: string;
  category: ToolCategory;
  categoryLabel: string;
  description: string;
  purpose: string;
  requiredFor: (SurveyCategory | "all" | string)[];
  dataSourceTriggers?: string[];
  essential: boolean;
}

export const SURVEY_TOOL_CATALOG: SurveyToolItem[] = [
  // ── Groundwater / Borehole Siting (water) ───────────────────────────
  {
    id: "tool_terrameter",
    name: "Terrameter SAS 1000 / VES Resistivity Sounder",
    category: "geophysical",
    categoryLabel: TOOL_CATEGORY_LABELS.geophysical,
    description: "Multi-electrode apparent resistivity and IP sounding meter with Schlumberger / Wenner cable array.",
    purpose: "Pinpoints depth to water-bearing fractured bedrock and confirms aquifer horizons identified by Earth Observation lineaments.",
    requiredFor: ["water"],
    essential: true,
  },
  {
    id: "tool_em34",
    name: "Electromagnetic Terrain Conductivity Meter (EM34-3)",
    category: "geophysical",
    categoryLabel: TOOL_CATEGORY_LABELS.geophysical,
    description: "Dual-loop transmitter and receiver coils operating at variable inter-coil spacings (10m, 20m, 40m).",
    purpose: "Rapidly traverses ground to locate conductive fracture zones, weathered dykes, and fault contacts.",
    requiredFor: ["water"],
    essential: false,
  },
  {
    id: "tool_dipmeter",
    name: "Electric Contact Water Level Dip Meter (150m)",
    category: "hydrology_water",
    categoryLabel: TOOL_CATEGORY_LABELS.hydrology_water,
    description: "Graduated millimeter-marked polyethylene tape on reel with audible buzzer and LED indicator.",
    purpose: "Accurately measures static water depth in existing observation wells, test holes, and piezometers.",
    requiredFor: ["water"],
    essential: true,
  },
  {
    id: "tool_water_quality",
    name: "Multiparameter Water Quality Sonde (pH / EC / TDS / Salinity)",
    category: "hydrology_water",
    categoryLabel: TOOL_CATEGORY_LABELS.hydrology_water,
    description: "Rugged waterproof field probe with automatic temperature compensation and digital readout.",
    purpose: "Instantly checks mineral salinity, total dissolved solids, and chemical suitability of water yields.",
    requiredFor: ["water"],
    essential: true,
  },
  {
    id: "tool_water_bottles",
    name: "Sterilized Hydrochemical Sampling Kit (HDPE Bottles & Cooler)",
    category: "hydrology_water",
    categoryLabel: TOOL_CATEGORY_LABELS.hydrology_water,
    description: "Clean sample bottles with nitric acid preservatives and insulated thermal storage for laboratory submission.",
    purpose: "Preserves water samples for certified lab analysis of cation/anion balance, arsenic, nitrates, and fluoride.",
    requiredFor: ["water"],
    essential: false,
  },

  // ── Mineral Prospectivity & Gold (minerals) ────────────────────────
  {
    id: "tool_pxrf",
    name: "Portable XRF Analyzer (pXRF / Handheld Spectrometer)",
    category: "sampling_geology",
    categoryLabel: TOOL_CATEGORY_LABELS.sampling_geology,
    description: "Handheld energy-dispersive X-ray fluorescence analyzer with miniature X-ray tube and silicon drift detector.",
    purpose: "Immediate non-destructive multi-element screening for gold pathfinders (As, Sb, Cu, Pb, Zn, Bi, Fe) on outcrop surfaces.",
    requiredFor: ["minerals"],
    essential: true,
  },
  {
    id: "tool_mag_sus",
    name: "Magnetic Susceptibility Meter (KT-10 / Terraplus)",
    category: "geophysical",
    categoryLabel: TOOL_CATEGORY_LABELS.geophysical,
    description: "High-sensitivity sensor coil measuring true magnetic susceptibility and conductivity of rock samples.",
    purpose: "Identifies hydrothermal magnetite destruction zones, banded iron formations, and lithological contacts.",
    requiredFor: ["minerals"],
    essential: true,
  },
  {
    id: "tool_swir",
    name: "Short-Wave Infrared (SWIR) Field Spectrometer",
    category: "sampling_geology",
    categoryLabel: TOOL_CATEGORY_LABELS.sampling_geology,
    description: "Field-portable reflectance spectrometer (350–2500 nm range) with internal halogen light source.",
    purpose: "Validates satellite hydrothermal alteration mapping by identifying illite, alunite, kaolinite, and chlorite crystallinity.",
    requiredFor: ["minerals"],
    essential: false,
  },
  {
    id: "tool_rock_pick",
    name: "Estwing 22oz Geological Rock Pick & Chisel Kit",
    category: "sampling_geology",
    categoryLabel: TOOL_CATEGORY_LABELS.sampling_geology,
    description: "Solid forged steel pointed-tip rock hammer with shock reduction grip and cold chisels.",
    purpose: "Breaks fresh unweathered rock chip samples from hard outcrops, quartz veins, and shear zones.",
    requiredFor: ["minerals"],
    essential: true,
  },
  {
    id: "tool_hand_lens",
    name: "10x / 20x Hastings Triplet Hand Lens",
    category: "sampling_geology",
    categoryLabel: TOOL_CATEGORY_LABELS.sampling_geology,
    description: "Achromatic, aplanatic optical glass triplet loupe with distortion-free field of view.",
    purpose: "Detailed inspection of mineral grain boundaries, sulphide specks, crystal habits, and gossan textures.",
    requiredFor: ["minerals"],
    essential: true,
  },
  {
    id: "tool_sample_bags",
    name: "Barcoded Heavy-Duty Calico Bags & GPS Tagging Tags",
    category: "sampling_geology",
    categoryLabel: TOOL_CATEGORY_LABELS.sampling_geology,
    description: "Tear-resistant breathable woven cotton bags with unique sequential barcodes and cable ties.",
    purpose: "Organizes soil geochemistry, stream sediment, and rock chip samples with traceable chain of custody.",
    requiredFor: ["minerals"],
    essential: true,
  },
  {
    id: "tool_gold_pan",
    name: "14-inch Dual Riffle Gold Prospecting Pan",
    category: "sampling_geology",
    categoryLabel: TOOL_CATEGORY_LABELS.sampling_geology,
    description: "High-impact lightweight polymer pan with deep and micro-riffles for heavy mineral capture.",
    purpose: "Rapid panning of alluvial stream sediments and crushed vein quartz to verify coarse gold occurrence.",
    requiredFor: ["minerals"],
    essential: false,
  },

  // ── Soil & Land Capability (soil) ──────────────────────────────────
  {
    id: "tool_dutch_auger",
    name: "Dutch / Edelman Soil Auger (0–1.2m Depth Kit)",
    category: "sampling_geology",
    categoryLabel: TOOL_CATEGORY_LABELS.sampling_geology,
    description: "Forged carbon steel combination auger head with extension rods, bayonet couplings, and ergonomic T-handle.",
    purpose: "Extracts undisturbed continuous soil cores across A, B, and C horizons to inspect root depth and clay layering.",
    requiredFor: ["soil"],
    essential: true,
  },
  {
    id: "tool_munsell",
    name: "Munsell Soil Color Book (Standard 440-Color Chart)",
    category: "sampling_geology",
    categoryLabel: TOOL_CATEGORY_LABELS.sampling_geology,
    description: "Durable washable color chips organized by Hue, Value, and Chroma for standardized pedological classification.",
    purpose: "Diagnoses soil drainage state, mottling, oxidation-reduction conditions, and organic carbon richness.",
    requiredFor: ["soil"],
    essential: true,
  },
  {
    id: "tool_soil_ph_ec",
    name: "Direct-Soil Spear pH and Electrical Conductivity Probe",
    category: "sampling_geology",
    categoryLabel: TOOL_CATEGORY_LABELS.sampling_geology,
    description: "Conical spear-shaped glass bulb with junction designed for direct insertion into moist soil.",
    purpose: "Determines topsoil and subsoil pH acidity and salinity hazards without waiting for laboratory extraction.",
    requiredFor: ["soil"],
    essential: true,
  },
  {
    id: "tool_penetrometer",
    name: "Dial Cone Soil Penetrometer (Compaction Tester)",
    category: "sampling_geology",
    categoryLabel: TOOL_CATEGORY_LABELS.sampling_geology,
    description: "Liquid-filled pressure gauge (0–500 PSI) with 1/2-inch and 3/4-inch cones and graduated depth marks.",
    purpose: "Locates hardpans, tillage plow soles, and compaction zones restricting root penetration and water infiltration.",
    requiredFor: ["soil"],
    essential: false,
  },
  {
    id: "tool_ring_infiltrometer",
    name: "Double Ring Soil Infiltrometer & Stop Watch",
    category: "sampling_geology",
    categoryLabel: TOOL_CATEGORY_LABELS.sampling_geology,
    description: "Stainless steel inner (30cm) and outer (60cm) concentric rings with driving plate and depth scales.",
    purpose: "Measures saturated hydraulic conductivity (Ksat) and surface infiltration rate for irrigation design.",
    requiredFor: ["soil"],
    essential: false,
  },

  // ── Multi-Hazard & Site Safety (hazard) ─────────────────────────────
  {
    id: "tool_gpr",
    name: "Ground Penetrating Radar (GPR) 250/500 MHz Cart",
    category: "geotechnical_hazard",
    categoryLabel: TOOL_CATEGORY_LABELS.geotechnical_hazard,
    description: "Shielded dual-frequency antenna with integrated encoder wheel, GPS sync, and real-time radargram display.",
    purpose: "Detects subsurface sinkholes, karst dissolution voids, buried utilities, and slope failure shear surfaces.",
    requiredFor: ["hazard"],
    essential: true,
  },
  {
    id: "tool_schmidt",
    name: "Schmidt Concrete & Rock Rebound Hammer (Type N/L)",
    category: "geotechnical_hazard",
    categoryLabel: TOOL_CATEGORY_LABELS.geotechnical_hazard,
    description: "Precision spring-loaded impact plunger with calibrated rebound index chart for compressive strength.",
    purpose: "Quantifies rock mass weathering, hardness degradation, and slope face instability along roadcuts and cliffs.",
    requiredFor: ["hazard"],
    essential: true,
  },
  {
    id: "tool_rtk_drone",
    name: "Inspection Drone (UAV) with High-Res Optical & Thermal Sensor",
    category: "optical_positioning",
    categoryLabel: TOOL_CATEGORY_LABELS.optical_positioning,
    description: "Survey-grade quadcopter with RTK base station receiver, 20MP mechanical shutter, and radiometric thermal camera.",
    purpose: "Inspects inaccessible steep escarpments, active landslides, rockfall hazards, and flood plain boundaries safely.",
    requiredFor: ["hazard"],
    essential: true,
  },
  {
    id: "tool_inclinometer",
    name: "Digital Inclinometer System & Casing Guide",
    category: "geotechnical_hazard",
    categoryLabel: TOOL_CATEGORY_LABELS.geotechnical_hazard,
    description: "Biaxial servo-accelerometer probe with grooved casing reels for borehole deflection profiling.",
    purpose: "Monitors horizontal subsurface shear movements in active slopes and retaining structures.",
    requiredFor: ["hazard"],
    essential: false,
  },

  // ── General Surveying & Positioning (Topographical / Geodesy) ──────
  {
    id: "tool_gnss_rtk",
    name: "Multi-Constellation GNSS RTK Base & Rover (L1/L2/L5)",
    category: "optical_positioning",
    categoryLabel: TOOL_CATEGORY_LABELS.optical_positioning,
    description: "Dual-receiver system tracking GPS, GLONASS, Galileo and BeiDou with 1cm horizontal RTK accuracy.",
    purpose: "Ties field observations, sample points, and borehole collars to official national geodetic reference networks.",
    requiredFor: ["water", "minerals", "soil", "hazard", "Topographical", "Cadastral", "Engineering", "Mining", "all"],
    essential: true,
  },
  {
    id: "tool_brunton",
    name: "Brunton Geo Transit Pocket Compass & Clinometer",
    category: "sampling_geology",
    categoryLabel: TOOL_CATEGORY_LABELS.sampling_geology,
    description: "Precision azimuth compass with induction damping and 0–90° clinometer for strike and dip readings.",
    purpose: "Measures bedding planes, structural strike/dip, fault scarps, and terrain slope angles.",
    requiredFor: ["minerals", "hazard", "Topographical"],
    essential: true,
  },
  {
    id: "tool_total_station",
    name: "Robotic Total Station (1\" Angular Accuracy) & Prism Kit",
    category: "optical_positioning",
    categoryLabel: TOOL_CATEGORY_LABELS.optical_positioning,
    description: "Auto-tracking reflectorless total station with 360-degree prism, carbon fiber pole, and bipod.",
    purpose: "High-precision boundary demarcation, contouring, and structure monitoring where satellite view is obstructed.",
    requiredFor: ["Topographical", "Cadastral", "Engineering", "Mining"],
    essential: true,
  },
  {
    id: "tool_optical_level",
    name: "Digital Auto-Level & 5m Invar Barcode Staff",
    category: "optical_positioning",
    categoryLabel: TOOL_CATEGORY_LABELS.optical_positioning,
    description: "Electronic barcode leveling instrument with 0.3mm/km standard deviation.",
    purpose: "Establishes millimeter-accurate elevation benchmarks to calibrate Earth Observation DEM models.",
    requiredFor: ["Engineering", "Topographical"],
    essential: false,
  },

  // ── Data Source Triggered Equipment ────────────────────────────────
  {
    id: "tool_gcp_targets",
    name: "High-Contrast Ground Control Point (GCP) Aerial Targets (1m x 1m)",
    category: "optical_positioning",
    categoryLabel: TOOL_CATEGORY_LABELS.optical_positioning,
    description: "Weather-resistant UV-stabilized heavy vinyl mats with checkered high-contrast optical targets.",
    purpose: "Positions ground fiducial points visible in Sentinel-2 / Landsat imagery and drone survey flights.",
    requiredFor: ["all"],
    dataSourceTriggers: ["optical", "s2_l2a", "gm_s2_annual", "gm_ls8_ls9_annual"],
    essential: false,
  },
  {
    id: "tool_laser_rangefinder",
    name: "Laser Rangefinder & Inclinometer (TruePulse 360R)",
    category: "optical_positioning",
    categoryLabel: TOOL_CATEGORY_LABELS.optical_positioning,
    description: "Rugged waterproof pulse-laser distance and slope meter with heads-up optical display.",
    purpose: "Validates canopy heights, slope angles, and terrain elevation profiles against DEM models.",
    requiredFor: ["all"],
    dataSourceTriggers: ["dem", "dem_cop_30", "dem_srtm", "nasadem"],
    essential: false,
  },

  // ── Safety & Communication Gear (All Jobs) ─────────────────────────
  {
    id: "tool_ppe_kit",
    name: "Certified Survey PPE Kit (Hi-Vis Vest, Steel-Toe Boots, Hard Hat)",
    category: "safety_ppe",
    categoryLabel: TOOL_CATEGORY_LABELS.safety_ppe,
    description: "ANSI/ISEA compliant class 2/3 high-visibility vest, steel-toe puncture-resistant boots, and safety helmet.",
    purpose: "Protects personnel across road reserves, drilling rigs, active mines, and rugged terrain.",
    requiredFor: ["water", "minerals", "soil", "hazard", "Topographical", "Cadastral", "Engineering", "Mining", "all"],
    essential: true,
  },
  {
    id: "tool_satellite_messenger",
    name: "Global Satellite Communicator & SOS Beacon (Garmin inReach)",
    category: "safety_ppe",
    categoryLabel: TOOL_CATEGORY_LABELS.safety_ppe,
    description: "Iridium satellite network 2-way text messenger with interactive 24/7 SOS alert monitoring.",
    purpose: "Maintains emergency communication and crew tracking in remote off-grid bush areas with zero cellular reception.",
    requiredFor: ["water", "minerals", "soil", "hazard", "Topographical", "Cadastral", "Engineering", "Mining", "all"],
    essential: true,
  },
];

/**
 * Returns the recommended tools and equipment for a given survey domain and data configuration.
 */
export function getRequiredToolsForSurvey(
  surveyCategory: SurveyCategory | string,
  dataSources?: Record<string, string>,
): SurveyToolItem[] {
  const normCategory = surveyCategory.toLowerCase();

  return SURVEY_TOOL_CATALOG.filter((item) => {
    // 1. Matches survey category or all
    const matchesCategory =
      item.requiredFor.includes("all") ||
      item.requiredFor.some((req) => req.toLowerCase() === normCategory);

    // 2. Matches data source trigger if present
    let matchesTrigger = false;
    if (item.dataSourceTriggers && item.dataSourceTriggers.length > 0) {
      if (!dataSources) {
        matchesTrigger = true;
      } else {
        matchesTrigger = item.dataSourceTriggers.some((trigger) => {
          if (dataSources[trigger]) return true;
          return Object.values(dataSources).includes(trigger);
        });
      }
    }

    return matchesCategory || matchesTrigger;
  });
}

/**
 * Groups tools into ordered categories for clear display in UI kits.
 */
export function groupToolsByCategory(
  tools: SurveyToolItem[],
): { category: ToolCategory; label: string; tools: SurveyToolItem[] }[] {
  const categoriesOrdered: ToolCategory[] = [
    "geophysical",
    "sampling_geology",
    "hydrology_water",
    "geotechnical_hazard",
    "optical_positioning",
    "safety_ppe",
  ];

  const grouped: { category: ToolCategory; label: string; tools: SurveyToolItem[] }[] = [];

  for (const cat of categoriesOrdered) {
    const items = tools.filter((t) => t.category === cat);
    if (items.length > 0) {
      grouped.push({
        category: cat,
        label: TOOL_CATEGORY_LABELS[cat] ?? cat,
        tools: items,
      });
    }
  }

  return grouped;
}
