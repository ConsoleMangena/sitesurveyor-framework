import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarClock,
  ExternalLink,
  GraduationCap,
  HardHat,
  Heart,
  Languages,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Tag,
  UserRound,
} from "lucide-react";

import { supabase } from "../../lib/supabase/client.ts";
import type { Database } from "../../lib/supabase/types.ts";
import { useAuthStore } from "../../lib/auth/auth-store.ts";
import { portfolioMediaUrl } from "../../lib/repositories/portfolioMedia.ts";
import { assetMediaUrl } from "../../lib/repositories/assetMedia.ts";
import { cn } from "../../lib/utils.ts";
import type { MarketDot } from "./marketDots.ts";
import {
  toPortfolioItemRows,
  type EventRow,
  type FirmRow,
  type JobRow,
  type ListingRow,
  type ProfessionalRow,
  type ShowcaseItemRow,
} from "./marketFeed.ts";
import { ListingGallery } from "./ListingGallery.tsx";
import { AddToCartButton } from "./AddToCartButton.tsx";
import {
  getEquipmentPlaceholder,
  getKindPlaceholder,
} from "./marketPlaceholders.ts";
import {
  getMarketFavorite,
  addMarketFavorite,
  removeMarketFavorite,
} from "../../lib/repositories/marketPreferences.ts";
import type { ReviewableKind } from "../../lib/repositories/marketReviews.ts";
import { Button } from "../ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog.tsx";

import { MarketReviews } from "./MarketReviews.tsx";
import { ListingRequestPanel } from "./ListingRequestPanel.tsx";
import { MarketInquiryPanel } from "./MarketInquiryPanel.tsx";
import { MarketDetailAttributes } from "./MarketDetailAttributes.tsx";
import { formatDate } from "./marketDetailFormat.ts";
import {
  CloseAction,
  DialogActionRow,
  primaryActionClass,
} from "./dialogActions.tsx";

type DbPortfolioItem =
  Database["public"]["Views"]["public_market_portfolio_items"]["Row"];

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
    badgeBg: "bg-warning/10",
    badgeText: "text-warning",
    border: "border-warning/20",
    bannerBg: "from-warning/10 via-warning/5 to-transparent",
  },
  professional: {
    label: "Survey Professional",
    icon: UserRound,
    badgeBg: "bg-info/10",
    badgeText: "text-info",
    border: "border-info/20",
    bannerBg: "from-info/10 via-info/5 to-transparent",
  },
  job: {
    label: "Job Opening",
    icon: HardHat,
    badgeBg: "bg-accent-purple/10",
    badgeText: "text-accent-purple",
    border: "border-accent-purple/20",
    bannerBg: "from-accent-purple/10 via-accent-purple/5 to-transparent",
  },
  firm: {
    label: "Survey Firm",
    icon: Building2,
    badgeBg: "bg-success/10",
    badgeText: "text-success",
    border: "border-success/20",
    bannerBg: "from-success/10 via-success/5 to-transparent",
  },
  event: {
    label: "Training & Event",
    icon: GraduationCap,
    badgeBg: "bg-error/10",
    badgeText: "text-error",
    border: "border-error/20",
    bannerBg: "from-error/10 via-error/5 to-transparent",
  },
};

function inAppView(kind: MarketDot["kind"]): string {
  return kind === "job"
    ? "jobs"
    : kind === "professional"
      ? "professionals"
      : "marketplace";
}

function inAppLabel(kind: MarketDot["kind"]): string {
  return kind === "job"
    ? "Open Job Board"
    : kind === "professional"
      ? "Open Directory"
      : "Open Marketplace";
}

