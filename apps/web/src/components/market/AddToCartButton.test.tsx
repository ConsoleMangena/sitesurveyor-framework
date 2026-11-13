import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearCart, getCart } from "../../features/market/cart";
import { useAuthStore } from "../../lib/auth/auth-store";
import { AddToCartButton, type CartListing } from "./AddToCartButton";

const navigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-router-dom")>(),
  useNavigate: () => navigate,
}));

function renderButton(listing: CartListing) {
  return render(<MemoryRouter><AddToCartButton listing={listing} /></MemoryRouter>);
}

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
  navigate.mockReset();
  useAuthStore.getState().setUser({
    id: "u1",
    workspaceId: "ws-buyer",
    name: "Test Buyer",
    email: "buyer@example.com",
    company: "Survey Co",
    accountType: "business",
    signupAccountType: "business",
    isPlatformAdmin: false,
  });
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

  it("requires sign-in and does not change the basket for visitors", () => {
    useAuthStore.getState().setUser(null);
    renderButton(listing());

    fireEvent.click(screen.getByRole("button", { name: "Sign in to buy Trimble S9 Total Station" }));

    expect(navigate).toHaveBeenCalledWith("/login", { state: { from: "/market" } });
    expect(getCart()).toHaveLength(0);
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
