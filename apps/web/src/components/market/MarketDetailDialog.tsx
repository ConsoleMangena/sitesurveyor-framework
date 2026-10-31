import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  BadgeCheck,
  Ban,
  Briefcase,
  Building2,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  Globe2,
  GraduationCap,
  HardHat,
  Heart,
  Languages,
  Loader2,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  Truck,
  UserRound,
} from "lucide-react";

import { supabase } from "../../lib/supabase/client.ts";
import type { Database } from "../../lib/supabase/types.ts";
import { useAuthStore } from "../../lib/auth/auth-store.ts";
import type { UiUser } from "../../features/workspace/types.ts";
import { portfolioMediaUrl } from "../../lib/repositories/portfolioMedia.ts";
import { assetMediaUrl } from "../../lib/repositories/assetMedia.ts";
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
import {
  createMarketInquiry,
  getMyInquiryForItem,
  type MarketInquiryKind,
  type MarketInquiryRow,
} from "../../lib/repositories/marketInquiries.ts";
import {
  getMyMarketReview,
  listMarketReviews,
  saveMarketReview,
  type MarketReview,
  type MarketReviewRow,
  type ReviewableKind,
} from "../../lib/repositories/marketReviews.ts";
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

function formatDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function hireWindow(from: string | null, to: string | null): string | null {
  const start = formatDay(from);
  const end = formatDay(to);
  if (start && end) return `${start} → ${end}`;
  return start ? `From ${start}` : end ? `Until ${end}` : null;
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
  const contentRef = useRef<HTMLDivElement>(null);
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
  const inlineListingActions = allowRequest && dot.kind === "listing";
  const saves =
    listing?.saves ?? professional?.saves ?? job?.saves ?? firm?.saves ?? event?.saves ?? 0;
  const reviewKind: ReviewableKind | null =
    dot.kind === "professional" || dot.kind === "firm" ? dot.kind : null;
  const reviewAverage =
    professional?.rating ?? (firm && firm.rating > 0 ? firm.rating : null);
  const reviewCount = professional?.reviews ?? firm?.reviews ?? 0;

  return (
    <Dialog open={dot !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent
        ref={contentRef}
        disableAnimation={fullScreen}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current?.focus({ preventScroll: true });
        }}
        className={cn(
          "web3-theme flex flex-col gap-0 overflow-hidden rounded-2xl border border-border/80 bg-background p-0 shadow-2xl sm:gap-0 sm:p-0",
          fullScreen
            ? "h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)]! max-h-none! max-w-none!"
            : "fixed inset-auto left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:max-h-[90dvh] sm:max-w-5xl"
        )}
      >
        <div className={cn("relative shrink-0 border-b bg-gradient-to-br px-5 py-5 sm:px-7 sm:py-6", theme.bannerBg, theme.border)}>
          <div className="flex items-start justify-between gap-4 pr-10">
            <DialogHeader className="gap-2 text-left">
              <DialogTitle className="market-dialog-title flex items-start gap-2 text-balance text-foreground">
                <span>{dot.name}</span>
                {professional?.is_verified || firm?.verified ? (
                  <BadgeCheck className="mt-1 size-5 shrink-0 text-cyan-600" aria-label="Verified" />
                ) : null}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Explore the details and take the next step.
              </DialogDescription>
            </DialogHeader>
            {user ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn("size-10 shrink-0 rounded-full bg-background/80", favoriteId ? "text-rose-500 hover:text-rose-600" : "text-muted-foreground hover:text-foreground")}
                onClick={toggleFavorite}
                disabled={favoriteBusy}
                aria-label={favoriteId ? "Remove favorite" : "Add favorite"}
              >
                <Heart className="size-4" fill={favoriteId ? "currentColor" : "none"} aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", theme.badgeBg, theme.badgeText)}>
              <KindIcon className="size-3.5" aria-hidden="true" />
              {theme.label}
            </span>
            {dot.location ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                <span>{dot.location}</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="market-detail-scroll flex-1 overflow-y-auto">
          <div className="grid min-h-full md:grid-cols-[minmax(0,1fr)_320px] lg:grid-cols-[minmax(0,1fr)_350px]">
            <div className="space-y-7 px-5 py-6 sm:px-7 sm:py-7">
              {listing && (listing.photos?.length ?? 0) > 0 ? <ListingGallery paths={listing.photos} /> : null}

              {(job?.photo_path || event?.photo_path) ? (
                <img
                  src={
                    assetMediaUrl(job?.photo_path ?? event?.photo_path ?? null) ?? undefined
                  }
                  alt=""
                  loading="lazy"
                  className="h-52 w-full rounded-xl border border-border/80 object-cover"
                />
              ) : null}

              {firm?.logo_path ? (
                <img
                  src={assetMediaUrl(firm.logo_path) ?? undefined}
                  alt={`${firm.name} logo`}
                  loading="lazy"
                  className="size-16 rounded-xl border border-border/80 bg-background object-contain p-1.5"
                />
              ) : null}

              {listing?.description || professional?.bio || job?.description || firm?.about || event?.description ? (
                <section>
                  <h3 className="text-base font-semibold text-foreground">Overview</h3>
                  <p className="mt-3 max-w-[70ch] whitespace-pre-line text-sm leading-7 text-foreground/85">
                    {listing?.description || professional?.bio || job?.description || firm?.about || event?.description}
                  </p>
                </section>
              ) : null}

              {listing?.specs && listing.specs.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">Technical specifications</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {listing.specs.map((spec) => (
                      <span key={spec} className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground">
                        <Tag className="size-3.5 text-muted-foreground" />
                        {spec}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {professional?.skills && professional.skills.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">Core skills and tools</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {professional.skills.map((skill) => (
                      <span key={skill} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-1.5 text-xs font-medium text-cyan-800 dark:text-cyan-300">
                        <Sparkles className="size-3.5 text-cyan-500" />
                        {skill}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {job?.requirements && job.requirements.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">Job requirements</h3>
                  <ul className="mt-3 space-y-2.5 text-sm leading-6 text-foreground/85">
                    {job.requirements.map((req) => (
                      <li key={req} className="flex items-start gap-2.5">
                        <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-violet-600" />
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {firm?.services && firm.services.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">Survey services</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {firm.services.map((service) => (
                      <span key={service} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                        {service}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {professional?.certifications && professional.certifications.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">Certifications</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {professional.certifications.map((cert) => (
                      <span key={cert} className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground">
                        <Award className="size-3.5 text-cyan-600" aria-hidden="true" />
                        {cert}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {professional?.languages && professional.languages.length > 0 ? (
                <section>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Languages className="size-4 text-muted-foreground" aria-hidden="true" />
                    Languages
                  </h3>
                  <p className="mt-2 text-sm text-foreground/85">{professional.languages.join(" · ")}</p>
                </section>
              ) : null}

              {firm?.accreditations && firm.accreditations.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">Accreditations</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {firm.accreditations.map((accreditation) => (
                      <span key={accreditation} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                        <ShieldCheck className="size-3.5 text-emerald-600" aria-hidden="true" />
                        {accreditation}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {firm && (firm.website || firm.contact_email) ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">Contact the firm</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {firm.website && /^https?:\/\//i.test(firm.website) ? (
                      <a
                        href={firm.website}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        Website
                      </a>
                    ) : null}
                    {firm.contact_email ? (
                      <a
                        href={`mailto:${firm.contact_email}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                      >
                        <MessageSquare className="size-3.5" aria-hidden="true" />
                        {firm.contact_email}
                      </a>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {job?.benefits && job.benefits.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">Benefits</h3>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {job.benefits.map((benefit) => (
                      <li key={benefit} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-1.5 text-xs font-medium text-violet-800 dark:text-violet-300">
                        <ShieldCheck className="size-3.5" aria-hidden="true" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {job?.closes_at || job?.apply_url ? (
                <section className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-foreground/85">
                  {job.closes_at ? (
                    <span className="flex items-center gap-2">
                      <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      Applications close {formatDate(job.closes_at)}
                    </span>
                  ) : null}
                  {job.apply_url && /^https?:\/\//i.test(job.apply_url) ? (
                    <a
                      href={job.apply_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
                    >
                      <ExternalLink className="size-4" aria-hidden="true" />
                      Application page
                    </a>
                  ) : null}
                </section>
              ) : null}

              {event?.agenda && event.agenda.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">Agenda</h3>
                  <ol className="mt-3 space-y-2 text-sm leading-6 text-foreground/85">
                    {event.agenda.map((entry, index) => (
                      <li key={entry} className="flex items-start gap-2.5">
                        <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-[11px] font-semibold text-rose-700">
                          {index + 1}
                        </span>
                        <span>{entry}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}

              {event?.registration_url && /^https?:\/\//i.test(event.registration_url) ? (
                <a
                  href={event.registration_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Registration page
                </a>
              ) : null}

              {reviewKind ? (
                <MarketReviews
                  kind={reviewKind}
                  itemId={dot.id}
                  average={reviewAverage}
                  count={reviewCount}
                />
              ) : null}

              {showcase.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">Recent projects</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {showcase.map((item) => (
                      <div key={item.id} className="group overflow-hidden rounded-xl border border-border bg-card">
                        <img
                          src={portfolioMediaUrl(item.image_path) ?? undefined}
                          alt={item.title}
                          loading="lazy"
                          className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                        <p className="truncate px-2.5 py-2 text-xs font-semibold text-foreground">{item.title}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>

            <aside className="border-t border-border/80 bg-muted/25 px-5 py-6 sm:px-6 md:border-l md:border-t-0">
              <section className="border-b border-border/80 pb-6">
                <span className="text-xs font-medium text-muted-foreground">
                  {dot.kind === "listing"
                    ? listing?.listing_type === "hire" ? "Hire rate" : "Purchase price"
                    : dot.kind === "professional" ? "Professional rate"
                      : dot.kind === "job" ? "Offered pay"
                        : dot.kind === "event" ? "Registration fee" : "Firm information"}
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  {listing ? (
                    <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                      {listing.price.toLocaleString()} <span className="text-sm font-medium text-muted-foreground">{listing.currency}{listing.listing_type === "hire" ? " / day" : ""}</span>
                    </span>
                  ) : professional ? (
                    <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                      {professional.rate.toLocaleString()} <span className="text-sm font-medium text-muted-foreground">{professional.currency} / {professional.rate_per}</span>
                    </span>
                  ) : job ? (
                    <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                      {job.rate != null ? <>{job.rate.toLocaleString()} <span className="text-sm font-medium text-muted-foreground">{job.currency} / {job.rate_per ?? "day"}</span></> : "Negotiable"}
                    </span>
                  ) : event ? (
                    <span className="font-mono text-2xl font-bold tracking-tight text-foreground">
                      {event.price > 0 ? <>{event.price.toLocaleString()} <span className="text-sm font-medium text-muted-foreground">{event.currency}</span></> : <span className="font-sans text-lg font-semibold text-emerald-700">Free registration</span>}
                    </span>
                  ) : firm ? (
                    <span className="text-xl font-bold text-foreground">{firm.services?.length ?? 0} core services</span>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {listing?.condition ? <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground">Condition: {listing.condition}</span> : null}
                  {listing?.listing_type ? <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold capitalize text-amber-700">{listing.listing_type}</span> : null}
                  {professional?.availability ? <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700">{professional.availability}</span> : null}
                  {professional?.rating != null && professional.rating > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      <Star className="size-3.5 fill-amber-500 text-amber-500" />
                      {professional.rating.toFixed(1)}
                    </span>
                  ) : null}
                  {job?.employment_type ? <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold capitalize text-violet-700">{job.employment_type}</span> : null}
                  {event?.seats_left != null ? <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-700">{event.seats_left} seats remaining</span> : null}
                  {listing?.negotiable ? <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground">Negotiable</span> : null}
                  {listing?.is_verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-700 dark:text-cyan-400">
                      <BadgeCheck className="size-3.5" aria-hidden="true" />
                      Verified seller
                    </span>
                  ) : null}
                  {(listing?.is_remote || professional?.is_remote || job?.is_remote || firm?.is_remote || event?.is_remote) ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-700 dark:text-sky-400">
                      <Globe2 className="size-3.5" aria-hidden="true" />
                      Remote
                    </span>
                  ) : null}
                  {firm && reviewCount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      <Star className="size-3.5 fill-amber-500 text-amber-500" aria-hidden="true" />
                      {(reviewAverage ?? 0).toFixed(1)} ({reviewCount})
                    </span>
                  ) : null}
                  {saves > 0 ? (
                    <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      {saves} saved
                    </span>
                  ) : null}
                </div>
              </section>

              <dl className="divide-y divide-border/80 border-b border-border/80 py-2">
                {listing ? (
                  <>
                    <AttributeRow label="Category" value={listing.category === "accessory" ? "Accessory" : listing.type} />
                    <AttributeRow label="Seller" value={listing.seller} />
                    <AttributeRow label="Location" value={listing.location} />
                    <AttributeRow label="Quantity" value={(listing.quantity ?? 0) > 1 ? `${listing.quantity} available` : null} />
                    <AttributeRow label="Serial" value={listing.serial_number} />
                    <AttributeRow label="Year" value={listing.manufacture_year ? String(listing.manufacture_year) : null} />
                    <AttributeRow label="Delivery" value={listing.delivery} />
                    <AttributeRow label="Warranty" value={listing.warranty_months ? `${listing.warranty_months} months` : null} />
                    <AttributeRow label="Hire window" value={hireWindow(listing.available_from, listing.available_to)} />
                  </>
                ) : null}
                {professional ? (
                  <>
                    <AttributeRow label="Role / Title" value={professional.title} />
                    <AttributeRow label="Discipline" value={professional.discipline} />
                    <AttributeRow label="Experience" value={professional.experience} />
                    <AttributeRow label="Languages" value={professional.languages?.join(", ")} />
                    <AttributeRow label="Travel radius" value={professional.travel_radius_km ? `${professional.travel_radius_km} km` : null} />
                    <AttributeRow label="Credential issuer" value={professional.credential_issuer} />
                    <AttributeRow label="Credential expires" value={formatDay(professional.credential_expires_on)} />
                  </>
                ) : null}
                {job ? (
                  <>
                    <AttributeRow label="Hiring firm" value={job.company} />
                    <AttributeRow label="Discipline" value={job.discipline} />
                    <AttributeRow label="Type" value={job.employment_type} />
                    <AttributeRow label="Seniority" value={job.seniority} />
                    <AttributeRow label="Location" value={job.location} />
                    <AttributeRow label="Starts" value={formatDay(job.starts_on)} />
                    <AttributeRow label="Closes" value={job.closes_at ? formatDay(job.closes_at) : null} />
                  </>
                ) : null}
                {firm ? (
                  <>
                    <AttributeRow label="Team size" value={firm.staff_count != null ? `${firm.staff_count} staff` : "—"} />
                    <AttributeRow label="Established" value={firm.founded_year != null ? `Est. ${firm.founded_year}` : "—"} />
                    <AttributeRow label="HQ location" value={firm.location} />
                    <AttributeRow label="Service areas" value={firm.service_areas?.join(", ")} />
                  </>
                ) : null}
                {event ? (
                  <>
                    <AttributeRow label="Provider" value={event.provider} />
                    <AttributeRow label="Date" value={formatDate(event.starts_at)} />
                    <AttributeRow label="Timezone" value={event.timezone} />
                    <AttributeRow label="Venue" value={event.venue_address} />
                    <AttributeRow label="Instructor" value={event.instructor} />
                    <AttributeRow label="Certification" value={event.certification_body || "CPD Accredited"} />
                    <AttributeRow label="CPD points" value={event.cpd_points != null ? String(event.cpd_points) : null} />
                    <AttributeRow label="Capacity" value={event.capacity != null ? `${event.capacity} seats` : null} />
                    <AttributeRow label="Register by" value={event.registration_deadline ? formatDay(event.registration_deadline) : null} />
                  </>
                ) : null}
              </dl>

              {dot.lat != null && dot.lng != null ? (
                <div className="flex items-center justify-between gap-3 border-b border-border/80 py-4 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <MapPin className="size-4 shrink-0 text-muted-foreground" />
                    <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                      {dot.lat >= 0 ? "+" : ""}{dot.lat.toFixed(4)}°, {dot.lng >= 0 ? "+" : ""}{dot.lng.toFixed(4)}°
                    </span>
                  </div>
                  <button type="button" onClick={copyCoordinates} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted hover:text-primary">
                    {coordsCopied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                    <span>{coordsCopied ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              ) : null}

              {inlineListingActions ? <div className="pt-5">{renderActions(dot)}</div> : null}
            </aside>
          </div>
        </div>

        {!inlineListingActions ? (
          <div className="shrink-0 border-t border-border/80 bg-background px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-7">
            {renderActions(dot)}
          </div>
        ) : null}
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
    if (allowRequest && user) {
      return (
        <MarketInquiryPanel
          kind={activeDot.kind}
          itemId={activeDot.id}
          itemName={activeDot.name}
          user={user}
          onClose={onClose}
        />
      );
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
    <div className="flex w-full flex-wrap items-center justify-end gap-2">
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
      className="h-10 shrink-0 px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      Close
    </Button>
  );
}

const primaryActionClass =
  "h-10 shrink-0 whitespace-nowrap px-4 text-sm font-semibold bg-[var(--web3-brand,#d92d20)] text-white shadow-sm hover:bg-[var(--web3-brand-deep,#b42318)]";

function AttributeRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[minmax(80px,0.8fr)_minmax(0,1.2fr)] gap-3 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-right text-sm font-medium leading-5 text-foreground">{value}</dd>
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
    <form onSubmit={handleSend} className="mt-4 space-y-4 border-t border-border/80 pt-4 text-left">
      <h4 className="text-sm font-semibold text-foreground">{actionLabel}</h4>
      {isHire ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="start_date" className="text-xs">Start date</Label>
            <Input
              id="start_date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1.5 h-10 bg-background text-sm"
            />
          </div>
          <div>
            <Label htmlFor="end_date" className="text-xs">End date</Label>
            <Input
              id="end_date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1.5 h-10 bg-background text-sm"
            />
          </div>
        </div>
      ) : null}
      <div>
        <Label htmlFor="message" className="text-xs">Message for seller (optional)</Label>
        <Textarea
          id="message"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe your project timeline, requirements, or delivery location…"
          className="mt-1.5 bg-background text-sm leading-6"
        />
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => setFormOpen(false)} className="h-10 px-3 text-sm font-medium text-muted-foreground">
          Cancel
        </Button>
        <Button type="submit" size="sm" className={primaryActionClass} disabled={sending}>
          {sending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
          Submit request
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
              <Button size="sm" variant="outline" onClick={handleCancel} disabled={cancelling} className="h-9 px-3 text-xs">
                {cancelling ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Ban className="mr-1 size-3.5" />}
                Cancel
              </Button>
            ) : null}
            {onClose ? (
              <Button variant="ghost" size="sm" onClick={onClose} className="h-9 px-3 text-xs text-muted-foreground">
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

/** Star row used by the review list and the rating picker. */
function StarRow({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "size-3.5",
            n <= value ? "fill-amber-500 text-amber-500" : "text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}

/** Reviews for professionals and firms — the rows behind the public rating. */
function MarketReviews({
  kind,
  itemId,
  average,
  count,
}: {
  kind: ReviewableKind;
  itemId: string;
  average: number | null;
  count: number;
}) {
  const user = useAuthStore((s) => s.user);
  const [reviews, setReviews] = useState<MarketReview[]>([]);
  const [mine, setMine] = useState<MarketReviewRow | null>(null);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setReviews(await listMarketReviews(kind, itemId));
  }, [kind, itemId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setMine(null);
      return;
    }
    void getMyMarketReview(kind, itemId).then((row) => {
      if (cancelled) return;
      setMine(row);
      if (row) {
        setRating(row.rating);
        setBody(row.body ?? "");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [kind, itemId, user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveMarketReview({ kind, itemId, rating, body });
      await refresh();
      setMine(await getMyMarketReview(kind, itemId));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your review.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Reviews</h3>
        {average != null && average > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <StarRow value={Math.round(average)} />
            {average.toFixed(1)} · {count} review{count === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">No reviews yet</span>
        )}
      </div>

      {reviews.length > 0 ? (
        <ul className="mt-3 space-y-3">
          {reviews.slice(0, 3).map((review) => (
            <li key={review.id} className="rounded-xl border border-border/80 bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StarRow value={review.rating} />
                <span className="text-[11px] text-muted-foreground">Verified member</span>
              </div>
              {review.body ? (
                <p className="mt-1.5 text-sm leading-6 text-foreground/85">{review.body}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {user ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={() => setOpen((value) => !value)}
          >
            {mine ? "Edit your review" : "Write a review"}
          </Button>
          {open ? (
            <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-border/80 bg-card p-3 text-left">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rating</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    aria-pressed={rating === n}
                    onClick={() => setRating(n)}
                    className="rounded p-0.5"
                  >
                    <Star
                      className={cn(
                        "size-5",
                        n <= rating ? "fill-amber-500 text-amber-500" : "text-muted-foreground/50",
                      )}
                    />
                  </button>
                ))}
              </div>
              <Textarea
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="How was the work?"
                className="bg-background text-sm leading-6"
              />
              {error ? <FieldError>{error}</FieldError> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-9 text-xs">
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={busy} className="h-9 text-xs">
                  {busy ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                  Save review
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Sign in to leave a review.</p>
      )}
    </section>
  );
}

/** Generic inquiry rail so jobs, events, firms and professionals are actionable. */
function MarketInquiryPanel({
  kind,
  itemId,
  itemName,
  user,
  onClose,
}: {
  kind: MarketInquiryKind;
  itemId: string;
  itemName: string;
  user: UiUser;
  onClose?: () => void;
}) {
  const [inquiry, setInquiry] = useState<MarketInquiryRow | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [message, setMessage] = useState("");
  const [startDate, setStartDate] = useState("");
  const [seats, setSeats] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getMyInquiryForItem(kind, itemId).then((row) => {
      if (!cancelled) setInquiry(row);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, itemId]);

  const label =
    kind === "job"
      ? "Apply for this role"
      : kind === "event"
        ? "Register interest"
        : kind === "firm"
          ? "Contact this firm"
          : kind === "professional"
            ? "Request this surveyor"
            : "Send inquiry";
  const intent =
    kind === "job"
      ? "apply"
      : kind === "event"
        ? "register"
        : kind === "firm"
          ? "contact"
          : "hire";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError("Add your name and email so the publisher can reply.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createMarketInquiry({
        kind,
        itemId,
        intent,
        requesterName: name,
        requesterEmail: email,
        requesterWorkspaceId: user.workspaceId,
        message: message.trim() || null,
        desiredStartDate: kind === "job" && startDate ? startDate : null,
        seats: kind === "event" ? Math.max(1, Number(seats) || 1) : null,
      });
      setInquiry(created);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send your inquiry.");
    } finally {
      setBusy(false);
    }
  };

  if (inquiry && inquiry.status !== "cancelled") {
    return (
      <div className="w-full space-y-2.5">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
          <div className="min-w-0 truncate text-xs">
            <span className="font-semibold text-foreground">Inquiry: </span>
            <span className="capitalize text-muted-foreground">{inquiry.status}</span>
          </div>
          {onClose ? (
            <Button variant="ghost" size="sm" onClick={onClose} className="h-9 px-3 text-xs text-muted-foreground">
              Close
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2.5">
      <DialogActionRow>
        <CloseAction onClose={onClose} />
        <Button size="sm" className={primaryActionClass} onClick={() => setOpen((value) => !value)}>
          {label}
        </Button>
      </DialogActionRow>
      {open ? (
        <form onSubmit={submit} className="mt-4 space-y-3 border-t border-border/80 pt-4 text-left">
          <p className="text-xs text-muted-foreground">
            Your inquiry goes to whoever published “{itemName}” on the market.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="inquiry-name" className="text-xs">Your name</Label>
              <Input
                id="inquiry-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 h-10 bg-background text-sm"
                autoComplete="name"
              />
            </div>
            <div>
              <Label htmlFor="inquiry-email" className="text-xs">Email</Label>
              <Input
                id="inquiry-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 h-10 bg-background text-sm"
                autoComplete="email"
              />
            </div>
          </div>
          {kind === "job" ? (
            <div>
              <Label htmlFor="inquiry-start" className="text-xs">Available from (optional)</Label>
              <Input
                id="inquiry-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1.5 h-10 bg-background text-sm"
              />
            </div>
          ) : null}
          {kind === "event" ? (
            <div>
              <Label htmlFor="inquiry-seats" className="text-xs">Seats</Label>
              <Input
                id="inquiry-seats"
                type="number"
                min={1}
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
                className="mt-1.5 h-10 bg-background text-sm"
              />
            </div>
          ) : null}
          <div>
            <Label htmlFor="inquiry-message" className="text-xs">Message</Label>
            <Textarea
              id="inquiry-message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Introduce yourself and what you need…"
              className="mt-1.5 bg-background text-sm leading-6"
            />
          </div>
          {error ? <FieldError>{error}</FieldError> : null}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} className="h-10 px-3 text-sm font-medium text-muted-foreground">
              Cancel
            </Button>
            <Button type="submit" size="sm" className={primaryActionClass} disabled={busy}>
              {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Send inquiry
            </Button>
          </div>
        </form>
      ) : null}
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