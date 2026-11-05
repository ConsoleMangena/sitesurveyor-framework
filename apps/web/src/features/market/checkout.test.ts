import { beforeEach, describe, expect, it, vi } from "vitest";
import { addToCart, clearCart, getCart, type CartDraft } from "./cart";
import { checkoutCart } from "./checkout";

const createMarketplaceRequest = vi.hoisted(() => vi.fn());
const notifyMarketplaceRequest = vi.hoisted(() => vi.fn());
const supabaseFrom = vi.hoisted(() => vi.fn());

vi.mock("../../lib/repositories/marketplaceRequests.ts", () => ({
  createMarketplaceRequest,
}));
vi.mock("../../lib/repositories/notificationEvents.ts", () => ({
  notifyMarketplaceRequest,
}));
vi.mock("../../lib/supabase/client.ts", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => supabaseFrom(),
      }),
    }),
  },
}));

function draft(listingId: string, overrides: Partial<CartDraft> = {}): CartDraft {
  return {
    listingId,
    name: `Listing ${listingId}`,
    kind: "sale",
    price: 100,
    currency: "USD",
    seller: "Akina Survey",
    location: "Nairobi",
    sellerWorkspaceId: "seller-ws",
    ...overrides,
  };
}

const buyer = { workspaceId: "buyer-ws", requesterName: "Consolation" };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  clearCart();
  createMarketplaceRequest.mockResolvedValue({ id: "req" });
  notifyMarketplaceRequest.mockResolvedValue(undefined);
  supabaseFrom.mockResolvedValue({ data: [] });
});

describe("checkoutCart", () => {
  it("sends one request per basket item and empties those items", async () => {
    addToCart(draft("a"));
    addToCart(draft("b"));

    const outcome = await checkoutCart(getCart(), buyer);

    expect(outcome.failed).toEqual([]);
    expect(outcome.sent.map((item) => item.listingId)).toEqual(["a", "b"]);
    expect(createMarketplaceRequest).toHaveBeenCalledWith({
      listingId: "a",
      requesterWorkspaceId: "buyer-ws",
      message: null,
    });
    expect(getCart()).toEqual([]);
  });

  it("keeps the items that failed to send", async () => {
    addToCart(draft("a"));
    addToCart(draft("b"));
    createMarketplaceRequest
      .mockResolvedValueOnce({ id: "req" })
      .mockRejectedValueOnce(new Error("You already have a request on this listing."));

    const outcome = await checkoutCart(getCart(), buyer);

    expect(outcome.sent.map((item) => item.listingId)).toEqual(["a"]);
    expect(outcome.failed[0].item.listingId).toBe("b");
    expect(outcome.failed[0].message).toContain("already have a request");
    expect(getCart().map((item) => item.listingId)).toEqual(["b"]);
  });

  it("tells the seller even when a request fails, but only for sent ones", async () => {
    addToCart(draft("a"));
    addToCart(draft("b"));
    createMarketplaceRequest
      .mockResolvedValueOnce({ id: "req" })
      .mockRejectedValueOnce(new Error("offline"));

    await checkoutCart(getCart(), buyer);

    expect(notifyMarketplaceRequest).toHaveBeenCalledTimes(1);
    expect(notifyMarketplaceRequest).toHaveBeenCalledWith({
      sellerWorkspaceId: "seller-ws",
      listingName: "Listing a",
      requesterName: "Consolation",
      listingType: "sale",
    });
  });

  it("resolves the seller workspace the public view hides", async () => {
    supabaseFrom.mockResolvedValue({ data: [{ id: "a", workspace_id: "ws-from-db" }] });
    addToCart(draft("a", { sellerWorkspaceId: null }));

    await checkoutCart(getCart(), buyer);

    expect(supabaseFrom).toHaveBeenCalled();
    expect(notifyMarketplaceRequest).toHaveBeenCalledWith(
      expect.objectContaining({ sellerWorkspaceId: "ws-from-db" }),
    );
  });

  it("stays silent about payment — the request is only pending here", async () => {
    addToCart(draft("a"));

    const outcome = await checkoutCart(getCart(), buyer);

    expect(outcome.sent).toHaveLength(1);
    expect(createMarketplaceRequest).toHaveBeenCalledTimes(1);
  });
});
