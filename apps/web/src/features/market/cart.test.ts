import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addToCart,
  cartTotals,
  clearCart,
  getCart,
  isInCart,
  removeFromCart,
  removeManyFromCart,
  useCartCount,
  useIsInCart,
  type CartDraft,
} from "./cart";

const STORAGE_KEY = "sitesurveyor-market-cart";

function draft(listingId: string, overrides: Partial<CartDraft> = {}): CartDraft {
  return {
    listingId,
    name: `Listing ${listingId}`,
    kind: "sale",
    price: 100,
    currency: "USD",
    seller: "Akina Survey",
    location: "Nairobi",
    sellerWorkspaceId: null,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  clearCart();
});

describe("cart store", () => {
  it("adds a listing once and stamps it", () => {
    expect(addToCart(draft("a"))).toBe(true);
    expect(addToCart(draft("a", { price: 999 }))).toBe(false);

    const [item] = getCart();
    expect(item.price).toBe(100);
    expect(item.addedAt).not.toBe("");
    expect(isInCart("a")).toBe(true);
    expect(isInCart("b")).toBe(false);
  });

  it("persists the basket for the other market surface", () => {
    addToCart(draft("a"));
    addToCart(draft("b", { kind: "hire" }));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored.map((row: { listingId: string }) => row.listingId)).toEqual(["a", "b"]);
  });

  it("removes one, many, or all", () => {
    addToCart(draft("a"));
    addToCart(draft("b"));
    addToCart(draft("c"));

    removeFromCart("a");
    expect(getCart().map((item) => item.listingId)).toEqual(["b", "c"]);

    removeManyFromCart(["b", "missing"]);
    expect(getCart().map((item) => item.listingId)).toEqual(["c"]);

    clearCart();
    expect(getCart()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("[]");
  });

  it("subtotals per currency so a mixed basket stays payable", () => {
    addToCart(draft("a", { price: 120 }));
    addToCart(draft("b", { price: 30 }));
    addToCart(draft("c", { price: 45, currency: "ZWL" }));

    expect(cartTotals()).toEqual([
      { currency: "USD", total: 150, count: 2 },
      { currency: "ZWL", total: 45, count: 1 },
    ]);
  });

  it("drops stored rows that are not listings", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        draft("good"),
        { listingId: "no-name" },
        "not-an-object",
      ]),
    );
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));

    expect(getCart().map((item) => item.listingId)).toEqual(["good"]);

    addToCart(draft("fresh"));
    expect(getCart().map((item) => item.listingId)).toEqual(["good", "fresh"]);
  });

  it("starts empty when storage holds garbage", () => {
    addToCart(draft("a"));
    localStorage.setItem(STORAGE_KEY, "{oops");
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));

    expect(getCart()).toEqual([]);
  });

  it("picks up a basket changed in another tab", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ ...draft("remote"), addedAt: "" }]));
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));

    expect(isInCart("remote")).toBe(true);

    localStorage.setItem(STORAGE_KEY, "[]");
    window.dispatchEvent(new StorageEvent("storage", { key: "some-other-key" }));
    expect(isInCart("remote")).toBe(true);
  });

  it("notifies the hooks that drive the cart badge", () => {
    const count = renderHook(() => useCartCount());
    const inCart = renderHook(() => useIsInCart("a"));

    expect(count.result.current).toBe(0);
    expect(inCart.result.current).toBe(false);

    act(() => {
      addToCart(draft("a"));
    });

    expect(count.result.current).toBe(1);
    expect(inCart.result.current).toBe(true);

    act(() => {
      removeFromCart("a");
    });

    expect(count.result.current).toBe(0);
    expect(inCart.result.current).toBe(false);
  });
});
