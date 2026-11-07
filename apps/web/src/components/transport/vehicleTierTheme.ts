import {
  IconBolt,
  IconBus,
  IconCarSuv,
  IconTruck,
  IconTruckDelivery,
} from "@tabler/icons-react";
import type { VehicleTierId } from "../../lib/transportHire.ts";

export interface VehicleTierTheme {
  icon: typeof IconTruck;
  badgeBg: string;
  badgeText: string;
  border: string;
  bannerBg: string;
  /** Fixed ink for map pins and legends — they float over basemap imagery. */
  dot: string;
}

export const VEHICLE_TIER_THEME: Record<VehicleTierId, VehicleTierTheme> = {
  bakkie_4x4: {
    icon: IconTruck,
    badgeBg: "bg-primary/10",
    badgeText: "text-primary",
    border: "border-primary/20",
    bannerBg: "from-primary/10 via-primary/5 to-transparent",
    dot: "#d92d20",
  },
  crew_van: {
    icon: IconBus,
    badgeBg: "bg-info/10",
    badgeText: "text-info",
    border: "border-info/20",
    bannerBg: "from-info/10 via-info/5 to-transparent",
    dot: "#06b6d4",
  },
  heavy_truck: {
    icon: IconTruckDelivery,
    badgeBg: "bg-warning/10",
    badgeText: "text-warning",
    border: "border-warning/20",
    bannerBg: "from-warning/10 via-warning/5 to-transparent",
    dot: "#f59e0b",
  },
  executive_suv: {
    icon: IconCarSuv,
    badgeBg: "bg-accent-purple/10",
    badgeText: "text-accent-purple",
    border: "border-accent-purple/20",
    bannerBg: "from-accent-purple/10 via-accent-purple/5 to-transparent",
    dot: "#8b5cf6",
  },
  rapid_runner: {
    icon: IconBolt,
    badgeBg: "bg-success/10",
    badgeText: "text-success",
    border: "border-success/20",
    bannerBg: "from-success/10 via-success/5 to-transparent",
    dot: "#10b981",
  },
};