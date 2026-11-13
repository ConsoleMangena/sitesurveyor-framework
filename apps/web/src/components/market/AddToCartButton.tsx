import { Check, LogIn, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { addToCart, removeFromCart, useIsInCart } from "../../features/market/cart.ts";
import { useAuthStore } from "../../lib/auth/auth-store.ts";
import { cn } from "../../lib/utils.ts";
import { Button } from "../ui/button.tsx";

/** The few listing fields the basket needs, from either market's row shape. */
export interface CartListing {
  id: string;
  name: string;
  price: number;
  currency: string | null;
  listingType: string | null;
  seller: string | null;
  location: string | null;
  sellerWorkspaceId: string | null;
}

/**
 * Add-to-cart toggle. Click propagation is stopped so it can sit inside the
 * clickable listing cards on the dashboard market.
 */
export function AddToCartButton({
  listing,
  className,
  size = "sm",
}: {
  listing: CartListing;
  className?: string;
  size?: "sm" | "default" | "icon";
}) {
  const inCart = useIsInCart(listing.id);
  const signedIn = useAuthStore((state) => state.user !== null);
  const navigate = useNavigate();

  return (
    <Button
      type="button"
      variant={inCart ? "secondary" : "outline"}
      size={size}
      className={cn("gap-1.5", className)}
      aria-label={
        signedIn
          ? inCart
            ? `Remove ${listing.name} from cart`
            : `Add ${listing.name} to cart`
          : `Sign in to buy ${listing.name}`
      }
      onClick={(event) => {
        event.stopPropagation();
        if (!signedIn) {
          navigate("/login", { state: { from: "/market" } });
          return;
        }
        if (inCart) {
          removeFromCart(listing.id);
          return;
        }
        addToCart({
          listingId: listing.id,
          name: listing.name,
          kind: listing.listingType === "hire" ? "hire" : "sale",
          price: listing.price,
          currency: listing.currency ?? "USD",
          seller: listing.seller ?? "",
          location: listing.location ?? "",
          sellerWorkspaceId: listing.sellerWorkspaceId,
        });
      }}
    >
      {!signedIn ? (
        <LogIn className="size-4" aria-hidden="true" />
      ) : inCart ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <ShoppingCart className="size-4" aria-hidden="true" />
      )}
      {!signedIn ? "Sign in to buy" : inCart ? "In cart" : "Add to cart"}
    </Button>
  );
}
