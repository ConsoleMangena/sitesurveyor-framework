import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import FlatResultRow from "./FlatResultRow";
import type { RailItem } from "./marketItems";

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
  kind: "professional",
  id: "p1",
  title: "Amara Ochieng",
  meta: "Geodesist · Geodesy · 12 yrs",
  location: "Nairobi, Kenya",
  priceLabel: "350 USD/day",
  photoUrl: null,
  createdAt: new Date().toISOString(),
  lat: -1.29,
  lng: 36.82,
  rating: 4.9,
  verified: true,
};

describe("FlatResultRow", () => {
  it("renders title, meta, location and price", () => {
    render(
      <ul>
        <FlatResultRow item={item} highlighted={false} onOpen={() => {}} />
      </ul>,
    );
    expect(screen.getByRole("button", { name: /Amara Ochieng/i })).toBeTruthy();
    expect(screen.getByText("350 USD/day")).toBeTruthy();
    expect(screen.getByText(/Nairobi/)).toBeTruthy();
    expect(screen.getByText(/Geodesist/)).toBeTruthy();
    // Task 7 scroll-into-view queries this exact "kind:id" format
    expect(
      screen.getByRole("button", { name: /Amara Ochieng/i }).getAttribute("data-market-item"),
    ).toBe("professional:p1");
  });

  it("calls onOpen on click and Enter", async () => {
    const onOpen = vi.fn();
    render(
      <ul>
        <FlatResultRow item={item} highlighted={false} onOpen={onOpen} />
      </ul>,
    );
    const row = screen.getByRole("button", { name: /Amara Ochieng/i });
    await userEvent.click(row);
    expect(onOpen).toHaveBeenCalledTimes(1);
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("shows the New badge for fresh items and data-highlighted when flagged", () => {
    render(
      <ul>
        <FlatResultRow item={item} highlighted onOpen={() => {}} />
      </ul>,
    );
    expect(screen.getByText("New")).toBeTruthy();
    expect(screen.getByTestId("market-row-p1").getAttribute("data-highlighted")).toBe("true");
  });
});
