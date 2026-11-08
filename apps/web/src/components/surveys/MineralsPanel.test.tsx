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
    expect(
      screen.getByText(/That is not a judgement that they are absent/),
    ).toBeInTheDocument();
    expect(screen.getByText("Diamonds (kimberlite)")).toBeInTheDocument();
    expect(screen.getByText(/Would need: Airborne magnetics/)).toBeInTheDocument();
  });

  it("states the ceiling in the panel, not only in the report", () => {
    render(<MineralsPanel commodities={[iron]} unscreenable={[]} />);
    expect(screen.getByText(/not grade, not tonnage/i)).toBeInTheDocument();
  });

  it("renders nothing for a run that screened no commodities", () => {
    const { container } = render(<MineralsPanel commodities={[]} unscreenable={[diamond]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
