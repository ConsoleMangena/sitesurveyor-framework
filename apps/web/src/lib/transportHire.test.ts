import { describe, expect, it } from "vitest";
import {
  calculateHireFare,
  calculateRoadDistanceKm,
  estimateDriveDurationMinutes,
  formatDriveDuration,
  generateBookingReference,
  generateFleetForLocation,
  REGIONAL_HUBS,
  VEHICLE_TIERS,
} from "./transportHire.ts";

describe("transportHire", () => {
  describe("calculateRoadDistanceKm", () => {
    it("returns 0 for identical coordinates", () => {
      const dist = calculateRoadDistanceKm(-17.8292, 31.0522, -17.8292, 31.0522);
      expect(dist).toBe(0);
    });

    it("calculates realistic Harare to Bulawayo highway distance (~430-460 km)", () => {
      const harare = REGIONAL_HUBS.find((h) => h.id === "hre-central")!;
      const bulawayo = REGIONAL_HUBS.find((h) => h.id === "byo-central")!;
      const dist = calculateRoadDistanceKm(
        harare.latitude,
        harare.longitude,
        bulawayo.latitude,
        bulawayo.longitude,
      );
      // Harare to Bulawayo road distance is ~439 km
      expect(dist).toBeGreaterThan(400);
      expect(dist).toBeLessThan(480);
    });

    it("calculates short inter-city distance for Gweru to Kwekwe (~60-70 km)", () => {
      const gweru = REGIONAL_HUBS.find((h) => h.id === "gwe-central")!;
      const kwekwe = REGIONAL_HUBS.find((h) => h.id === "kwe-central")!;
      const dist = calculateRoadDistanceKm(
        gweru.latitude,
        gweru.longitude,
        kwekwe.latitude,
        kwekwe.longitude,
      );
      expect(dist).toBeGreaterThan(50);
      expect(dist).toBeLessThan(80);
    });
  });

  describe("estimateDriveDurationMinutes & formatDriveDuration", () => {
    it("returns 0 for 0 km", () => {
      expect(estimateDriveDurationMinutes(0)).toBe(0);
      expect(formatDriveDuration(0)).toBe("0 mins");
    });

    it("formats short trips in minutes", () => {
      expect(formatDriveDuration(45)).toBe("45 mins");
    });

    it("formats long trips in hours and minutes", () => {
      expect(formatDriveDuration(265)).toBe("4h 25m");
      expect(formatDriveDuration(120)).toBe("2 hrs");
    });
  });

  describe("calculateHireFare (Uber-style dynamic distance pricing)", () => {
    it("charges base fare + distance * rate for 4x4 Bakkie", () => {
      const tier = VEHICLE_TIERS.bakkie_4x4;
      const distanceKm = 100;
      const breakdown = calculateHireFare(tier, distanceKm);

      // Base fare = 25, Rate = 0.85/km, Tolls for 100km = 2 toll passes * 2 = 4
      expect(breakdown.baseFare).toBe(25);
      expect(breakdown.distanceCost).toBe(85);
      expect(breakdown.ratePerKm).toBe(0.85);
      expect(breakdown.totalFare).toBe(25 + 85 + breakdown.tollAndRoadFee);
    });

    it("enforces minimum fare for short/zero distance", () => {
      const tier = VEHICLE_TIERS.heavy_truck;
      const breakdown = calculateHireFare(tier, 2);
      expect(breakdown.totalFare).toBeGreaterThanOrEqual(tier.minFare);
    });

    it("differentiates pricing across vehicle categories", () => {
      const dist = 200;
      const runnerFare = calculateHireFare(VEHICLE_TIERS.rapid_runner, dist);
      const bakkieFare = calculateHireFare(VEHICLE_TIERS.bakkie_4x4, dist);
      const vanFare = calculateHireFare(VEHICLE_TIERS.crew_van, dist);
      const truckFare = calculateHireFare(VEHICLE_TIERS.heavy_truck, dist);

      expect(runnerFare.totalFare).toBeLessThan(bakkieFare.totalFare);
      expect(bakkieFare.totalFare).toBeLessThan(vanFare.totalFare);
      expect(vanFare.totalFare).toBeLessThan(truckFare.totalFare);
    });
  });

  describe("generateFleetForLocation", () => {
    it("generates available vehicles positioned near the pickup hub", () => {
      const harare = REGIONAL_HUBS[0];
      const fleet = generateFleetForLocation(harare);

      expect(fleet.length).toBeGreaterThan(0);
      fleet.forEach((vehicle) => {
        expect(vehicle.driverName).toBeTruthy();
        expect(vehicle.licensePlate).toBeTruthy();
        expect(vehicle.driverRating).toBeGreaterThanOrEqual(4.5);
        expect(vehicle.etaMinutes).toBeGreaterThan(0);
        // Vehicle location is within reasonable distance from depot (~0.1 degrees)
        expect(Math.abs(vehicle.currentLat - harare.latitude)).toBeLessThan(0.15);
        expect(Math.abs(vehicle.currentLng - harare.longitude)).toBeLessThan(0.15);
      });
    });

    it("filters fleet when a tier filter is passed", () => {
      const harare = REGIONAL_HUBS[0];
      const vanFleet = generateFleetForLocation(harare, "crew_van");

      expect(vanFleet.length).toBeGreaterThan(0);
      vanFleet.forEach((v) => {
        expect(v.tierId).toBe("crew_van");
      });
    });
  });

  describe("generateBookingReference", () => {
    it("creates a standardized format reference code (SH-XXXX-XXX)", () => {
      const code1 = generateBookingReference();
      const code2 = generateBookingReference();

      expect(code1).toMatch(/^SH-[A-Z0-9]{4}-[A-Z0-9]{3}$/);
      expect(code2).toMatch(/^SH-[A-Z0-9]{4}-[A-Z0-9]{3}$/);
      expect(code1).not.toBe(code2);
    });
  });
});
