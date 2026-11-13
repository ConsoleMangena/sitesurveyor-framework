import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarketResultGrid, { MarketResultsSkeleton } from "./MarketResultGrid";
import type { RailItem } from "./marketItems";
import { getKindPlaceholder } from "./marketPlaceholders";
import type { MarketDotKind } from "./marketDots";

// marketItems imports media repositories whose Supabase client needs env vars.
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

function makeItem(kind: MarketDotKind, id: string, overrides: Partial<RailItem> = {}): RailItem {
  return {
    kind,
    id,
    title: `${kind} ${id}`,
    meta: "Surveying · Available",
    location: "Nairobi, Kenya",
    priceLabel: "4,200 USD",
    photoUrl: null,
    createdAt: "2020-01-01T00:00:00.000Z",
    lat: -1.29,
    lng: 36.82,
    rating: null,
    verified: false,
    remote: false,
    saves: 0,
    ...overrides,
  };
}

const items = (["listing", "professional", "job", "firm", "event"] as const).map((kind) =>
  makeItem(kind, kind),
);

describe("MarketResultGrid", () => {
  it("renders every marketplace kind as a full-width grid card", () => {
    render(<MarketResultGrid items={items} highlighted={null} onSelect={() => {}} />);

    expect(screen.getByRole("list").className).toContain("grid-cols-1");
    expect(screen.getByRole("list").className).toContain("sm:grid-cols-2");
    expect(screen.getByRole("list").className).toContain("xl:grid-cols-3");
    for (const item of items) {
      const card = screen.getByTestId(`market-card-${item.id}`);
      expect(card.getAttribute("data-market-item")).toBe(`${item.kind}:${item.id}`);
      expect(card.className).toContain("w-full");
      expect(screen.getByTestId(`kind-icon-${item.kind}`)).toBeTruthy();
    }
  });

  it("highlights only the exact kind and id match", () => {
    const duplicateId = [
      makeItem("listing", "shared", { title: "Shared listing" }),
      makeItem("job", "shared", { title: "Shared job" }),
    ];
    render(
      <MarketResultGrid
        items={duplicateId}
        highlighted={{ kind: "job", id: "shared" }}
        onSelect={() => {}}
      />,
    );

    const listing = screen.getByRole("button", { name: /^Shared listing/ });
    const job = screen.getByRole("button", { name: /^Shared job/ });
    expect(listing.hasAttribute("data-highlighted")).toBe(false);
    expect(job.getAttribute("data-highlighted")).toBe("true");
  });

  it("passes the selected item to onSelect", async () => {
    const onSelect = vi.fn();
    render(<MarketResultGrid items={items} highlighted={null} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /^professional professional/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });

  it("includes sample content in the accessible card label", () => {
    const sample = makeItem("listing", "sample", {
      title: "Demo GNSS receiver",
      isSample: true,
    });
    render(<MarketResultGrid items={[sample]} highlighted={null} onSelect={() => {}} />);

    expect(
      screen.getByRole("button", {
        name: "Demo GNSS receiver, 4,200 USD, Nairobi, Kenya, sample content",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Sample")).toBeTruthy();
  });

  it("uses a category placeholder for missing and broken images", () => {
    const item = makeItem("job", "fallback", { title: "Field surveyor" });
    render(<MarketResultGrid items={[item]} highlighted={null} onSelect={() => {}} />);
    const image = screen.getByRole("presentation");
    const fallback = getKindPlaceholder(item.kind, item.meta);

    expect(image.getAttribute("src")).toBe(fallback);
    fireEvent.error(image);
    expect(image.getAttribute("src")).toBe(fallback);
  });

  it("exposes verified status and a formatted rating", () => {
    const item = makeItem("professional", "rated", {
      title: "Amina Surveyor",
      verified: true,
      rating: 4.75,
    });
    render(<MarketResultGrid items={[item]} highlighted={null} onSelect={() => {}} />);

    expect(screen.getByLabelText("Verified")).toBeTruthy();
    expect(screen.getByText("4.8")).toBeTruthy();
  });

  it("announces loading with six decorative skeleton cards", () => {
    const { container } = render(<MarketResultsSkeleton />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading marketplace results");
    expect(container.querySelectorAll("ul[aria-hidden='true'] li")).toHaveLength(6);
    expect(screen.queryByRole("listitem")).toBeNull();
  });
});
