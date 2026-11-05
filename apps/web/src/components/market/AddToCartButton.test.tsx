import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearCart, getCart } from "../../features/market/cart";
import { AddToCartButton, type CartListing } from "./AddToCartButton";

function listing(overrides: Partial<CartListing> = {}): CartListing {
  return {
    id: "l1",
    name: "Trimble S9 Total Station",
    price: 250,
    currency: "USD",
    listingType: "hire",
    seller: "Akina Survey",
    location: "Nairobi",
    sellerWorkspaceId: "ws-seller",
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  clearCart();
});

describe("AddToCartButton", () => {
  it("toggles the basket and its own label", () => {
    render(<AddToCartButton listing={listing()} />);

    const button = screen.getByRole("button", { name: "Add Trimble S9 Total Station to cart" });
    fireEvent.click(button);

    expect(getCart()).toHaveLength(1);
    expect(button.textContent).toContain("In cart");

    fireEvent.click(screen.getByRole("button", { name: "Remove Trimble S9 Total Station from cart" }));
    expect(getCart()).toHaveLength(0);
  });

  it("maps the listing into a hire basket row", () => {
    render(<AddToCartButton listing={listing()} />);
    fireEvent.click(screen.getByRole("button"));

    expect(getCart()[0]).toMatchObject({
      listingId: "l1",
      kind: "hire",
      price: 250,
      currency: "USD",
      sellerWorkspaceId: "ws-seller",
    });
  });

  it("defaults a missing currency and kind instead of inventing one", () => {
    render(<AddToCartButton listing={listing({ currency: null, listingType: null })} />);
    fireEvent.click(screen.getByRole("button"));

    expect(getCart()[0]).toMatchObject({ currency: "USD", kind: "sale" });
  });

  it("does not open the card it sits inside", () => {
    const onCardClick = vi.fn();
    render(
      <div onClick={onCardClick} role="presentation">
        <AddToCartButton listing={listing()} />
      </div>,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(onCardClick).not.toHaveBeenCalled();
    expect(getCart()).toHaveLength(1);
  });
});
