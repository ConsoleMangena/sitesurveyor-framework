import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import MineralsPanel from "./MineralsPanel.tsx";

const iron = {
  key: "iron_ore",
  name: "Iron ore",
  group: "Ferro-alloy",
  indicated: true,
  confidence: "High",
  areaTopDecile: 88.2,
  areaBand: "High",
  targetScore: 74.1,
  symbol: "Fe",
  color: "#d55e00",
  mapAreaKm2: 5.03,
  mapSharePct: 6.5,
};

const lithium = {
  key: "lithium",
  name: "Lithium (pegmatite)",
  group: "Battery",
  indicated: false,
  confidence: "Low",
  areaTopDecile: 41,
  areaBand: "Not indicated",
  targetScore: null,
  symbol: "Li",
  color: "#f0e442",
  mapAreaKm2: 0,
  mapSharePct: 0,
};

const diamond = {
  name: "Diamonds (kimberlite)",
  reason: "Pipes are below this pixel.",
  needs: "Airborne magnetics",
};

describe("MineralsPanel", () => {
  it("lists indicated mineral systems above the rest", () => {
    render(<MineralsPanel commodities={[lithium, iron]} unscreenable={[]} />);

    const names = screen.getAllByText(/Iron ore|Lithium \(pegmatite\)/);
    expect(names[0]).toHaveTextContent("Iron ore");
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("says which commodities this dataset cannot screen at all", () => {
    render(<MineralsPanel commodities={[iron]} unscreenable={[diamond]} />);

    expect(screen.getByText(/Not screened by this dataset \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("Diamonds (kimberlite)")).toBeInTheDocument();
    expect(screen.getByText(/Would need: Airborne magnetics/)).toBeInTheDocument();
  });

  it("renders nothing for a run that screened no commodities", () => {
    const { container } = render(<MineralsPanel commodities={[]} unscreenable={[diamond]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("prints the ground each system owns on the mineral map", () => {
    render(<MineralsPanel commodities={[iron, lithium]} unscreenable={[]} />);
    expect(screen.getByText(/owns 5\.03 km² on the map · 6\.5% of area/)).toBeInTheDocument();
    expect(screen.getByText(/never the strongest system on the map/)).toBeInTheDocument();
  });

  it("hides the map figures on results published before the dominant-mineral map", () => {
    const legacy = { ...iron, symbol: "", color: "", mapAreaKm2: null, mapSharePct: null };
    render(<MineralsPanel commodities={[legacy]} unscreenable={[]} />);
    expect(screen.queryByText(/on the map/)).not.toBeInTheDocument();
  });
});
