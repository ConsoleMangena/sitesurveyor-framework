import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  Ban,
  Briefcase,
  Building2,
  Calendar,
  Check,
  Copy,
  DollarSign,
  GraduationCap,
  HardHat,
  Heart,
  Loader2,
  MapPin,
  Sparkles,
  Star,
  Tag,
  UserRound,
} from "lucide-react";

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
import FieldError from "@/components/errors/FieldError.tsx";
import { MARKET_DOT_COLORS } from "./marketDots.ts";
import type { MarketDot } from "./marketDots.ts";
import { toPortfolioItemRows } from "./marketFeed.ts";
import { ListingGallery } from "./ListingGallery.tsx";
import { getMarketFavorite, addMarketFavorite, removeMarketFavorite } from "../../lib/repositories/marketPreferences.ts";
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

const KIND_THEMES: Record<
  MarketDot["kind"],
  {
    label: string;
    icon: typeof Briefcase;
    badgeBg: string;
    badgeText: string;
    border: string;
    bannerBg: string;
  }
> = {
  listing: {
    label: "Equipment Listing",
    icon: Briefcase,
    badgeBg: "bg-amber-500/10",
    badgeText: "text-amber-700 dark:text-amber-400",
    border: "border-amber-500/20",
    bannerBg: "from-amber-500/10 via-amber-500/5 to-transparent",
  },
  professional: {
    label: "Survey Professional",
    icon: UserRound,
    badgeBg: "bg-cyan-500/10",
    badgeText: "text-cyan-700 dark:text-cyan-400",
    border: "border-cyan-500/20",
    bannerBg: "from-cyan-500/10 via-cyan-500/5 to-transparent",
  },
  job: {
    label: "Job Opening",
    icon: HardHat,
    badgeBg: "bg-violet-500/10",
    badgeText: "text-violet-700 dark:text-violet-400",
    border: "border-violet-500/20",
    bannerBg: "from-violet-500/10 via-violet-500/5 to-transparent",
  },
  firm: {
    label: "Survey Firm",
    icon: Building2,
    badgeBg: "bg-emerald-500/10",
    badgeText: "text-emerald-700 dark:text-emerald-400",
    border: "border-emerald-500/20",
    bannerBg: "from-emerald-500/10 via-emerald-500/5 to-transparent",
  },
  event: {
    label: "Training & Event",
    icon: GraduationCap,
    badgeBg: "bg-rose-500/10",
    badgeText: "text-rose-700 dark:text-rose-400",
    border: "border-rose-500/20",
    bannerBg: "from-rose-500/10 via-rose-500/5 to-transparent",
  },
};

