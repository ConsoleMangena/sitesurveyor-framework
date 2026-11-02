import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter, useSearchParams } from "react-router-dom";
import type { ReactNode } from "react";
import { useMarketFilters } from "./useMarketFilters.ts";
import type { MarketData } from "../components/market/marketFeed.ts";

const mockMarketData: MarketData = {
  listings: [
    {
      id: "l1",
      name: "Leica TS16 Total Station",
      type: "total_station",
      condition: "excellent",
      price: 8500,
      currency: "USD",
      seller: "Apex Survey",
      location: "Harare, Zimbabwe",
      description: "Robotic total station",
      specs: ["1 sec accuracy", "ATRplus"],
      listing_type: "sale",
      latitude: -17.8252,
      longitude: 31.0335,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      photos: [],
      saves: 12,
      category: "instrument",
      is_remote: false,
      country: "Zimbabwe",
      city: "Harare",
      is_verified: true,
      status: "available",
      quantity: 1,
      serial_number: "TS16-89412",
      manufacture_year: 2022,
      delivery: "Courier available",
      warranty_months: 6,
      available_from: null,
      available_to: null,
      negotiable: true,
      expires_at: null,
    },
  ],
  professionals: [],
  jobs: [],
  firms: [],
  events: [],
};

function createWrapper(initialEntries = ["/market"]) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>;
  };
}

describe("useMarketFilters", () => {
  it("initializes with default values when no URL params exist", () => {
    const { result } = renderHook(() => useMarketFilters(mockMarketData), {
      wrapper: createWrapper(["/market"]),
    });

    expect(result.current.search).toBe("");
    expect(result.current.scope).toBe("all");
    expect(result.current.sort).toBe("newest");
    expect(result.current.listingCategory).toBe("all");
    expect(result.current.country).toBe("");
    expect(result.current.remoteOnly).toBe(false);
    expect(result.current.flatMode).toBe(false);
  });

  it("initializes from URL search parameters", () => {
    const { result } = renderHook(() => useMarketFilters(mockMarketData), {
      wrapper: createWrapper([
        "/market?q=leica&scope=listing&sort=popular&cat=instrument&remote=1&country=Zimbabwe",
      ]),
    });

    expect(result.current.search).toBe("leica");
    expect(result.current.scope).toBe("listing");
    expect(result.current.sort).toBe("popular");
    expect(result.current.listingCategory).toBe("instrument");
    expect(result.current.remoteOnly).toBe(true);
    expect(result.current.country).toBe("Zimbabwe");
    expect(result.current.flatMode).toBe(true);
  });

  it("updates URL parameters when filter setters are called", () => {
    const { result } = renderHook(() => useMarketFilters(mockMarketData), {
      wrapper: createWrapper(["/market"]),
    });

    act(() => {
      result.current.setScope("listing");
    });
    expect(result.current.scope).toBe("listing");

    act(() => {
      result.current.setSort("popular");
    });
    expect(result.current.sort).toBe("popular");

    act(() => {
      result.current.setListingCategory("instrument");
    });
    expect(result.current.listingCategory).toBe("instrument");

    act(() => {
      result.current.setCountry("Zimbabwe");
    });
    expect(result.current.country).toBe("Zimbabwe");

    act(() => {
      result.current.setRemoteOnly(true);
    });
    expect(result.current.remoteOnly).toBe(true);
  });

  it("omits default values from URL parameters", () => {
    const { result } = renderHook(() => useMarketFilters(mockMarketData), {
      wrapper: createWrapper([
        "/market?scope=listing&sort=popular&cat=instrument&remote=1",
      ]),
    });

    expect(result.current.scope).toBe("listing");
    expect(result.current.sort).toBe("popular");

    act(() => {
      result.current.setScope("all");
    });
    expect(result.current.scope).toBe("all");

    act(() => {
      result.current.setSort("newest");
    });
    expect(result.current.sort).toBe("newest");

    act(() => {
      result.current.setListingCategory("all");
    });
    expect(result.current.listingCategory).toBe("all");

    act(() => {
      result.current.setRemoteOnly(false);
    });
    expect(result.current.remoteOnly).toBe(false);
  });

  it("clears all filters with resetAllFilters", () => {
    const { result } = renderHook(() => useMarketFilters(mockMarketData), {
      wrapper: createWrapper([
        "/market?q=total&scope=listing&sort=popular&cat=instrument&remote=1&country=Zimbabwe",
      ]),
    });

    expect(result.current.search).toBe("total");
    expect(result.current.scope).toBe("listing");

    act(() => {
      result.current.resetAllFilters();
    });

    expect(result.current.search).toBe("");
    expect(result.current.scope).toBe("all");
    expect(result.current.sort).toBe("newest");
    expect(result.current.listingCategory).toBe("all");
    expect(result.current.remoteOnly).toBe(false);
    expect(result.current.country).toBe("");
  });

  it("computes dots and cap indicators correctly", () => {
    const { result } = renderHook(() => useMarketFilters(mockMarketData), {
      wrapper: createWrapper(["/market"]),
    });

    expect(result.current.dots).toHaveLength(1);
    expect(result.current.totalPoints).toBe(1);
    expect(result.current.isCapped).toBe(false);
    expect(result.current.hiddenPointsCount).toBe(0);
  });
});
