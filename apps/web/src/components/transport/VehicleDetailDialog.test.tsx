import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VehicleDetailDialog } from "./VehicleDetailDialog.tsx";
import type { FareBreakdown, HireVehicle, LocationCoordinate } from "../../lib/transportHire.ts";

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

const mockPickup: LocationCoordinate = {
  lat: -17.82922,
  lng: 31.05222,
  label: "Harare Survey Base",
};

const mockDropoff: LocationCoordinate = {
  lat: -20.14917,
  lng: 28.58333,
  label: "Bulawayo Regional Office",
};

describe("VehicleDetailDialog", () => {
  it("renders vehicle title, driver profile, specs, and fare breakdown", () => {
    const handleClose = vi.fn();
    const handleBookNow = vi.fn();
    const handleShowOnMap = vi.fn();

    render(
      <VehicleDetailDialog
        vehicle={mockVehicle}
        fareBreakdown={mockFareBreakdown}
        pickup={mockPickup}
        dropoff={mockDropoff}
        durationMinutes={310}
        isOpen={true}
        onClose={handleClose}
        onBookNow={handleBookNow}
        onShowOnMap={handleShowOnMap}
      />,
    );

    expect(screen.getByText("Toyota Hilux 2.8 GD-6 4x4 Raider")).toBeDefined();
    expect(screen.getByText("Tendai Moyo")).toBeDefined();
    expect(screen.getByText("Seating")).toBeDefined();
    expect(screen.getByText("Max Payload")).toBeDefined();
    expect(screen.getByText("8m ETA to pickup")).toBeDefined();
    expect(screen.getAllByText(/\$410\.15/i).length).toBeGreaterThan(0);
  });

  it("triggers onBookNow when book button is clicked", () => {
    const handleBookNow = vi.fn();

    render(
      <VehicleDetailDialog
        vehicle={mockVehicle}
        fareBreakdown={mockFareBreakdown}
        pickup={mockPickup}
        dropoff={mockDropoff}
        durationMinutes={310}
        isOpen={true}
        onClose={vi.fn()}
        onBookNow={handleBookNow}
        onShowOnMap={vi.fn()}
      />,
    );

    const bookButton = screen.getByRole("button", { name: /Hire this vehicle · \$410\.15/i });
    fireEvent.click(bookButton);
    expect(handleBookNow).toHaveBeenCalledWith(mockVehicle);
  });

  it("triggers onShowOnMap when show on map button is clicked", () => {
    const handleShowOnMap = vi.fn();

    render(
      <VehicleDetailDialog
        vehicle={mockVehicle}
        fareBreakdown={mockFareBreakdown}
        pickup={mockPickup}
        dropoff={mockDropoff}
        durationMinutes={310}
        isOpen={true}
        onClose={vi.fn()}
        onBookNow={vi.fn()}
        onShowOnMap={handleShowOnMap}
      />,
    );

    const mapButton = screen.getByRole("button", { name: /Show on map/i });
    fireEvent.click(mapButton);
    expect(handleShowOnMap).toHaveBeenCalledWith(mockVehicle);
  });
});
