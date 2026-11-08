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
import {
  attachPaymentSignature,
  cancelPendingOrder,
  createMarketplaceOrder,
  resolveListingPayout,
  verifyMarketPayment,
} from "../../lib/repositories/marketplaceOrders.ts";

export interface PayableListing {
  id: string;
  name: string;
  price: number;
  currency: string | null;
  listingType: string | null;
}

/**
 * Payment for a listing whose request the seller has accepted.
 *
 * The order row is written *before* the wallet is asked to sign, so a closed
 * tab or a dropped connection cannot leave a buyer paid with nothing recorded.
 * The status is never set from here: the database marks the order `submitted`
 * when the signature lands, and only the server-side verifier can mark it
 * `completed` after checking the transaction on chain.
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
  const [receipt, setReceipt] = useState<{
    signature: string;
    orderId: string;
    confirmed: boolean;
    note: string | null;
  } | null>(null);

  const phantomWallet = usePhantomWallet();

  useEffect(() => {
    let cancelled = false;
    resolveListingPayout(listing.id)
      .then((payout) => {
        if (cancelled) return;
        setSeller({
          workspaceId: payout.workspaceId,
          walletAddress: payout.walletAddress,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not check the seller payout address.");
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

    // 1. Record the intent first. If the wallet never signs, the row survives
    //    as `cancelled` and the buyer has something to point at.
    let order: { id: string };
    try {
      order = await createMarketplaceOrder({
        listing_id: listing.id,
        listing_workspace_id: listingWorkspaceId,
        buyer_workspace_id: buyerWorkspaceId,
        amount: listing.price,
        currency: token,
        provider: "solana",
        payment_status: "pending",
        platform_fee_amount: 0,
        metadata: {
          listing_type: listing.listingType,
          token,
          seller_wallet_address: recipient,
        },
      });
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof Error
          ? err.message
          : "The order could not be recorded, so nothing was sent.",
      );
      return;
    }

    // 2. Sign and send.
    let signature: string;
    try {
      ({ signature } = await sendTokens({
        token,
        recipient,
        amount: listing.price,
      }));
    } catch (err) {
      await cancelPendingOrder(order.id).catch(() => {
        /* The order stays pending; the panel still reports the declined transfer. */
      });
      setBusy(false);
      setError(
        err instanceof Error ? err.message : "Payment failed. Please try again.",
      );
      return;
    }

    // 3. Attach the signature (status becomes `submitted`), then ask the
    //    server to confirm it on chain. Confirmation is not ours to claim.
    try {
      await attachPaymentSignature(order.id, signature);
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof Error
          ? `${err.message} Your transaction signature is ${signature} - keep it and contact support.`
          : `The transfer was sent but could not be recorded. Your signature is ${signature}.`,
      );
      return;
    }

    const verification = await verifyMarketPayment(order.id);
    setReceipt({
      signature,
      orderId: order.id,
      confirmed: verification.verified,
      note: verification.verified ? null : verification.reason,
    });
    setBusy(false);
    onPaid?.(order.id);
  }, [seller, token, listing, buyerWorkspaceId, onPaid]);

  return (
    <div className="w-full space-y-3 rounded-lg border border-border bg-muted/40 p-4">
      <h4 className="text-sm font-semibold text-foreground">
        Pay for {listing.name}
      </h4>

      {receipt ? (
        <Alert variant="success">
          <CheckCircle2 className="size-4" />
          <AlertDescription className="space-y-1">
            <p>
              {receipt.confirmed
                ? "Payment confirmed on chain."
                : "Payment sent. We are still confirming it on chain."}
            </p>
            {receipt.note ? (
              <p className="text-xs text-muted-foreground">{receipt.note}</p>
            ) : null}
            <a
              href={`https://explorer.solana.com/tx/${receipt.signature}?cluster=${SOLANA_CLUSTER}`}
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
