import { useEffect, useState } from "react";
import { Ban, CreditCard, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase/client.ts";
import type { UiUser } from "../../features/workspace/types.ts";
import {
  createMarketplaceRequest,
  getMyRequestForListing,
  updateRequestStatus,
  type MarketplaceRequestRow,
} from "../../lib/repositories/marketplaceRequests.ts";
import { notifyMarketplaceRequest } from "../../lib/repositories/notificationEvents.ts";
import { ListingPaymentPanel } from "./ListingPaymentPanel.tsx";
import FieldError from "@/components/errors/FieldError.tsx";
import type { ListingRow } from "./marketFeed.ts";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { Label } from "../ui/label.tsx";
import { Textarea } from "../ui/textarea.tsx";
import {
  CloseAction,
  DialogActionRow,
  primaryActionClass,
} from "./dialogActions.tsx";

/** Inline "request to hire/purchase" flow for the public market. */
export function ListingRequestPanel({
  listing,
  user,
  onClose,
}: {
  listing: ListingRow;
  user: UiUser;
  onClose?: () => void;
}) {
  const [sellerWorkspaceId, setSellerWorkspaceId] = useState<string | null>(null);
  const [request, setRequest] = useState<MarketplaceRequestRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("marketplace_listings")
      .select("workspace_id")
      .eq("id", listing.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setSellerWorkspaceId(data.workspace_id);
      });
    getMyRequestForListing(listing.id).then((existing) => {
      if (!cancelled) setRequest(existing);
    });
    return () => {
      cancelled = true;
    };
  }, [listing.id]);

  const isHire = listing.listing_type === "hire";
  const actionLabel = isHire ? "Request Hire" : "Request Purchase";
  const isOwner =
    sellerWorkspaceId != null && user.workspaceId === sellerWorkspaceId;
  const dateError =
    isHire && startDate && endDate && endDate < startDate
      ? "The end date must be on or after the start date."
      : null;

  const toggleForm = () => {
    setFormOpen((open) => !open);
    setAttempted(false);
    setError(null);
  };

  if (isOwner) {
    return (
      <DialogActionRow
        leading={
          <span className="text-xs text-muted-foreground">
            Listing from your workspace
          </span>
        }
      >
        <CloseAction onClose={onClose} />
      </DialogActionRow>
    );
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (dateError) return;
    if (!sellerWorkspaceId) {
      setError("Unable to find the owner of this listing.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const created = await createMarketplaceRequest({
        listingId: listing.id,
        requesterWorkspaceId: user.workspaceId,
        message: message.trim() || null,
        desiredStartDate: isHire && startDate ? startDate : null,
        desiredEndDate: isHire && endDate ? endDate : null,
      });
      setRequest(created);
      setFormOpen(false);
      void notifyMarketplaceRequest({
        sellerWorkspaceId,
        listingName: listing.name,
        requesterName: user.name,
        listingType: listing.listing_type ?? undefined,
      }).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send request.");
    } finally {
      setSending(false);
    }
  };

  const handleCancel = async () => {
    if (!request) return;
    setCancelling(true);
    try {
      const updated = await updateRequestStatus(request.id, "cancelled");
      setRequest(updated);
    } finally {
      setCancelling(false);
    }
  };

  const requestForm = (
    <form
      onSubmit={handleSend}
      className="mt-4 space-y-4 border-t border-border/80 pt-4 text-left"
      noValidate
    >
      <h4 className="text-sm font-semibold text-foreground">{actionLabel}</h4>
      {isHire ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="start_date" className="text-xs">
              Start date
            </Label>
            <Input
              id="start_date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1.5 h-10 bg-background text-sm"
              disabled={sending}
              aria-invalid={attempted && !!dateError}
            />
          </div>
          <div>
            <Label htmlFor="end_date" className="text-xs">
              End date
            </Label>
            <Input
              id="end_date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1.5 h-10 bg-background text-sm"
              disabled={sending}
              aria-invalid={attempted && !!dateError}
              aria-describedby={attempted && dateError ? "request-date-error" : undefined}
            />
            {attempted && dateError ? (
              <FieldError id="request-date-error" className="mt-1.5">
                {dateError}
              </FieldError>
            ) : null}
          </div>
        </div>
      ) : null}
      <div>
        <Label htmlFor="message" className="text-xs">
          Message for seller (optional)
        </Label>
        <Textarea
          id="message"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe your project timeline, requirements, or delivery location…"
          className="mt-1.5 bg-background text-sm leading-6"
          disabled={sending}
        />
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setFormOpen(false)}
          className="h-10 px-3 text-sm font-medium text-muted-foreground"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          className={primaryActionClass}
          disabled={sending}
        >
          {sending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
          Submit request
        </Button>
      </div>
    </form>
  );

  if (request) {
    const declinedLike =
      request.status === "declined" || request.status === "cancelled";
    return (
      <div className="w-full space-y-2.5">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
          <div className="min-w-0 truncate text-xs">
            <span className="font-semibold text-foreground">Request: </span>
            <span className="capitalize text-muted-foreground">
              {request.status}
            </span>
            {request.status === "accepted" ? (
              <span className="text-muted-foreground"> — you can pay now</span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {request.status === "pending" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancel}
                disabled={cancelling}
                className="h-9 px-3 text-xs"
              >
                {cancelling ? (
                  <Loader2 className="mr-1 size-3.5 animate-spin" />
                ) : (
                  <Ban className="mr-1 size-3.5" />
                )}
                Cancel
              </Button>
            ) : null}
            {request.status === "accepted" ? (
              <Button
                size="sm"
                onClick={() => setPayOpen((open) => !open)}
                className="h-9 px-3 text-xs"
              >
                <CreditCard className="mr-1 size-3.5" />
                {payOpen ? "Hide payment" : "Pay now"}
              </Button>
            ) : null}
            {onClose ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-9 px-3 text-xs text-muted-foreground"
              >
                Close
              </Button>
            ) : null}
          </div>
        </div>
        {payOpen && request.status === "accepted" ? (
          <ListingPaymentPanel
            listing={{
              id: listing.id,
              name: listing.name,
              price: listing.price,
              currency: listing.currency,
              listingType: listing.listing_type,
            }}
            buyerWorkspaceId={user.workspaceId}
            onPaid={() => setPayOpen(false)}
          />
        ) : null}
        {declinedLike ? (
          <>
            <DialogActionRow>
              <Button
                size="sm"
                className={primaryActionClass}
                onClick={toggleForm}
              >
                Send New Request
              </Button>
            </DialogActionRow>
            {formOpen ? requestForm : null}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="w-full space-y-2.5">
      <DialogActionRow>
        <CloseAction onClose={onClose} />
        <Button
          size="sm"
          className={primaryActionClass}
          onClick={toggleForm}
        >
          {actionLabel}
        </Button>
      </DialogActionRow>
      {formOpen ? requestForm : null}
    </div>
  );
}

