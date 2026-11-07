import { describe, expect, it } from "vitest";
import {
  getVehiclePlaceholder,
  VEHICLE_TIER_PLACEHOLDERS,
} from "./transportPlaceholders.ts";

describe("transportPlaceholders", () => {
  it("returns tier-specific placeholder paths for all 5 tiers", () => {
    expect(getVehiclePlaceholder("bakkie_4x4")).toBe(
      VEHICLE_TIER_PLACEHOLDERS.bakkie_4x4,
    );
    expect(getVehiclePlaceholder("crew_van")).toBe(
      VEHICLE_TIER_PLACEHOLDERS.crew_van,
    );
    expect(getVehiclePlaceholder("heavy_truck")).toBe(
      VEHICLE_TIER_PLACEHOLDERS.heavy_truck,
    );
    expect(getVehiclePlaceholder("executive_suv")).toBe(
      VEHICLE_TIER_PLACEHOLDERS.executive_suv,
    );
    expect(getVehiclePlaceholder("rapid_runner")).toBe(
      VEHICLE_TIER_PLACEHOLDERS.rapid_runner,
    );
  });

  it("infers placeholder from vehicle model when tierId is missing or unknown", () => {
    expect(getVehiclePlaceholder(null, "Toyota Quantum 2.5 D-4D")).toBe(
      VEHICLE_TIER_PLACEHOLDERS.crew_van,
    );
    expect(getVehiclePlaceholder(null, "Isuzu NPR 400 5-Ton Dropside")).toBe(
      VEHICLE_TIER_PLACEHOLDERS.heavy_truck,
    );
    expect(getVehiclePlaceholder(null, "Toyota Land Cruiser Prado TX-L")).toBe(
      VEHICLE_TIER_PLACEHOLDERS.executive_suv,
    );
    expect(getVehiclePlaceholder(null, "Nissan NP200 1.6 Half-Ton")).toBe(
      VEHICLE_TIER_PLACEHOLDERS.rapid_runner,
    );
  });

  it("defaults to bakkie_4x4 when both tierId and model are uninformative", () => {
    expect(getVehiclePlaceholder(null, null)).toBe(
      VEHICLE_TIER_PLACEHOLDERS.bakkie_4x4,
    );
  });
});

