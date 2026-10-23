import { describe, expect, it, vi } from "vitest";
import {
  buildRails,
  isNew,
  RAIL_CAP,
  toFirmItem,
  toJobItem,
  toListingItem,
  toProfessionalItem,
  toItem,
} from "./marketItems";
import type {
  EventRow,
  FirmRow,
  JobRow,
  ListingRow,
  MarketData,
  ProfessionalRow,
} from "./marketFeed";

// portfolioMediaUrl → supabase client throws without env vars in tests; the
// codebase pattern (session.test.ts, portfolio.test.ts) is to mock the client.
vi.mock("../../lib/supabase/client.ts", () => ({
  supabase: {
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://example.test/storage/v1/object/public/portfolio-media/${path}`,
          },
        }),
      }),
    },
  },
  isOnline: () => true,
}));

const listing: ListingRow = {
  id: "l1",
  name: "Leica TS16",
  type: "Total Station",
  condition: "Excellent",
  price: 4200,
  currency: "USD",
  seller: "SurveyPro",
  location: "Nairobi, Kenya",
  description: "",
  specs: [],
  listing_type: "sale",
  category: "instrument",
  latitude: -1.29,
  longitude: 36.82,
  created_at: new Date().toISOString(),
  photos: ["l1-1.jpg"],
};

const professional: ProfessionalRow = {
  id: "p1",
  name: "Amara Ochieng",
  title: "Geodesist",
  discipline: "Geodesy",
  bio: "",
  rate: 350,
  rate_per: "day",
  currency: "USD",
  rating: 4.9,
  reviews: 87,
  skills: [],
  experience: "12 yrs",
  is_verified: true,
  availability: null,
  certifications: [],
  avatar_path: null,
  banner_path: null,
  location: "Nairobi, Kenya",
  latitude: -1.29,
  longitude: 36.82,
  created_at: new Date(Date.now() - 60_000).toISOString(),
};

const job: JobRow = {
  id: "j1",
  title: "Cadastral Surveyor",
  discipline: "Cadastral",
  description: "",
  rate: 8000,
  currency: "USD",
  rate_per: "month",
  employment_type: "Contract",
  requirements: [],
  location: "Kigali, Rwanda",
  latitude: null,
  longitude: null,
  created_at: new Date(Date.now() - 86_400_000).toISOString(),
};

const firm: FirmRow = {
  id: "f1",
  name: "GeoField Surveys",
  about: "",
  services: ["Cadastral", "Topographic"],
  staff_count: 24,
  founded_year: 2011,
  verified: true,
  location: "Kigali, Rwanda",
  latitude: null,
  longitude: null,
  created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
};

const event: EventRow = {
  id: "e1",
  title: "GNSS Level 1",
  kind: "course",
  provider: "FIG",
  description: "",
  price: 0,
  currency: "USD",
  seats_left: 12,
  certification_body: null,
  ends_at: null,
  starts_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  location: "Nairobi, Kenya",
  latitude: null,
  longitude: null,
  created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
};

const data: MarketData = {
  listings: [listing],
  professionals: [professional],
  jobs: [job],
  firms: [firm],
  events: [event],
};

describe("isNew", () => {
  it("flags timestamps inside the 7-day window", () => {
    expect(isNew(new Date().toISOString())).toBe(true);
    expect(isNew(new Date(Date.now() - 8 * 86_400_000).toISOString())).toBe(false);
    expect(isNew(null)).toBe(false);
    expect(isNew("not-a-date")).toBe(false);
  });
});

describe("mappers", () => {
  it("maps a listing into a RailItem with photo + price label", () => {
    const item = toListingItem(listing);
    expect(item).toMatchObject({
      kind: "listing",
      id: "l1",
      title: "Leica TS16",
      location: "Nairobi, Kenya",
      lat: -1.29,
      lng: 36.82,
      priceLabel: "4,200 USD",
    });
    expect(item.photoUrl).toContain("l1-1.jpg");
    expect(item.meta).toContain("Total Station");
  });

  it("appends /day for hire listings", () => {
    const item = toListingItem({ ...listing, listing_type: "hire" });
    expect(item.priceLabel).toBe("4,200 USD/day");
  });

  it("maps a professional with rating + verified + avatar_path through portfolioMediaUrl", () => {
    const item = toProfessionalItem(professional);
    expect(item.kind).toBe("professional");
    expect(item.rating).toBe(4.9);
    expect(item.verified).toBe(true);
    expect(item.priceLabel).toBe("350 USD/day");
    expect(item.photoUrl).toBeNull(); // avatar_path null → portfolioMediaUrl(null)
  });

  it("maps a job without coords as Negotiable when rate is null", () => {
    const item = toJobItem({ ...job, rate: null as unknown as number });
    expect(item.priceLabel).toBe("Negotiable");
    expect(item.lat).toBeNull();
  });

  it("maps a firm to a services price label", () => {
    const item = toFirmItem(firm);
    expect(item.priceLabel).toBe("2 services");
    expect(item.verified).toBe(true);
  });

  it("dispatches through toItem", () => {
    expect(toItem("event", event).kind).toBe("event");
    expect(toItem("event", event).priceLabel).toBe("Free");
  });
});

describe("buildRails", () => {
  it("returns 6 rails in fixed order; fresh leads and caps at RAIL_CAP", () => {
    const rails = buildRails(data, "all", "all");
    expect(rails.map((r) => r.id)).toEqual([
      "fresh",
      "gear",
      "professionals",
      "jobs",
      "firms",
      "events",
    ]);
    expect(rails[0].items[0].id).toBe("l1"); // newest created_at wins
    const many = {
      ...data,
      listings: Array.from({ length: RAIL_CAP + 5 }, (_, i) => ({
        ...listing,
        id: `bulk-${i}`,
        created_at: new Date(Date.now() - i * 1000).toISOString(),
      })),
    };
    const fresh = buildRails(many, "all", "all")[0];
    expect(fresh.items.length).toBe(RAIL_CAP);
  });

  it("filters the gear rail by listingCategory", () => {
    const accessories = buildRails(
      { ...data, listings: [{ ...listing, category: "accessory" }] },
      "instrument",
      "all",
    );
    expect(accessories.find((r) => r.id === "gear")!.items).toHaveLength(0);

    const instruments = buildRails(data, "instrument", "all");
    expect(instruments.find((r) => r.id === "gear")!.items).toHaveLength(1);
  });

  it("scopes items to one kind when scope is not all", () => {
    const scoped = buildRails(data, "all", "job");
    for (const rail of scoped) {
      for (const item of rail.items) expect(item.kind).toBe("job");
    }
    // mixed rails that lose all items still appear (component hides empty)
    expect(scoped.find((r) => r.id === "gear")!.items).toHaveLength(0);
  });

  it("sorts professionals by rating and events by upcoming start", () => {
    const lowRated: ProfessionalRow = {
      ...professional,
      id: "p2",
      rating: 3.1,
      created_at: new Date(Date.now() - 1000).toISOString(),
    };
    const laterEvent: EventRow = {
      ...event,
      id: "e2",
      starts_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    };
    const rails = buildRails(
      { ...data, professionals: [professional, lowRated], events: [laterEvent, event] },
      "all",
      "all",
    );
    expect(rails.find((r) => r.id === "professionals")!.items.map((i) => i.id)).toEqual([
      "p1",
      "p2",
    ]);
    expect(rails.find((r) => r.id === "events")!.items.map((i) => i.id)).toEqual([
      "e1",
      "e2",
    ]);
  });
});