function logInActionContent(kind: MarketDot["kind"]) {
  const suffix =
    kind === "job"
      ? "to Apply"
      : kind === "event"
        ? "to Register"
        : kind === "firm"
          ? "to Contact"
          : "to Inquire";
  return (
    <>
      Sign In <span className="hidden sm:inline">{suffix}</span>
    </>
  );
}

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
  isSample = false,
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
  /** Seeded demo row: shown clearly so nobody waits on a reply. */
  isSample?: boolean;
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
            : "fixed inset-auto left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:max-h-[85dvh] sm:max-w-4xl"
        )}
      >
        <div
          className={cn(
            "relative shrink-0 border-b bg-gradient-to-br px-5 py-5 sm:px-7 sm:py-6",
            theme.bannerBg,
            theme.border
          )}
        >
          <div className="flex items-start justify-between gap-4 pr-10">
            <DialogHeader className="gap-2 text-left">
              <DialogTitle className="market-dialog-title flex items-start gap-2 text-balance text-foreground">
                <span>{dot.name}</span>
                {professional?.is_verified || firm?.verified ? (
                  <BadgeCheck
                    className="mt-1 size-5 shrink-0 text-info"
                    aria-label="Verified"
                  />
                ) : null}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Explore the details and take the next step.
              </DialogDescription>
              {isSample ? (
                <p className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs leading-5 text-warning">
                  Sample content: this row belongs to a demo workspace, so
                  requests and orders are not answered.
                </p>
              ) : null}
            </DialogHeader>
            {user ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  "size-10 shrink-0 rounded-full bg-background/80",
                  favoriteId
                    ? "text-error/80 hover:text-error"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={toggleFavorite}
                disabled={favoriteBusy}
                aria-label={favoriteId ? "Remove favorite" : "Add favorite"}
              >
                <Heart
                  className="size-4"
                  fill={favoriteId ? "currentColor" : "none"}
                  aria-hidden="true"
                />
              </Button>
            ) : null}
          </div>
          <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                theme.badgeBg,
                theme.badgeText
              )}
            >
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
              {listing && (listing.photos?.length ?? 0) > 0 ? (
                <ListingGallery paths={listing.photos} />
              ) : listing ? (
                <img
                  src={getEquipmentPlaceholder(listing.type, listing.category)}
                  alt={listing.name}
                  loading="lazy"
                  className="h-64 w-full rounded-xl border border-border/80 object-cover"
                />
              ) : null}

              {professional ? (
                <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <img
                    src={
                      portfolioMediaUrl(professional.avatar_path) ??
                      getKindPlaceholder("professional")
                    }
                    alt={professional.name}
                    loading="lazy"
                    onError={(e) => {
                      const fallback = getKindPlaceholder("professional");
                      if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                    }}
                    className="size-20 shrink-0 rounded-full border-2 border-border/80 object-cover shadow-sm"
                  />
                  <div className="min-w-0">
                    <h4 className="truncate text-base font-semibold text-foreground">
                      {professional.name}
                    </h4>
                    <p className="truncate text-sm text-muted-foreground">
                      {professional.title} {professional.discipline ? `· ${professional.discipline}` : ""}
                    </p>
                    {professional.experience ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {professional.experience} experience
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {job ? (
                <img
                  src={
                    assetMediaUrl(job.photo_path) ??
                    getKindPlaceholder("job")
                  }
                  alt={job.title ?? "Job opening"}
                  loading="lazy"
                  onError={(e) => {
                    const fallback = getKindPlaceholder("job");
                    if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                  }}
                  className="h-52 w-full rounded-xl border border-border/80 object-cover"
                />
              ) : null}

              {event ? (
                <img
                  src={
                    assetMediaUrl(event.photo_path) ??
                    getKindPlaceholder("event")
                  }
                  alt={event.title ?? "Training event"}
                  loading="lazy"
                  onError={(e) => {
                    const fallback = getKindPlaceholder("event");
                    if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                  }}
                  className="h-52 w-full rounded-xl border border-border/80 object-cover"
                />
              ) : null}

              {firm ? (
                <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-muted/20 p-4">
                  <img
                    src={
                      assetMediaUrl(firm.logo_path) ??
                      getKindPlaceholder("firm")
                    }
                    alt={`${firm.name} logo`}
                    loading="lazy"
                    onError={(e) => {
                      const fallback = getKindPlaceholder("firm");
                      if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                    }}
                    className="size-16 shrink-0 rounded-xl border border-border/80 bg-background object-contain p-2 shadow-sm"
                  />
                  <div className="min-w-0">
                    <h4 className="truncate text-base font-semibold text-foreground">
                      {firm.name}
                    </h4>
                    <p className="truncate text-sm text-muted-foreground">
                      {firm.location}
                    </p>
                  </div>
                </div>
              ) : null}

              {listing?.description ||
              professional?.bio ||
              job?.description ||
              firm?.about ||
              event?.description ? (
                <section>
                  <h3 className="text-base font-semibold text-foreground">Overview</h3>
                  <p className="mt-3 max-w-[70ch] whitespace-pre-line text-sm leading-7 text-foreground/85">
                    {listing?.description ||
                      professional?.bio ||
                      job?.description ||
                      firm?.about ||
                      event?.description}
                  </p>
                </section>
              ) : null}

              {listing?.specs && listing.specs.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">
                    Technical specifications
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {listing.specs.map((spec) => (
                      <span
                        key={spec}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground"
                      >
                        <Tag className="size-3.5 text-muted-foreground" />
                        {spec}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {professional?.skills && professional.skills.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">
                    Core skills and tools
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {professional.skills.map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-info/20 bg-info/5 px-3 py-1.5 text-xs font-medium text-info"
                      >
                        <Sparkles className="size-3.5 text-info" />
                        {skill}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {job?.requirements && job.requirements.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">
                    Job requirements
                  </h3>
                  <ul className="mt-3 space-y-2.5 text-sm leading-6 text-foreground/85">
                    {job.requirements.map((req) => (
                      <li key={req} className="flex items-start gap-2.5">
                        <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent-purple" />
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {firm?.services && firm.services.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">
                    Survey services
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {firm.services.map((service) => (
                      <span
                        key={service}
                        className="rounded-lg border border-success/20 bg-success/5 px-3 py-1.5 text-xs font-medium text-success"
                      >
                        {service}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {professional?.certifications && professional.certifications.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">
                    Certifications
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {professional.certifications.map((cert) => (
                      <span
                        key={cert}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground"
                      >
                        <Award className="size-3.5 text-info" aria-hidden="true" />
                        {cert}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {professional?.languages && professional.languages.length > 0 ? (
                <section>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Languages
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    Languages
                  </h3>
                  <p className="mt-2 text-sm text-foreground/85">
                    {professional.languages.join(" · ")}
                  </p>
                </section>
              ) : null}

              {firm?.accreditations && firm.accreditations.length > 0 ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">
                    Accreditations
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {firm.accreditations.map((accreditation) => (
                      <span
                        key={accreditation}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-success/20 bg-success/5 px-3 py-1.5 text-xs font-medium text-success"
                      >
                        <ShieldCheck
                          className="size-3.5 text-success"
                          aria-hidden="true"
                        />
                        {accreditation}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {firm && (firm.website || firm.contact_email) ? (
                <section>
                  <h3 className="text-sm font-semibold text-foreground">
                    Contact the firm
                  </h3>
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
                      <li
                        key={benefit}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-accent-purple/20 bg-accent-purple/5 px-3 py-1.5 text-xs font-medium text-accent-purple"
                      >
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
                      <CalendarClock
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
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
                        <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-error/10 text-micro font-semibold text-error">
                          {index + 1}
                        </span>
                        <span>{entry}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}

              {event?.registration_url &&
              /^https?:\/\//i.test(event.registration_url) ? (
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
                  <h3 className="text-sm font-semibold text-foreground">
                    Recent projects
                  </h3>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {showcase.map((item) => (
                      <div
                        key={item.id}
                        className="group overflow-hidden rounded-xl border border-border bg-card"
                      >
                        <img
                          src={portfolioMediaUrl(item.image_path) ?? undefined}
                          alt={item.title}
                          loading="lazy"
                          className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                        <p className="truncate px-2.5 py-2 text-xs font-semibold text-foreground">
                          {item.title}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>

            <aside className="border-t border-border/80 bg-muted/25 px-5 py-6 sm:px-6 md:border-l md:border-t-0">
              <MarketDetailAttributes
                dot={dot}
                listing={listing}
                professional={professional}
                job={job}
                firm={firm}
                event={event}
                saves={saves}
                reviewAverage={reviewAverage}
                reviewCount={reviewCount}
                coordsCopied={coordsCopied}
                onCopyCoordinates={copyCoordinates}
              />

              {inlineListingActions ? (
                <div className="pt-5">{renderActions(dot)}</div>
              ) : null}
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
          <div className="w-full space-y-2.5">
            {listing ? (
              <AddToCartButton
                listing={{
                  id: listing.id,
                  name: listing.name,
                  price: listing.price,
                  currency: listing.currency,
                  listingType: listing.listing_type,
                  seller: listing.seller,
                  location: listing.location,
                  sellerWorkspaceId: null,
                }}
                className="w-full"
              />
            ) : null}
            <DialogActionRow>
              <CloseAction onClose={onClose} />
              <Button asChild size="sm" className={primaryActionClass}>
                <Link to="/login">
                  Sign In{" "}
                  <span className="hidden sm:inline">
                    {listing?.listing_type === "hire" ? "to Hire" : "to Buy"}
                  </span>
                </Link>
              </Button>
            </DialogActionRow>
          </div>
        );
      }
      if (!listing || !user) return null;
      return (
        <div className="w-full space-y-2.5">
          <AddToCartButton
            listing={{
              id: listing.id,
              name: listing.name,
              price: listing.price,
              currency: listing.currency,
              listingType: listing.listing_type,
              seller: listing.seller,
              location: listing.location,
              sellerWorkspaceId: null,
            }}
            className="w-full"
          />
          <ListingRequestPanel
            key={listing.id}
            listing={listing}
            user={user}
            onClose={onClose}
          />
        </div>
      );
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
          <Link to="/login">{logInActionContent(activeDot.kind)}</Link>
        </Button>
      </DialogActionRow>
    );
  }
}