/** Full market detail dialog for map pins and registry items. */
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
  onOpenInApp?: (view: string, id?: string) => void;
  fullScreen?: boolean;
  allowRequest?: boolean;
}) {
  const [showcase, setShowcase] = useState<ShowcaseItemRow[]>([]);
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [coordsCopied, setCoordsCopied] = useState(false);
  const professionalId = professional?.id ?? null;
  const user = useAuthStore((s) => s.user);
  const signedIn = user !== null;

  useEffect(() => {
    let cancelled = false;
    if (!professionalId) {
      setShowcase([]);
      return;
    }
    supabase
      .from("public_market_portfolio_items")
      .select("*")
      .eq("professional_id", professionalId)
      .order("created_at", { ascending: false })
      .limit(6)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setShowcase(toPortfolioItemRows(data as unknown as DbPortfolioItem[]));
      });
    return () => {
      cancelled = true;
    };
  }, [professionalId]);

  useEffect(() => {
    let cancelled = false;
    if (!user || !dot) {
      setFavoriteId(null);
      return;
    }
    getMarketFavorite(dot.kind, dot.id).then((fav) => {
      if (!cancelled) setFavoriteId(fav?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [user, dot]);

  const toggleFavorite = async () => {
    if (!user || !dot || favoriteBusy) return;
    setFavoriteBusy(true);
    try {
      if (favoriteId) {
        await removeMarketFavorite(favoriteId);
        setFavoriteId(null);
      } else {
        const created = await addMarketFavorite(dot.kind, dot.id);
        if (created) setFavoriteId(created.id);
      }
    } finally {
      setFavoriteBusy(false);
    }
  };

  const copyCoordinates = () => {
    if (dot?.lat != null && dot?.lng != null) {
      navigator.clipboard.writeText(`${dot.lat.toFixed(6)}, ${dot.lng.toFixed(6)}`);
      setCoordsCopied(true);
      setTimeout(() => setCoordsCopied(false), 2000);
    }
  };

  if (!dot) return null;

  const theme = KIND_THEMES[dot.kind] ?? KIND_THEMES.listing;
  const KindIcon = theme.icon;

  return (
    <Dialog open={dot !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent
        disableAnimation={fullScreen}
        className={cn(
          "web3-theme rounded-2xl border border-border/80 bg-background p-0 shadow-2xl backdrop-blur-xl overflow-hidden",
          fullScreen
            ? "flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)]! max-h-none! max-w-none! flex-col"
            : "max-h-[90vh] overflow-y-auto sm:max-w-xl md:max-w-2xl"
        )}
      >
        {/* Top Accent Category Banner */}
        <div className={cn("relative border-b px-6 py-5 bg-gradient-to-b", theme.bannerBg, theme.border)}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", theme.badgeBg, theme.badgeText)}>
                <KindIcon className="size-3.5" aria-hidden="true" />
                {theme.label}
              </span>
              {dot.location ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium">
                  <MapPin className="size-3" aria-hidden="true" />
                  {dot.location}
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5 pr-6">
              {user ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn("size-8 rounded-full transition-colors", favoriteId ? "text-rose-500 hover:text-rose-600" : "text-muted-foreground hover:text-foreground")}
                  onClick={toggleFavorite}
                  disabled={favoriteBusy}
                  aria-label={favoriteId ? "Remove favorite" : "Add favorite"}
                >
                  <Heart className="size-4" fill={favoriteId ? "currentColor" : "none"} aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </div>

          <DialogHeader className="mt-3 text-left">
            <DialogTitle className="flex items-center gap-2 text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              <span>{dot.name}</span>
              {professional?.is_verified || firm?.verified ? (
                <BadgeCheck className="size-5 shrink-0 text-cyan-600" aria-label="Verified" />
              ) : null}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              SiteSurveyor Verified Market Registry Item · Coordinates available below
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Content Body */}
        <div className="space-y-6 px-6 py-5">
          {/* Price / Compensation Hero Card */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/80 bg-muted/30 p-4">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {dot.kind === "listing"
                  ? listing?.listing_type === "hire"
                    ? "Hire Rate"
                    : "Purchase Price"
                  : dot.kind === "professional"
                    ? "Day Rate / Hourly"
                    : dot.kind === "job"
                      ? "Offered Pay"
                      : dot.kind === "event"
                        ? "Registration Fee"
                        : "Firm Information"}
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                {listing ? (
                  <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                    {listing.price.toLocaleString()}{" "}
                    <span className="text-sm font-medium text-muted-foreground">
                      {listing.currency}
                      {listing.listing_type === "hire" ? " / day" : ""}
                    </span>
                  </span>
                ) : professional ? (
                  <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                    {professional.rate.toLocaleString()}{" "}
                    <span className="text-sm font-medium text-muted-foreground">
                      {professional.currency} / {professional.rate_per}
                    </span>
                  </span>
                ) : job ? (
                  <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                    {job.rate != null ? (
                      <>
                        {job.rate.toLocaleString()}{" "}
                        <span className="text-sm font-medium text-muted-foreground">
                          {job.currency} / {job.rate_per ?? "day"}
                        </span>
                      </>
                    ) : (
                      "Negotiable"
                    )}
                  </span>
                ) : event ? (
                  <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                    {event.price > 0 ? (
                      <>
                        {event.price.toLocaleString()}{" "}
                        <span className="text-sm font-medium text-muted-foreground">
                          {event.currency}
                        </span>
                      </>
                    ) : (
                      <span className="text-emerald-600 font-semibold uppercase">Free Registration</span>
                    )}
                  </span>
                ) : firm ? (
                  <span className="text-lg font-bold text-foreground">
                    {firm.services?.length ?? 0} Core Services Offered
                  </span>
                ) : null}
              </div>
            </div>

            {/* Status Pills */}
            <div className="flex flex-wrap items-center gap-2">
              {listing?.condition ? (
                <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground">
                  Condition: {listing.condition}
                </span>
              ) : null}
              {listing?.listing_type ? (
                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-semibold capitalize text-amber-700">
                  {listing.listing_type}
                </span>
              ) : null}
              {professional?.availability ? (
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700">
                  {professional.availability}
                </span>
              ) : null}
              {professional?.rating != null && professional.rating > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  <Star className="size-3 fill-amber-500 text-amber-500" />
                  {professional.rating.toFixed(1)}
                </span>
              ) : null}
              {job?.employment_type ? (
                <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-semibold capitalize text-violet-700">
                  {job.employment_type}
                </span>
              ) : null}
              {event?.seats_left != null ? (
                <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-700">
                  {event.seats_left} seats remaining
                </span>
              ) : null}
            </div>
          </div>

          {/* Listing Gallery (Photos) */}
          {listing && (listing.photos?.length ?? 0) > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border/80">
              <ListingGallery paths={listing.photos} />
            </div>
          ) : null}

          {/* Key Attribute Cards Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {listing ? (
              <>
                <AttributeCard label="Category" value={listing.category === "accessory" ? "Accessory" : listing.type} />
                <AttributeCard label="Seller" value={listing.seller} />
                <AttributeCard label="Location" value={listing.location} />
              </>
            ) : null}

            {professional ? (
              <>
                <AttributeCard label="Role / Title" value={professional.title} />
                <AttributeCard label="Discipline" value={professional.discipline} />
                <AttributeCard label="Experience" value={professional.experience} />
              </>
            ) : null}

            {job ? (
              <>
                <AttributeCard label="Discipline" value={job.discipline} />
                <AttributeCard label="Type" value={job.employment_type} />
                <AttributeCard label="Location" value={job.location} />
              </>
            ) : null}

            {firm ? (
              <>
                <AttributeCard label="Team Size" value={firm.staff_count != null ? `${firm.staff_count} Staff` : "—"} />
                <AttributeCard label="Established" value={firm.founded_year != null ? `Est. ${firm.founded_year}` : "—"} />
                <AttributeCard label="HQ Location" value={firm.location} />
              </>
            ) : null}

            {event ? (
              <>
                <AttributeCard label="Provider" value={event.provider} />
                <AttributeCard label="Date" value={formatDate(event.starts_at)} />
                <AttributeCard label="Certification" value={event.certification_body || "CPD Accredited"} />
              </>
            ) : null}
          </div>

          {/* Tags (Specs / Skills / Services / Requirements) */}
          {listing?.specs && listing.specs.length > 0 ? (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Technical Specifications
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {listing.specs.map((spec) => (
                  <span
                    key={spec}
                    className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground"
                  >
                    <Tag className="size-3 text-muted-foreground" />
                    {spec}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {professional?.skills && professional.skills.length > 0 ? (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Core Skills & Tools
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {professional.skills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-1 text-xs font-medium text-cyan-800 dark:text-cyan-300"
                  >
                    <Sparkles className="size-3 text-cyan-500" />
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {job?.requirements && job.requirements.length > 0 ? (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Job Requirements
              </h4>
              <ul className="space-y-1 rounded-xl border border-border/70 bg-muted/20 p-3.5 text-xs text-foreground/90">
                {job.requirements.map((req) => (
                  <li key={req} className="flex items-start gap-2">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-violet-600" />
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {firm?.services && firm.services.length > 0 ? (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Survey Services Offered
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {firm.services.map((svc) => (
                  <span
                    key={svc}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-300"
                  >
                    {svc}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Description / About text */}
          {listing?.description || professional?.bio || job?.description || firm?.about || event?.description ? (
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Overview & Details
              </h4>
              <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-line">
                {listing?.description || professional?.bio || job?.description || firm?.about || event?.description}
              </p>
            </div>
          ) : null}

          {/* Showcase Projects (for Professionals) */}
          {showcase.length > 0 ? (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
                Recent Projects Portfolio
              </h4>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-3">
                {showcase.map((item) => (
                  <div key={item.id} className="group relative overflow-hidden rounded-xl border border-border bg-card">
                    <img
                      src={portfolioMediaUrl(item.image_path) ?? undefined}
                      alt={item.title}
                      loading="lazy"
                      className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="p-2 text-center">
                      <p className="truncate text-xs font-semibold text-foreground">{item.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* GPS Coordinates Readout Card */}
          {dot.lat != null && dot.lng != null ? (
            <div className="flex items-center justify-between rounded-xl border border-border/80 bg-background p-3 text-xs">
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-muted-foreground" />
                <span className="font-mono text-muted-foreground">
                  {dot.lat >= 0 ? "+" : ""}{dot.lat.toFixed(4)}°, {dot.lng >= 0 ? "+" : ""}{dot.lng.toFixed(4)}°
                </span>
              </div>
              <button
                type="button"
                onClick={copyCoordinates}
                className="inline-flex items-center gap-1 font-medium text-xs text-foreground hover:text-primary transition-colors"
              >
                {coordsCopied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                {coordsCopied ? "Copied!" : "Copy Lat/Lng"}
              </button>
            </div>
          ) : null}
        </div>

        {/* Action Footer */}
        <div className="border-t border-border/80 bg-muted/20 px-6 py-4">
          {renderActions(dot)}
        </div>
      </DialogContent>
    </Dialog>
  );

  function renderActions(activeDot: MarketDot) {
    if (allowRequest && activeDot.kind === "listing") {
      if (!signedIn) {
        return (
          <Button asChild className="w-full web3-btn web3-btn-primary h-10">
            <Link to="/login">
              {listing?.listing_type === "hire"
                ? "Sign in to request this equipment"
                : "Sign in to purchase this item"}
            </Link>
          </Button>
        );
      }
      if (!listing || !user) return null;
      return <ListingRequestPanel key={listing.id} listing={listing} user={user} />;
    }
    if (onOpenInApp) {
      return (
        <Button
          className="w-full web3-btn web3-btn-primary h-10"
          onClick={() => onOpenInApp(inAppView(activeDot.kind), activeDot.id)}
        >
          {inAppLabel(activeDot.kind)}
        </Button>
      );
    }
    if (signedIn) {
      return (
        <Button asChild className="w-full web3-btn web3-btn-primary h-10">
          <Link to="/">Open in your workspace</Link>
        </Button>
      );
    }
    return (
      <Button asChild className="w-full web3-btn web3-btn-primary h-10">
        <Link to="/login">{logInLabel(activeDot.kind)}</Link>
      </Button>
    );
  }
}

function AttributeCard({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

/** Inline "request to hire/purchase" flow for the public market. */
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
  const actionLabel = isHire ? "Request to hire equipment" : "Request to purchase";
  const isOwner = sellerWorkspaceId != null && user.workspaceId === sellerWorkspaceId;

  if (isOwner) {
    return (
      <p className="text-sm text-muted-foreground">
        This is a listing from your own workspace.
      </p>
    );
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
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
        desiredStartDate: (isHire && startDate) ? startDate : null,
        desiredEndDate: (isHire && endDate) ? endDate : null,
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
    <form onSubmit={handleSend} className="mt-3 space-y-3 rounded-xl border border-border bg-card p-4 text-left">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {actionLabel}
      </h4>
      {isHire ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="start_date" className="text-xs">
              Start date
            </Label>
            <Input
              id="start_date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1"
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
              className="mt-1"
            />
          </div>
        </div>
      ) : null}
      <div>
        <Label htmlFor="message" className="text-xs">
          Message for the seller (optional)
        </Label>
        <Textarea
          id="message"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe your project timeline, requirements, or delivery location…"
          className="mt-1"
        />
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setFormOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" className="web3-btn web3-btn-primary" disabled={sending}>
          {sending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          Submit request
        </Button>
      </div>
    </form>
  );

  if (request) {
    const declinedLike = request.status === "declined" || request.status === "cancelled";
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
          <div className="text-xs">
            <span className="font-semibold text-foreground">Your Request: </span>
            <span className="capitalize text-muted-foreground">{request.status}</span>
          </div>
          {request.status === "pending" ? (
            <Button size="sm" variant="outline" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Ban className="mr-2 h-3 w-3" />}
              Cancel
            </Button>
          ) : null}
        </div>
        {declinedLike ? (
          <>
            <Button className="w-full web3-btn web3-btn-primary" onClick={() => setFormOpen((open) => !open)}>
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
      <Button className="w-full web3-btn web3-btn-primary" onClick={() => setFormOpen((open) => !open)}>
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