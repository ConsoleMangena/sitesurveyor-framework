import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, Ban, Loader2 } from "lucide-react";

import { supabase } from "../../lib/supabase/client.ts";
import type { Database } from "../../lib/supabase/types.ts";
import { useAuthStore } from "../../lib/auth/auth-store.ts";
import type { UiUser } from "../../features/workspace/types.ts";
import { portfolioMediaUrl } from "../../lib/repositories/portfolioMedia.ts";
import {
  createMarketplaceRequest,
  getMyRequestForListing,
  updateRequestStatus,
  type MarketplaceRequestRow,
} from "../../lib/repositories/marketplaceRequests.ts";
import { notifyMarketplaceRequest } from "../../lib/repositories/notificationEvents.ts";
import { cn } from "../../lib/utils.ts";
import { MARKET_DOT_COLORS } from "./marketDots.ts";
import type { MarketDot } from "./marketDots.ts";
import { toPortfolioItemRows } from "./marketFeed.ts";
import { ListingGallery } from "./ListingGallery.tsx";
import type {
  EventRow,
  FirmRow,
  JobRow,
  ListingRow,
  ProfessionalRow,
  ShowcaseItemRow,
} from "./marketFeed.ts";
import { Button } from "../ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog.tsx";
import { Input } from "../ui/input.tsx";
import { Label } from "../ui/label.tsx";
import { Textarea } from "../ui/textarea.tsx";
import { Badge } from "../ui/badge.tsx";

// Supabase types every view column nullable even where the underlying base
// columns are NOT NULL — normalize at the boundary.
type DbPortfolioItem =
  Database["public"]["Views"]["public_market_portfolio_items"]["Row"];

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Full market detail for one pin: reused by the public page and the
 *  in-app dashboard globe card. */
