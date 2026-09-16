import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck } from "lucide-react";

import { supabase } from "../../lib/supabase/client.ts";
import type { Database } from "../../lib/supabase/types.ts";
import { portfolioMediaUrl } from "../../lib/repositories/portfolioMedia.ts";
import { MARKET_DOT_COLORS } from "./marketDots.ts";
import type { MarketDot } from "./marketDots.ts";
import { toPortfolioItemRows } from "./marketFeed.ts";
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
}: {
  dot: MarketDot | null;
  listing: ListingRow | null;
  professional: ProfessionalRow | null;
  job: JobRow | null;
  firm: FirmRow | null;
  event: EventRow | null;
  onClose: () => void;
}) {
  const [showcase, setShowcase] = useState<ShowcaseItemRow[]>([]);
  const professionalId = professional?.id ?? null;

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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        {dot ? (
          <>
            <DialogHeader>
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
            <Button asChild className="mt-2 w-full">
              <Link to="/login">
                {dot.kind === "job"
                  ? "Sign in to apply"
                  : dot.kind === "event"
                    ? "Sign in to register"
                    : dot.kind === "firm"
                      ? "Sign in to request services"
                      : "Sign in to contact the publisher"}
              </Link>
            </Button>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
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
