import { useState } from "react";
import type React from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, ShoppingCart, TriangleAlert, X } from "lucide-react";

import { cn } from "../../lib/utils.ts";
import { useAuthStore } from "../../lib/auth/auth-store.ts";
import {
  cartTotals,
  clearCart,
  removeFromCart,
  useCart,
  useCartCount,
  type CartItem,
} from "../../features/market/cart.ts";
import { checkoutCart, type CheckoutOutcome } from "../../features/market/checkout.ts";
import { Alert, AlertDescription } from "../ui/alert.tsx";
import { Badge } from "../ui/badge.tsx";
import { Button } from "../ui/button.tsx";
import { Label } from "../ui/label.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet.tsx";
import { Textarea } from "../ui/textarea.tsx";

export interface CartBuyer {
  workspaceId: string;
  name: string | null;
}

function price(item: CartItem): string {
  const amount = `${item.price.toLocaleString()} ${item.currency}`;
  return item.kind === "hire" ? `${amount} / day` : amount;
}

/** Header trigger for the basket, with a live item count. */
export function MarketCartButton({
  onClick,
  className,
  children,
}: {
  onClick: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const count = useCartCount();
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className={cn("gap-2", className)}
      aria-label={`Open cart, ${count} ${count === 1 ? "item" : "items"}`}
    >
      <ShoppingCart className="size-4" aria-hidden="true" />
      {children}
      {count > 0 ? (
        <span className="flex size-5 items-center justify-center rounded-full bg-primary font-mono text-[11px] font-semibold tabular-nums text-primary-foreground">
          {count}
        </span>
      ) : null}
    </Button>
  );
}

/**
 * The basket shared by the public market and the dashboard market. Checkout
 * sends one request per listing; money only moves after a seller accepts.
 */
export function MarketCartSheet({
  open,
  onOpenChange,
  buyer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buyer: CartBuyer | null;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-md flex-col gap-0 p-0 sm:max-w-md"
      >
        {/* Radix unmounts the content when closed, so a reopened cart starts
            from a clean note, outcome, and sending state. */}
        <CartSheetBody buyer={buyer} onClose={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function CartSheetBody({ buyer, onClose }: { buyer: CartBuyer | null; onClose: () => void }) {
  const items = useCart();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<CheckoutOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totals = cartTotals(items);

  const handleCheckout = async () => {
    if (!buyer || !useAuthStore.getState().user || items.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const result = await checkoutCart(items, {
        workspaceId: buyer.workspaceId,
        requesterName: buyer.name,
        message: note.trim() || null,
      });
      setOutcome(result);
      setNote("");
      if (result.failed.length === 0) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <SheetHeader className="space-y-1 border-b border-border/70 px-5 py-4 text-left">
        <SheetTitle className="flex items-center gap-2 text-base">
          <ShoppingCart className="size-4" aria-hidden="true" />
          Your cart
          {items.length > 0 ? (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          ) : null}
        </SheetTitle>
        <SheetDescription className="text-xs leading-5">
          Checkout sends a request to each seller. You pay only after a seller
          accepts.
        </SheetDescription>
      </SheetHeader>

      {outcome ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {outcome.sent.length > 0 ? (
            <Alert variant="success">
              <CheckCircle2 className="size-4" />
              <AlertDescription>
                {outcome.sent.length === 1
                  ? "Request sent. The seller has been notified."
                  : `${outcome.sent.length} requests sent. Each seller has been notified.`}
              </AlertDescription>
            </Alert>
          ) : null}
          {outcome.failed.map(({ item, message }) => (
            <Alert key={item.listingId} variant="destructive">
              <TriangleAlert className="size-4" />
              <AlertDescription>
                <span className="font-medium">{item.name}</span> — {message}
              </AlertDescription>
            </Alert>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            {outcome.failed.length > 0 ? (
              <Button variant="outline" onClick={() => setOutcome(null)}>
                Back to cart
              </Button>
            ) : null}
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span
            className="flex size-11 items-center justify-center rounded-xl border border-border/70 bg-muted/40 text-muted-foreground"
            aria-hidden="true"
          >
            <ShoppingCart className="size-5" />
          </span>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Your cart is empty</p>
            <p className="mx-auto max-w-[30ch] text-xs leading-5 text-muted-foreground">
              Add instruments and gear from the market, then send every request
              at once.
            </p>
          </div>
          <Button variant="outline" onClick={onClose}>
            Keep browsing
          </Button>
        </div>
      ) : (
        <>
          <ul className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto px-5">
            {items.map((item) => (
              <li key={item.listingId} className="flex gap-3 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.name}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={item.kind === "hire" ? "purple" : "outline"}>
                      {item.kind === "hire" ? "Hire" : "Sale"}
                    </Badge>
                    <span className="truncate text-xs text-muted-foreground">
                      {item.seller}
                      {item.location ? ` · ${item.location}` : ""}
                    </span>
                  </div>
                  <p className="font-mono text-xs tabular-nums text-foreground">
                    {price(item)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground"
                  aria-label={`Remove ${item.name} from cart`}
                  onClick={() => removeFromCart(item.listingId)}
                >
                  <X className="size-4" />
                </Button>
              </li>
            ))}
          </ul>

          <SheetFooter className="space-y-3 border-t border-border/70 px-5 py-4">
            {buyer ? (
              <div className="w-full space-y-1.5">
                <Label htmlFor="cart-note" className="text-xs">
                  Note to sellers (optional)
                </Label>
                <Textarea
                  id="cart-note"
                  rows={2}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Timeline, delivery location, or anything the seller should know…"
                  className="resize-none text-sm"
                />
              </div>
            ) : null}

            <dl className="w-full space-y-1.5 text-sm">
              {totals.map((total) => (
                <div
                  key={total.currency}
                  className="flex items-baseline justify-between gap-3"
                >
                  <dt className="text-xs text-muted-foreground">
                    {total.count} {total.count === 1 ? "item" : "items"} in{" "}
                    {total.currency}
                  </dt>
                  <dd className="font-mono font-semibold tabular-nums text-foreground">
                    {total.total.toLocaleString()} {total.currency}
                  </dd>
                </div>
              ))}
            </dl>

            {error ? (
              <Alert variant="destructive" className="w-full">
                <TriangleAlert className="size-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {buyer ? (
              <div className="flex w-full gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={sending}
                  onClick={clearCart}
                >
                  Empty cart
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={sending}
                  onClick={() => void handleCheckout()}
                >
                  {sending ? (
                    <>
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    `Send ${items.length} ${items.length === 1 ? "request" : "requests"}`
                  )}
                </Button>
              </div>
            ) : (
              <Button asChild className="w-full">
                <Link to="/login" state={{ from: "/market" }}>
                  Sign In <span className="hidden sm:inline">to send requests</span>
                </Link>
              </Button>
            )}
          </SheetFooter>
        </>
      )}
    </>
  );
}
