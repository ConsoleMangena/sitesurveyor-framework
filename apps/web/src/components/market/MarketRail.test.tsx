import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarketRail, { KindIcon, NewBadge } from "./MarketRail";
import type { MarketRailData, RailItem } from "./marketItems";

// marketItems → assetMediaUrl/portfolioMediaUrl → supabase client throws
// without env vars in tests; mirrors the marketItems.test.ts mock.
vi.mock("../../lib/supabase/client.ts", () => ({
  supabase: {
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://example.test/storage/v1/object/public/${bucket}/${path}`,
          },
        }),
      }),
    },
  },
  isOnline: () => true,
}));

afterEach(cleanup);

const item: RailItem = {
  kind: "listing",
  id: "l1",
  title: "Leica TS16",
  meta: "Total Station · Excellent",
  location: "Nairobi, Kenya",
  priceLabel: "4,200 USD",
  photoUrl: null,
  createdAt: new Date().toISOString(),
  lat: -1.29,
  lng: 36.82,
  rating: null,
  verified: false,
};

const rail: MarketRailData = {
  id: "gear",
  title: "Instruments & gear",
  accent: "#f59e0b",
  kinds: ["listing"],
  items: [item],
};

describe("MarketRail", () => {
  it("renders title, item title and price", () => {
    render(<MarketRail rail={rail} highlightedId={null} onSelect={() => {}} onSeeAll={() => {}} />);
    expect(screen.getByRole("heading", { name: /Instruments & gear/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Leica TS16/i })).toBeTruthy();
    expect(screen.getByText("4,200 USD")).toBeTruthy();
  });

  it("calls onSelect when a tile is clicked", async () => {
    const onSelect = vi.fn();
    render(<MarketRail rail={rail} highlightedId={null} onSelect={onSelect} onSeeAll={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /Leica TS16/i }));
    expect(onSelect).toHaveBeenCalledWith(item);
  });

  it("calls onSeeAll with the rail", async () => {
    const onSeeAll = vi.fn();
    render(<MarketRail rail={rail} highlightedId={null} onSelect={() => {}} onSeeAll={onSeeAll} />);
    await userEvent.click(screen.getByRole("button", { name: /See all/i }));
    expect(onSeeAll).toHaveBeenCalledWith(rail);
  });

  it("marks the highlighted tile with data-highlighted and carries the scroll-contract attribute", () => {
    render(<MarketRail rail={rail} highlightedId="l1" onSelect={() => {}} onSeeAll={() => {}} />);
    const tile = screen.getByTestId("market-tile-l1");
    expect(tile.getAttribute("data-highlighted")).toBe("true");
    // Task 7 scroll-into-view queries this exact "kind:id" format
    expect(tile.getAttribute("data-market-item")).toBe("listing:l1");
  });

  it("renders nothing when items are empty", () => {
    const { container } = render(
      <MarketRail rail={{ ...rail, items: [] }} highlightedId={null} onSelect={() => {}} onSeeAll={() => {}} />,
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("KindIcon / NewBadge", () => {
  it("renders a New pill and an svg icon", () => {
    render(<KindIcon kind="job" className="size-4" />);
    expect(screen.getByTestId("kind-icon-job").tagName).toBe("svg");
    render(<NewBadge />);
    expect(screen.getByText("New")).toBeTruthy();
  });
});
