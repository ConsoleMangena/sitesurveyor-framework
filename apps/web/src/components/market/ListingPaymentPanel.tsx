import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { PublicKey } from "@solana/web3.js";

import FieldError from "../errors/FieldError.tsx";
import SelectDropdown from "../SelectDropdown.tsx";
import { Alert, AlertDescription } from "../ui/alert.tsx";
import { Button } from "../ui/button.tsx";
import { Label } from "../ui/label.tsx";
import { SOLANA_CLUSTER } from "../../features/phantom/lib/config.ts";
import { usePhantomWallet } from "../../features/phantom/hooks/usePhantomWallet.ts";
import { sendTokens } from "../../features/phantom/payments/phantomPay.ts";
import { supabase } from "../../lib/supabase/client.ts";
import { createMarketplaceOrder } from "../../lib/repositories/marketplaceOrders.ts";

export interface PayableListing {
  id: string;
  name: string;
  price: number;
  currency: string | null;
  listingType: string | null;
}

/**
 * Payment for a listing whose request the seller has accepted. The seller's
 * receiving wallet lives on the listing row, so it is read here rather than
 * requiring every caller to carry it.
 */
export function ListingPaymentPanel(props: {
  listing: PayableListing;
  buyerWorkspaceId: string;
  onPaid?: (orderId: string) => void;
}) {
  // A new listing starts a new payment: remounting clears the previous wallet
  // lookup, error, and success receipt rather than resetting them in an effect.
  return <PaymentForm key={props.listing.id} {...props} />;
}

function PaymentForm({
  listing,
  buyerWorkspaceId,
  onPaid,
}: {
  listing: PayableListing;
  buyerWorkspaceId: string;
  onPaid?: (orderId: string) => void;
}) {
  const [seller, setSeller] = useState<{
    workspaceId: string | null;
    walletAddress: string | null;
  } | null>(null);
  const [token, setToken] = useState<"SOL" | "USDC">("USDC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ signature: string; orderId: string } | null>(null);

  const phantomWallet = usePhantomWallet();

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("marketplace_listings")
      .select("workspace_id, seller_wallet_address")
      .eq("id", listing.id)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          setError(fetchError.message);
          return;
        }
        setSeller({
          workspaceId: data?.workspace_id ?? null,
          walletAddress: data?.seller_wallet_address ?? null,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [listing.id]);

  const pay = useCallback(async () => {
    const recipient = seller?.walletAddress;
    const listingWorkspaceId = seller?.workspaceId;
    if (!recipient) {
      setError("This listing has no Solana payment address yet.");
      return;
    }
    if (!listingWorkspaceId) {
      setError("This listing has no seller workspace to record the order against.");
      return;
    }
    try {
      new PublicKey(recipient);
    } catch {
      setError("The seller wallet address on this listing is invalid.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { signature } = await sendTokens({
        token,
        recipient,
        amount: listing.price,
      });
      const order = await createMarketplaceOrder({
        listing_id: listing.id,
        listing_workspace_id: listingWorkspaceId,
        buyer_workspace_id: buyerWorkspaceId,
        amount: listing.price,
        currency: token,
        provider: "solana",
        external_payment_ref: signature,
        payment_status: "completed",
        platform_fee_amount: 0,
        metadata: {
          listing_type: listing.listingType,
          token,
          seller_wallet_address: recipient,
        },
      });
      setSuccess({ signature, orderId: order.id });
      onPaid?.(order.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Payment failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [seller, token, listing, buyerWorkspaceId, onPaid]);

  return (
    <div className="w-full space-y-3 rounded-lg border border-border bg-muted/40 p-4">
      <h4 className="text-sm font-semibold text-foreground">
        Pay for {listing.name}
      </h4>

      {success ? (
        <Alert variant="success">
          <CheckCircle2 className="size-4" />
          <AlertDescription className="space-y-1">
            <p>Payment sent and order recorded.</p>
            <a
              href={`https://explorer.solana.com/tx/${success.signature}?cluster=${SOLANA_CLUSTER}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary underline"
            >
              View transaction on Solana Explorer
            </a>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Recipient wallet</Label>
            {seller?.walletAddress ? (
              <code className="block break-all rounded bg-background px-2 py-1 text-xs text-muted-foreground">
                {seller.walletAddress}
              </code>
            ) : (
              <p className="text-xs text-muted-foreground">
                {seller
                  ? "The seller has not added a Solana wallet to this listing."
                  : "Checking the seller wallet…"}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium text-foreground">
              {listing.price.toLocaleString()} {token}
              <span className="ml-1 text-xs text-muted-foreground">
                {listing.currency && listing.currency !== token
                  ? `listing priced ${listing.price.toLocaleString()} ${listing.currency}`
                  : ""}
              </span>
            </span>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Token</Label>
            <SelectDropdown
              options={[
                { value: "USDC", label: "USDC" },
                { value: "SOL", label: "SOL" },
              ]}
              value={token}
              onChange={(value) => setToken(value as "SOL" | "USDC")}
            />
          </div>

          {!phantomWallet.installed ? (
            <FieldError>
              Phantom wallet is not installed. Install the browser extension to
              pay.
            </FieldError>
          ) : phantomWallet.connected && phantomWallet.shortAddress ? (
            <p className="text-xs text-muted-foreground">
              Paying from{" "}
              <span className="font-mono">{phantomWallet.shortAddress}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Your Phantom wallet will ask you to connect when you confirm the
              payment.
            </p>
          )}

          {error ? <FieldError>{error}</FieldError> : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              className="h-10 px-4 text-sm font-semibold"
              disabled={busy || !phantomWallet.installed || !seller?.walletAddress}
              onClick={() => void pay()}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                  Sending…
                </>
              ) : (
                `Pay ${listing.price.toLocaleString()} ${token}`
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
