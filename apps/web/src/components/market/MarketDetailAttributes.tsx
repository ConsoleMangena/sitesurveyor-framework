import {
  BadgeCheck,
  Check,
  Copy,
  Globe2,
  MapPin,
  Star,
} from "lucide-react";
import type { MarketDot } from "./marketDots.ts";
import type {
  EventRow,
  FirmRow,
  JobRow,
  ListingRow,
  ProfessionalRow,
} from "./marketFeed.ts";
import { AttributeRow } from "./dialogActions.tsx";
import { formatDay, formatDate, hireWindow } from "./marketDetailFormat.ts";

export interface MarketDetailAttributesProps {
  dot: MarketDot;
  listing: ListingRow | null;
  professional: ProfessionalRow | null;
  job: JobRow | null;
  firm: FirmRow | null;
  event: EventRow | null;
  saves: number;
  reviewAverage: number | null;
  reviewCount: number;
  coordsCopied: boolean;
  onCopyCoordinates: () => void;
}

export function MarketDetailAttributes({
  dot,
  listing,
  professional,
  job,
  firm,
  event,
  saves,
  reviewAverage,
  reviewCount,
  coordsCopied,
  onCopyCoordinates,
}: MarketDetailAttributesProps) {
  return (
    <>
      <section className="border-b border-border/80 pb-6">
        <span className="text-xs font-medium text-muted-foreground">
          {dot.kind === "listing"
            ? listing?.listing_type === "hire"
              ? "Hire rate"
              : "Purchase price"
            : dot.kind === "professional"
              ? "Professional rate"
              : dot.kind === "job"
                ? "Offered pay"
                : dot.kind === "event"
                  ? "Registration fee"
                  : "Firm information"}
        </span>
        <div className="mt-2 flex items-baseline gap-2">
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
                <span className="font-sans text-lg font-semibold text-success">
                  Free registration
                </span>
              )}
            </span>
          ) : firm ? (
            <span className="text-xl font-bold text-foreground">
              {firm.services?.length ?? 0} core services
            </span>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {listing?.condition ? (
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground">
              Condition: {listing.condition}
            </span>
          ) : null}
          {listing?.listing_type ? (
            <span className="rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-xs font-semibold capitalize text-warning">
              {listing.listing_type}
            </span>
          ) : null}
          {professional?.availability ? (
            <span className="rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
              {professional.availability}
            </span>
          ) : null}
          {professional?.rating != null && professional.rating > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
              <Star className="size-3.5 fill-warning text-warning" />
              {professional.rating.toFixed(1)}
            </span>
          ) : null}
          {job?.employment_type ? (
            <span className="rounded-full border border-accent-purple/20 bg-accent-purple/10 px-2.5 py-1 text-xs font-semibold capitalize text-accent-purple">
              {job.employment_type}
            </span>
          ) : null}
          {event?.seats_left != null ? (
            <span className="rounded-full border border-error/20 bg-error/10 px-2.5 py-1 text-xs font-medium text-error">
              {event.seats_left} seats remaining
            </span>
          ) : null}
          {listing?.negotiable ? (
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground">
              Negotiable
            </span>
          ) : null}
          {listing?.is_verified ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-info/20 bg-info/10 px-2.5 py-1 text-xs font-semibold text-info">
              <BadgeCheck className="size-3.5" aria-hidden="true" />
              Verified seller
            </span>
          ) : null}
          {listing?.is_remote ||
          professional?.is_remote ||
          job?.is_remote ||
          firm?.is_remote ||
          event?.is_remote ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-info/20 bg-info/10 px-2.5 py-1 text-xs font-medium text-info">
              <Globe2 className="size-3.5" aria-hidden="true" />
              Remote
            </span>
          ) : null}
          {firm && reviewCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">
              <Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />
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
            <AttributeRow
              label="Category"
              value={listing.category === "accessory" ? "Accessory" : listing.type}
            />
            <AttributeRow label="Seller" value={listing.seller} />
            <AttributeRow label="Location" value={listing.location} />
            <AttributeRow
              label="Quantity"
              value={(listing.quantity ?? 0) > 1 ? `${listing.quantity} available` : null}
            />
            <AttributeRow label="Serial" value={listing.serial_number} />
            <AttributeRow
              label="Year"
              value={listing.manufacture_year ? String(listing.manufacture_year) : null}
            />
            <AttributeRow label="Delivery" value={listing.delivery} />
            <AttributeRow
              label="Warranty"
              value={listing.warranty_months ? `${listing.warranty_months} months` : null}
            />
            <AttributeRow
              label="Hire window"
              value={hireWindow(listing.available_from, listing.available_to)}
            />
          </>
        ) : null}
        {professional ? (
          <>
            <AttributeRow label="Role / Title" value={professional.title} />
            <AttributeRow label="Discipline" value={professional.discipline} />
            <AttributeRow label="Experience" value={professional.experience} />
            <AttributeRow label="Languages" value={professional.languages?.join(", ")} />
            <AttributeRow
              label="Travel radius"
              value={professional.travel_radius_km ? `${professional.travel_radius_km} km` : null}
            />
            <AttributeRow
              label="Credential issuer"
              value={professional.credential_issuer}
            />
            <AttributeRow
              label="Credential expires"
              value={formatDay(professional.credential_expires_on)}
            />
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
            <AttributeRow
              label="Team size"
              value={firm.staff_count != null ? `${firm.staff_count} staff` : "—"}
            />
            <AttributeRow
              label="Established"
              value={firm.founded_year != null ? `Est. ${firm.founded_year}` : "—"}
            />
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
            <AttributeRow
              label="Certification"
              value={event.certification_body || "CPD Accredited"}
            />
            <AttributeRow
              label="CPD points"
              value={event.cpd_points != null ? String(event.cpd_points) : null}
            />
            <AttributeRow
              label="Capacity"
              value={event.capacity != null ? `${event.capacity} seats` : null}
            />
            <AttributeRow
              label="Register by"
              value={event.registration_deadline ? formatDay(event.registration_deadline) : null}
            />
          </>
        ) : null}
      </dl>

      {dot.lat != null && dot.lng != null ? (
        <div className="flex items-center justify-between gap-3 border-b border-border/80 py-4 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <MapPin className="size-4 shrink-0 text-muted-foreground" />
            <span className="whitespace-nowrap font-mono text-micro text-muted-foreground">
              {dot.lat >= 0 ? "+" : ""}
              {dot.lat.toFixed(4)}°, {dot.lng >= 0 ? "+" : ""}
              {dot.lng.toFixed(4)}°
            </span>
          </div>
          <button
            type="button"
            onClick={onCopyCoordinates}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted hover:text-primary"
          >
            {coordsCopied ? (
              <Check className="size-3.5 text-success" />
            ) : (
              <Copy className="size-3.5" />
            )}
            <span>{coordsCopied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      ) : null}
    </>
  );
}

