import { Check, ShoppingCart } from "lucide-react";

import { addToCart, removeFromCart, useIsInCart } from "../../features/market/cart.ts";
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

  return (
    <Button
      type="button"
      variant={inCart ? "secondary" : "outline"}
      size={size}
      className={cn("gap-1.5", className)}
      aria-label={
        inCart
          ? `Remove ${listing.name} from cart`
          : `Add ${listing.name} to cart`
      }
      onClick={(event) => {
        event.stopPropagation();
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
      {inCart ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <ShoppingCart className="size-4" aria-hidden="true" />
      )}
      {inCart ? "In cart" : "Add to cart"}
    </Button>
  );
}
