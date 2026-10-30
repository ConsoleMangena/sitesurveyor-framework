import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  Ban,
  Briefcase,
  Building2,
  Check,
  Copy,
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
          "web3-theme flex flex-col rounded-2xl sm:rounded-2xl border border-border/80 bg-background p-0 sm:p-0 shadow-2xl backdrop-blur-xl overflow-hidden gap-0 sm:gap-0",
          fullScreen
            ? "h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)]! max-h-none! max-w-none!"
            : "fixed inset-auto left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-xl md:max-w-2xl max-h-[88dvh] sm:max-h-[85dvh]"
        )}
      >
        {/* Top Accent Category Banner */}
        <div className={cn("relative shrink-0 border-b px-4 py-3.5 sm:px-6 sm:py-4 bg-gradient-to-b", theme.bannerBg, theme.border)}>
          <div className="flex items-center justify-between gap-2 pr-9 sm:pr-12">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 sm:px-3 sm:py-1 text-xs font-semibold", theme.badgeBg, theme.badgeText)}>
                <KindIcon className="size-3.5" aria-hidden="true" />
                {theme.label}
              </span>
              {dot.location ? (
                <span className="inline-flex min-w-0 items-center gap-1 text-[11px] sm:text-xs text-muted-foreground font-medium truncate">
                  <MapPin className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{dot.location}</span>
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {user ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn("size-7 sm:size-8 rounded-full transition-colors", favoriteId ? "text-rose-500 hover:text-rose-600" : "text-muted-foreground hover:text-foreground")}
                  onClick={toggleFavorite}
                  disabled={favoriteBusy}
                  aria-label={favoriteId ? "Remove favorite" : "Add favorite"}
                >
                  <Heart className="size-3.5 sm:size-4" fill={favoriteId ? "currentColor" : "none"} aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </div>

          <DialogHeader className="mt-2.5 sm:mt-3 text-left">
            <DialogTitle className="flex items-center gap-1.5 sm:gap-2 text-base sm:text-xl font-bold tracking-tight text-foreground leading-snug">
              <span className="line-clamp-2">{dot.name}</span>
              {professional?.is_verified || firm?.verified ? (
                <BadgeCheck className="size-4 sm:size-5 shrink-0 text-cyan-600" aria-label="Verified" />
              ) : null}
            </DialogTitle>
            <DialogDescription className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
              SiteSurveyor Verified Market Item · Real database coordinates
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto space-y-4 sm:space-y-5 px-4 py-3.5 sm:px-6 sm:py-5">
          {/* Price / Compensation Hero Card */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-4 rounded-xl border border-border/80 bg-muted/30 p-3 sm:p-4">
            <div>
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
              <div className="mt-0.5 sm:mt-1 flex items-baseline gap-2">
                {listing ? (
                  <span className="font-mono text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {listing.price.toLocaleString()}{" "}
                    <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                      {listing.currency}
                      {listing.listing_type === "hire" ? " / day" : ""}
                    </span>
                  </span>
                ) : professional ? (
                  <span className="font-mono text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {professional.rate.toLocaleString()}{" "}
                    <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                      {professional.currency} / {professional.rate_per}
                    </span>
                  </span>
                ) : job ? (
                  <span className="font-mono text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {job.rate != null ? (
                      <>
                        {job.rate.toLocaleString()}{" "}
                        <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                          {job.currency} / {job.rate_per ?? "day"}
                        </span>
                      </>
                    ) : (
                      "Negotiable"
                    )}
                  </span>
                ) : event ? (
                  <span className="font-mono text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {event.price > 0 ? (
                      <>
                        {event.price.toLocaleString()}{" "}
                        <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                          {event.currency}
                        </span>
                      </>
                    ) : (
                      <span className="text-emerald-600 font-semibold uppercase text-sm sm:text-base">Free Registration</span>
                    )}
                  </span>
                ) : firm ? (
                  <span className="text-base sm:text-lg font-bold text-foreground">
                    {firm.services?.length ?? 0} Core Services Offered
                  </span>
                ) : null}
              </div>
            </div>

            {/* Status Pills */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {listing?.condition ? (
                <span className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] sm:text-xs font-medium text-foreground">
                  Condition: {listing.condition}
                </span>
              ) : null}
              {listing?.listing_type ? (
                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[11px] sm:text-xs font-semibold capitalize text-amber-700">
                  {listing.listing_type}
                </span>
              ) : null}
              {professional?.availability ? (
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] sm:text-xs font-medium text-emerald-700">
                  {professional.availability}
                </span>
              ) : null}
              {professional?.rating != null && professional.rating > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] sm:text-xs font-semibold text-amber-700">
                  <Star className="size-3 fill-amber-500 text-amber-500" />
                  {professional.rating.toFixed(1)}
                </span>
              ) : null}
              {job?.employment_type ? (
                <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-0.5 text-[11px] sm:text-xs font-semibold capitalize text-violet-700">
                  {job.employment_type}
                </span>
              ) : null}
              {event?.seats_left != null ? (
                <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-0.5 text-[11px] sm:text-xs font-medium text-rose-700">
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
          <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3">
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
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Technical Specifications
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {listing.specs.map((spec) => (
                  <span
                    key={spec}
                    className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/40 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-medium text-foreground"
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
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Core Skills & Tools
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {professional.skills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 rounded-md border border-cyan-500/20 bg-cyan-500/5 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-medium text-cyan-800 dark:text-cyan-300"
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
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Job Requirements
              </h4>
              <ul className="space-y-1 rounded-lg sm:rounded-xl border border-border/70 bg-muted/20 p-3 text-xs text-foreground/90">
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
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Survey Services Offered
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {firm.services.map((svc) => (
                  <span
                    key={svc}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-medium text-emerald-800 dark:text-emerald-300"
                  >
                    {svc}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Description / About text */}
          {listing?.description || professional?.bio || job?.description || firm?.about || event?.description ? (
            <div className="rounded-lg sm:rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Overview & Details
              </h4>
              <p className="text-xs sm:text-sm leading-relaxed text-foreground/85 whitespace-pre-line">
                {listing?.description || professional?.bio || job?.description || firm?.about || event?.description}
              </p>
            </div>
          ) : null}

          {/* Showcase Projects (for Professionals) */}
          {showcase.length > 0 ? (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Recent Projects Portfolio
              </h4>
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                {showcase.map((item) => (
                  <div key={item.id} className="group relative overflow-hidden rounded-lg sm:rounded-xl border border-border bg-card">
                    <img
                      src={portfolioMediaUrl(item.image_path) ?? undefined}
                      alt={item.title}
                      loading="lazy"
                      className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="p-1.5 sm:p-2 text-center">
                      <p className="truncate text-[11px] sm:text-xs font-semibold text-foreground">{item.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* GPS Coordinates Readout Card */}
          {dot.lat != null && dot.lng != null ? (
            <div className="flex items-center justify-between rounded-lg sm:rounded-xl border border-border/80 bg-background p-2.5 sm:p-3 text-xs">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <MapPin className="size-3.5 sm:size-4 shrink-0 text-muted-foreground" />
                <span className="font-mono text-muted-foreground text-[11px] sm:text-xs truncate">
                  {dot.lat >= 0 ? "+" : ""}{dot.lat.toFixed(4)}°, {dot.lng >= 0 ? "+" : ""}{dot.lng.toFixed(4)}°
                </span>
              </div>
              <button
                type="button"
                onClick={copyCoordinates}
                className="inline-flex shrink-0 items-center gap-1 text-[11px] sm:text-xs font-medium text-foreground hover:text-primary transition-colors pl-2"
              >
                {coordsCopied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                <span>{coordsCopied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          ) : null}
        </div>

        {/* Action Footer */}
        <div className="shrink-0 border-t border-border/80 bg-muted/30 px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-3">
          {renderActions(dot)}
        </div>
      </DialogContent>
    </Dialog>
  );

  function renderActions(activeDot: MarketDot) {
    if (allowRequest && activeDot.kind === "listing") {
      if (!signedIn) {
        return (
          <DialogActionRow>
            <CloseAction onClose={onClose} />
            <Button asChild size="sm" className={primaryActionClass}>
              <Link to="/login">
                {listing?.listing_type === "hire"
                  ? "Sign In to Hire"
                  : "Sign In to Buy"}
              </Link>
            </Button>
          </DialogActionRow>
        );
      }
      if (!listing || !user) return null;
      return <ListingRequestPanel key={listing.id} listing={listing} user={user} onClose={onClose} />;
    }
    if (onOpenInApp) {
      return (
        <DialogActionRow>
          <CloseAction onClose={onClose} />
          <Button
            size="sm"
            className={primaryActionClass}
            onClick={() => onOpenInApp(inAppView(activeDot.kind), activeDot.id)}
          >
            {inAppLabel(activeDot.kind)}
          </Button>
        </DialogActionRow>
      );
    }
    if (signedIn) {
      return (
        <DialogActionRow>
          <CloseAction onClose={onClose} />
          <Button asChild size="sm" className={primaryActionClass}>
            <Link to="/">Open Workspace</Link>
          </Button>
        </DialogActionRow>
      );
    }
    return (
      <DialogActionRow>
        <CloseAction onClose={onClose} />
        <Button asChild size="sm" className={primaryActionClass}>
          <Link to="/login">{logInLabel(activeDot.kind)}</Link>
        </Button>
      </DialogActionRow>
    );
  }
}

/** Compact, right-aligned action row shared by every dialog footer state. */
function DialogActionRow({
  children,
  leading,
}: {
  children: React.ReactNode;
  leading?: React.ReactNode;
}) {
  return (
    <div className="flex w-full items-center justify-end gap-2">
      {leading ? <div className="mr-auto min-w-0">{leading}</div> : null}
      {children}
    </div>
  );
}

/** Quiet close affordance so primary actions stay the only filled button. */
function CloseAction({ onClose }: { onClose?: () => void }) {
  if (!onClose) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClose}
      className="h-8 shrink-0 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      Close
    </Button>
  );
}

const primaryActionClass =
  "h-8 max-w-[70%] shrink-0 px-3 text-xs font-medium bg-[var(--web3-brand,#d92d20)] text-white shadow-sm hover:bg-[var(--web3-brand-deep,#b42318)]";

function AttributeCard({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-lg sm:rounded-xl border border-border/70 bg-card p-2.5 sm:p-3">
      <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <p className="mt-0.5 line-clamp-1 text-xs sm:text-sm font-semibold text-foreground" title={value}>{value}</p>
    </div>
  );
}

/** Inline "request to hire/purchase" flow for the public market. */
function ListingRequestPanel({
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
  const actionLabel = isHire ? "Request Hire" : "Request Purchase";
  const isOwner = sellerWorkspaceId != null && user.workspaceId === sellerWorkspaceId;

  if (isOwner) {
    return (
      <DialogActionRow leading={<span className="text-xs text-muted-foreground">Listing from your workspace</span>}>
        <CloseAction onClose={onClose} />
      </DialogActionRow>
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
    <form onSubmit={handleSend} className="mt-2.5 space-y-3 rounded-xl border border-border bg-card p-3 text-left sm:p-4">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {actionLabel}
      </h4>
      {isHire ? (
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <Label htmlFor="start_date" className="text-xs">
              Start date
            </Label>
            <Input
              id="start_date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 h-8 text-xs"
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
              className="mt-1 h-8 text-xs"
            />
          </div>
        </div>
      ) : null}
      <div>
        <Label htmlFor="message" className="text-xs">
          Message for seller (optional)
        </Label>
        <Textarea
          id="message"
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe your project timeline, requirements, or delivery location…"
          className="mt-1 text-xs"
        />
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => setFormOpen(false)} className="h-8 px-2.5 text-xs font-medium text-muted-foreground">
          Cancel
        </Button>
        <Button type="submit" size="sm" className={primaryActionClass} disabled={sending}>
          {sending ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : null}
          Submit Request
        </Button>
      </div>
    </form>
  );

  if (request) {
    const declinedLike = request.status === "declined" || request.status === "cancelled";
    return (
      <div className="w-full space-y-2.5">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
          <div className="min-w-0 truncate text-xs">
            <span className="font-semibold text-foreground">Request: </span>
            <span className="capitalize text-muted-foreground">{request.status}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {request.status === "pending" ? (
              <Button size="sm" variant="outline" onClick={handleCancel} disabled={cancelling} className="h-7 px-2 text-xs">
                {cancelling ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Ban className="mr-1 size-3" />}
                Cancel
              </Button>
            ) : null}
            {onClose ? (
              <Button variant="ghost" size="sm" onClick={onClose} className="h-7 px-2 text-xs text-muted-foreground">
                Close
              </Button>
            ) : null}
          </div>
        </div>
        {declinedLike ? (
          <>
            <DialogActionRow>
              <Button size="sm" className={primaryActionClass} onClick={() => setFormOpen((open) => !open)}>
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
          onClick={() => setFormOpen((open) => !open)}
        >
          {actionLabel}
        </Button>
      </DialogActionRow>
      {formOpen ? requestForm : null}
    </div>
  );
}

function inAppView(kind: MarketDot["kind"]): string {
  return kind === "job" ? "jobs" : kind === "professional" ? "professionals" : "marketplace";
}

function inAppLabel(kind: MarketDot["kind"]): string {
  return kind === "job"
    ? "Open Job Board"
    : kind === "professional"
      ? "Open Directory"
      : "Open Marketplace";
}

function logInLabel(kind: MarketDot["kind"]): string {
  return kind === "job"
    ? "Sign In to Apply"
    : kind === "event"
      ? "Sign In to Register"
      : kind === "firm"
        ? "Sign In to Contact"
        : "Sign In to Inquire";
}