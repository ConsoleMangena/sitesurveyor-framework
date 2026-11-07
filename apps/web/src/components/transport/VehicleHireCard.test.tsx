import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VehicleHireCard } from "./VehicleHireCard.tsx";
import type { FareBreakdown, HireVehicle } from "../../lib/transportHire.ts";

const mockVehicle: HireVehicle = {
  id: "VEH-HRE-101",
  tierId: "bakkie_4x4",
  model: "Toyota Hilux 2.8 GD-6 4x4 Raider",
  licensePlate: "AFK-8921",
  driverName: "Tendai Moyo",
  driverRating: 4.98,
  completedTrips: 530,
  driverPhone: "+263 77 912 4040",
  currentLat: -17.829,
  currentLng: 31.052,
  etaMinutes: 8,
  status: "available",
  color: "Super White",
  features: ["4WD High & Low Range", "Steel Canopy", "Heavy Duty Roof Rack"],
};

const mockFareBreakdown: FareBreakdown = {
  currency: "USD",
  baseFare: 25.0,
  distanceKm: 439.0,
  ratePerKm: 0.85,
  distanceCost: 373.15,
  tollAndRoadFee: 12.0,
  totalFare: 410.15,
};

describe("VehicleHireCard", () => {
  it("renders model name, driver name, rating, and calculated total fare", () => {
    const handleSelect = vi.fn();
    render(
      <VehicleHireCard
        vehicle={mockVehicle}
        fareBreakdown={mockFareBreakdown}
        isSelected={false}
        onSelect={handleSelect}
      />,
    );

    expect(screen.getByText("Toyota Hilux 2.8 GD-6 4x4 Raider")).toBeDefined();
    expect(screen.getByText("AFK-8921")).toBeDefined();
    expect(screen.getByText("Tendai Moyo")).toBeDefined();
    expect(screen.getByText("$410.15")).toBeDefined();
    expect(screen.getByText("8m away")).toBeDefined();
  });

  it("calls onSelect when clicked", () => {
    const handleSelect = vi.fn();
    render(
      <VehicleHireCard
        vehicle={mockVehicle}
        fareBreakdown={mockFareBreakdown}
        isSelected={false}
        onSelect={handleSelect}
      />,
    );

    fireEvent.click(screen.getByText("Toyota Hilux 2.8 GD-6 4x4 Raider"));
    expect(handleSelect).toHaveBeenCalledWith(mockVehicle);
  });

  it("shows Selected badge when isSelected is true", () => {
    render(
      <VehicleHireCard
        vehicle={mockVehicle}
        fareBreakdown={mockFareBreakdown}
        isSelected={true}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Selected")).toBeDefined();
  });
});
