import type { VehicleTierId } from "../../lib/transportHire.ts";

/**
 * High-resolution placeholder photos for each vehicle tier.
 * Used when no custom vehicle photo is uploaded or available.
 */
export const VEHICLE_TIER_PLACEHOLDERS: Record<VehicleTierId, string> = {
  bakkie_4x4: "/images/transport/placeholders/bakkie-4x4.jpg",
  crew_van: "/images/transport/placeholders/crew-van.jpg",
  heavy_truck: "/images/transport/placeholders/heavy-truck.jpg",
  executive_suv: "/images/transport/placeholders/executive-suv.jpg",
  rapid_runner: "/images/transport/placeholders/rapid-runner.jpg",
};

/**
 * Returns a placeholder image for a vehicle based on its tier or model name.
 */
export function getVehiclePlaceholder(
  tierId?: VehicleTierId | string | null,
  model?: string | null,
): string {
  if (tierId && tierId in VEHICLE_TIER_PLACEHOLDERS) {
    return VEHICLE_TIER_PLACEHOLDERS[tierId as VehicleTierId];
  }

  const m = (model ?? "").toLowerCase();
  if (
    m.includes("van") ||
    m.includes("quantum") ||
    m.includes("hiace") ||
    m.includes("commuter") ||
    m.includes("nv350")
  ) {
    return VEHICLE_TIER_PLACEHOLDERS.crew_van;
  }
  if (
    m.includes("truck") ||
    m.includes("canter") ||
    m.includes("dropside") ||
    m.includes("isuzu npr") ||
    m.includes("flatbed") ||
    m.includes("fuso") ||
    m.includes("hino")
  ) {
    return VEHICLE_TIER_PLACEHOLDERS.heavy_truck;
  }
  if (
    m.includes("prado") ||
    m.includes("suv") ||
    m.includes("fortuner") ||
    m.includes("pajero")
  ) {
    return VEHICLE_TIER_PLACEHOLDERS.executive_suv;
  }
  if (
    m.includes("np200") ||
    m.includes("runner") ||
    m.includes("bantam") ||
    m.includes("half-ton") ||
    m.includes("courier")
  ) {
    return VEHICLE_TIER_PLACEHOLDERS.rapid_runner;
  }
  return VEHICLE_TIER_PLACEHOLDERS.bakkie_4x4;
}