export function MarketDetailDialog({
  dot,
  listing,
  professional,
  job,
  firm,
  event,
  onClose,
  onOpenInApp,
  fullScreen = false,
  allowRequest = false,
}: {
  dot: MarketDot | null;
  listing: ListingRow | null;
  professional: ProfessionalRow | null;
  job: JobRow | null;
  firm: FirmRow | null;
  event: EventRow | null;
  onClose: () => void;
  /** When set, dialog is embedded in the signed-in dashboard; the action
   *  navigates to the matching workspace view instead of the login page.
   *  The second argument is the source pin's id so cross-links can deep-link
   *  to the exact record (e.g. a specific professional). */
  onOpenInApp?: (view: string, id?: string) => void;
  /** Renders a full-height, screen-fitting panel (shared layout with the
   *  workspace detail dialogs). The dashboard globe card stays compact. */
  fullScreen?: boolean;
  /** Enables the marketplace request flow inline, so signed-in visitors can
   *  request a listing without leaving the public market. */
  allowRequest?: boolean;
}) {
  const [showcase, setShowcase] = useState<ShowcaseItemRow[]>([]);
  const professionalId = professional?.id ?? null;
  const user = useAuthStore((s) => s.user);
  const signedIn = user !== null;

  // Lazy-load showcase projects only while a professional detail is open.
  useEffect(() => {
    if (!professionalId) return;
    let cancelled = false;
    const clear = window.setTimeout(() => setShowcase([]), 0);
    supabase
      .from("public_market_portfolio_items")
      .select("*")
      .eq("professional_id", professionalId)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        if (!cancelled)
          setShowcase(toPortfolioItemRows((data ?? []) as DbPortfolioItem[]));
      });
    return () => {
      cancelled = true;
      window.clearTimeout(clear);
    };
  }, [professionalId]);

  const subtitle = dot
    ? dot.kind === "listing"
      ? `Marketplace listing${dot.location ? ` · ${dot.location}` : ""}`
      : dot.kind === "professional"
        ? `Survey professional${dot.location ? ` · ${dot.location}` : ""}`
        : dot.kind === "job"
          ? `Job opening${dot.location ? ` · ${dot.location}` : ""}`
          : dot.kind === "firm"
            ? `Survey firm${dot.location ? ` · ${dot.location}` : ""}`
            : `Training & events${dot.location ? ` · ${dot.location}` : ""}`
    : "";

  return (
    <Dialog
      open={dot !== null}
      onOpenChange={(open) => (!open ? onClose() : undefined)}
    >
      <DialogContent
        disableAnimation={fullScreen}
        className={cn(
          fullScreen
            ? "flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)]! max-h-none! max-w-none! flex-col overflow-hidden! p-0"
            : "max-h-[85vh] overflow-y-auto sm:max-w-md",
        )}
      >
        {dot ? (
          <>
            <DialogHeader
              className={cn(
                "text-left",
                fullScreen && "shrink-0 space-y-2 border-b px-5 pt-5 pb-4",
              )}
            >
              <DialogTitle className="flex items-center gap-2.5 pr-6 text-lg">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: MARKET_DOT_COLORS[dot.kind] }}
                  aria-hidden="true"
                />
                {dot.name}
                {professional?.is_verified ? (
                  <BadgeCheck
                    className="size-4 shrink-0 text-cyan-600"
                    aria-label="Verified"
                  />
                ) : null}
              </DialogTitle>
              <DialogDescription>{subtitle}</DialogDescription>
            </DialogHeader>

            <div className={cn("min-h-0", fullScreen && "flex-1 overflow-y-auto px-5 py-4")}>
              {listing && (listing.photos?.length ?? 0) > 0 ? (
                <ListingGallery paths={listing.photos} />
              ) : null}
              <dl className="space-y-2.5 text-sm">
                {listing ? (
                  <>
                    <DetailRow label="Price">
                      <span className="font-semibold tabular-nums">
                        {listing.price.toLocaleString()} {listing.currency}
                        {listing.listing_type === "hire" ? " / day" : ""}
                      </span>
                    </DetailRow>
                    {listing.condition ? (
                      <DetailRow label="Condition">{listing.condition}</DetailRow>
                    ) : null}
                    <DetailRow label="Seller">{listing.seller}</DetailRow>
                    {listing.specs && listing.specs.length > 0 ? (
                      <DetailRow label="Specs">
                        <span>{listing.specs.join(" · ")}</span>
                      </DetailRow>
                    ) : null}
                    {listing.description ? (
                      <DetailRow label="Notes">{listing.description}</DetailRow>
                    ) : null}
                  </>
                ) : null}
                {professional ? (
                  <>
                    <DetailRow label="Role">
                      {professional.title} · {professional.discipline}
                    </DetailRow>
                    <DetailRow label="Rate">
                      <span className="font-semibold tabular-nums">
                        {professional.rate.toLocaleString()}{" "}
                        {professional.currency} / {professional.rate_per}
                      </span>
                    </DetailRow>
                    <DetailRow label="Experience">{professional.experience}</DetailRow>
                    <DetailRow label="Availability">{professional.availability}</DetailRow>
                    {professional.skills && professional.skills.length > 0 ? (
                      <DetailRow label="Skills">
                        <span>{professional.skills.join(" · ")}</span>
                      </DetailRow>
                    ) : null}
                    {professional.bio ? (
                      <DetailRow label="About">{professional.bio}</DetailRow>
                    ) : null}
                    {showcase.length > 0 ? (
                      <DetailRow label="Projects">
                        <div className="grid grid-cols-3 gap-1.5">
                          {showcase.map((item) => (
                            <img
                              key={item.id}
                              src={portfolioMediaUrl(item.image_path) ?? undefined}
                              alt={item.title}
                              loading="lazy"
                              className="aspect-square w-full rounded-md border object-cover"
                            />
                          ))}
                        </div>
                      </DetailRow>
                    ) : null}
                  </>
                ) : null}
                {job ? (
                  <>
                    <DetailRow label="Discipline">
                      {job.discipline} · <span className="capitalize">{job.employment_type}</span>
                    </DetailRow>
                    <DetailRow label="Pay">
                      {job.rate != null ? (
                        <span className="font-semibold tabular-nums">
                          {job.rate.toLocaleString()} {job.currency} /{" "}
                          {job.rate_per ?? "day"}
                        </span>
                      ) : (
                        "Negotiable"
                      )}
                    </DetailRow>
                    {job.requirements && job.requirements.length > 0 ? (
                      <DetailRow label="Requirements">
                        <ul className="list-disc space-y-0.5 pl-4">
                          {job.requirements.map((requirement) => (
                            <li key={requirement}>{requirement}</li>
                          ))}
                        </ul>
                      </DetailRow>
                    ) : null}
                    {job.description ? (
                      <DetailRow label="About">{job.description}</DetailRow>
                    ) : null}
                  </>
                ) : null}
                {firm ? (
                  <>
                    <DetailRow label="Services">
                      <span>{(firm.services ?? []).join(" · ")}</span>
                    </DetailRow>
                    {firm.staff_count != null || firm.founded_year != null ? (
                      <DetailRow label="Profile">
                        <span className="tabular-nums">
                          {firm.staff_count != null
                            ? `${firm.staff_count} staff`
                            : ""}
                          {firm.staff_count != null && firm.founded_year != null
                            ? " · "
                            : ""}
                          {firm.founded_year != null
                            ? `founded ${firm.founded_year}`
                            : ""}
                        </span>
                      </DetailRow>
                    ) : null}
                    {firm.about ? (
                      <DetailRow label="About">{firm.about}</DetailRow>
                    ) : null}
                  </>
                ) : null}
                {event ? (
                  <>
                    <DetailRow label="Schedule">
                      <span className="capitalize">
                        {formatDate(event.starts_at)}
                        {event.ends_at ? ` → ${formatDate(event.ends_at)}` : ""}
                      </span>
                    </DetailRow>
                    <DetailRow label="Price">
                      {event.price > 0 ? (
                        <span className="font-semibold tabular-nums">
                          {event.price.toLocaleString()} {event.currency}
                        </span>
                      ) : (
                        <span className="font-semibold uppercase tracking-wide text-emerald-700">
                          Free
                        </span>
                      )}
                    </DetailRow>
                    <DetailRow label="Provider">{event.provider}</DetailRow>
                    {event.certification_body ? (
                      <DetailRow label="Certification">
                        {event.certification_body}
                      </DetailRow>
                    ) : null}
                    {event.seats_left != null ? (
                      <DetailRow label="Seats left">
                        <span className="tabular-nums">{event.seats_left}</span>
                      </DetailRow>
                    ) : null}
                    {event.description ? (
                      <DetailRow label="About">{event.description}</DetailRow>
                    ) : null}
                  </>
                ) : null}
                {dot.lat != null && dot.lng != null ? (
                  <DetailRow label="Coordinates">
                    <span className="font-mono text-xs text-muted-foreground">
                      {dot.lat.toFixed(4)}°, {dot.lng.toFixed(4)}°
                    </span>
                  </DetailRow>
                ) : null}
              </dl>
              {!fullScreen ? (
                <div className="mt-2 space-y-2">{renderActions(dot)}</div>
              ) : null}
            </div>

            {fullScreen ? (
              <div className="shrink-0 border-t px-5 py-4">
                {renderActions(dot)}
              </div>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );

  function renderActions(activeDot: MarketDot) {
    if (allowRequest && activeDot.kind === "listing") {
      if (!signedIn) {
        return (
          <Button asChild className="w-full">
            <Link to="/login">
              {listing?.listing_type === "hire"
                ? "Sign in to request this equipment"
                : "Sign in to request this item"}
            </Link>
          </Button>
        );
      }
      if (!listing) return null;
      return <ListingRequestPanel key={listing.id} listing={listing} user={user} />;
    }
    if (onOpenInApp) {
      return (
        <Button
          className="w-full"
          onClick={() => onOpenInApp(inAppView(activeDot.kind), activeDot.id)}
        >
          {inAppLabel(activeDot.kind)}
        </Button>
      );
    }
    if (signedIn) {
      return (
        <Button asChild className="w-full">
          <Link to="/">Open your workspace</Link>
        </Button>
      );
    }
    return (
      <Button asChild className="w-full">
        <Link to="/login">{logInLabel(activeDot.kind)}</Link>
      </Button>
    );
  }
}

/** Inline "request to hire/purchase" flow for the public market. Keyed by
 *  listing id so all form state resets when another pin is opened. */
function ListingRequestPanel({
  listing,
  user,
}: {
  listing: ListingRow;
  user: UiUser;
}) {
  const [sellerWorkspaceId, setSellerWorkspaceId] = useState<string | null>(null);
  const [request, setRequest] = useState<MarketplaceRequestRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The public market view doesn't expose the owner workspace id, so read it
  // from the base table if policy allows (ownership + notification routing).
  // Also loads the user's request on this listing so the current status
  // (pending / accepted / declined / cancelled) is always visible.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("marketplace_listings")
      .select("workspace_id")
      .eq("id", listing.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setSellerWorkspaceId(data?.workspace_id ?? null);
      });
    void getMyRequestForListing(listing.id).then((myRequest) => {
      if (!cancelled) setRequest(myRequest);
    });
    return () => {
      cancelled = true;
    };
  }, [listing.id]);

  const isOwner =
    sellerWorkspaceId != null && user.workspaceId === sellerWorkspaceId;

  async function handleSubmit() {
    setSending(true);
    setError(null);
    try {
      const created = await createMarketplaceRequest({
        listingId: listing.id,
        requesterWorkspaceId: user.workspaceId,
        message: message.trim() || null,
        desiredStartDate: startDate || null,
        desiredEndDate: endDate || null,
      });
      setRequest(created);
      setFormOpen(false);
      if (sellerWorkspaceId) {
        void notifyMarketplaceRequest({
          sellerWorkspaceId,
          listingName: listing.name,
          requesterName: user.name,
          listingType: listing.listing_type ?? undefined,
        }).catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send request");
    } finally {
      setSending(false);
    }
  }

  async function handleCancel() {
    if (!request) return;
    setCancelling(true);
    setError(null);
    try {
      const updated = await updateRequestStatus(request.id, "cancelled");
      setRequest(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel request");
    } finally {
      setCancelling(false);
    }
  }

  const actionLabel =
    listing.listing_type === "hire" ? "Request to Hire" : "Request to Purchase";

  if (isOwner) {
    return (
      <p className="text-sm text-muted-foreground">
        This is a listing from your own workspace.
      </p>
    );
  }

  const requestForm = (
    <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
      <h4 className="text-sm font-semibold">{actionLabel}</h4>
      {listing.listing_type === "hire" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Start Date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">End Date</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      ) : null}
      <Textarea
        placeholder="Add a message to the seller (optional)..."
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setFormOpen(false)}>
          Cancel
        </Button>
        <Button size="sm" disabled={sending} onClick={handleSubmit}>
          {sending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...
            </>
          ) : (
            "Send Request"
          )}
        </Button>
      </div>
    </div>
  );

  // A request already exists — show its live status and allow follow-ups.
  if (request) {
    const declinedLike = request.status === "declined" || request.status === "cancelled";
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/40 p-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Your request</span>
              <Badge
                variant={
                  request.status === "accepted"
                    ? "success"
                    : declinedLike
                      ? "destructive"
                      : "default"
                }
              >
                {request.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {request.status === "pending"
                ? "Awaiting a response from the seller. You'll be notified when they reply."
                : request.status === "accepted"
                  ? "The seller accepted your request."
                  : request.status === "declined"
                    ? "The seller declined your request."
                    : "You cancelled this request."}
            </p>
            {(request.desired_start_date || request.desired_end_date) ? (
              <p className="text-xs text-muted-foreground">
                {request.desired_start_date && `From ${request.desired_start_date}`}
                {request.desired_start_date && request.desired_end_date && " · "}
                {request.desired_end_date && `Until ${request.desired_end_date}`}
              </p>
            ) : null}
            {request.message ? (
              <p className="text-sm text-muted-foreground">{request.message}</p>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          {request.status === "pending" ? (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={cancelling}
              onClick={handleCancel}
            >
              {cancelling ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <Ban className="mr-2 h-3 w-3" />
              )}
              Cancel
            </Button>
          ) : null}
        </div>
        {declinedLike ? (
          <>
            <Button className="w-full" onClick={() => setFormOpen((open) => !open)}>
              Send a new request
            </Button>
            {formOpen ? requestForm : null}
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button className="w-full" onClick={() => setFormOpen((open) => !open)}>
        {actionLabel}
      </Button>
      {formOpen ? requestForm : null}
    </div>
  );
}

function inAppView(kind: MarketDot["kind"]): string {
  return kind === "job" ? "jobs" : kind === "professional" ? "professionals" : "marketplace";
}

function inAppLabel(kind: MarketDot["kind"]): string {
  return kind === "job"
    ? "Open in Job Board"
    : kind === "professional"
      ? "Open in Hire Directory"
      : "Open in Marketplace";
}

function logInLabel(kind: MarketDot["kind"]): string {
  return kind === "job"
    ? "Sign in to apply"
    : kind === "event"
      ? "Sign in to register"
      : kind === "firm"
        ? "Sign in to request services"
        : "Sign in to contact the publisher";
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}