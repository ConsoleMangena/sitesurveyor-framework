import { useState } from "react";
import {
  Award,
  BadgeCheck,
  Briefcase,
  CalendarDays,
  Clock,
  DollarSign,
  Images,
  Mail,
  MapPin,
  Phone,
  Star,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DialogTemplate } from "@/components/templates/DialogTemplate.tsx";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/** One project-showcase entry on the public portfolio. */
export interface PortfolioShowcaseItem {
  id: string;
  title: string;
  description?: string | null;
  year?: string | null;
  imageUrl: string | null;
}

export interface ProfilePortfolioData {
  name: string;
  title?: string;
  discipline?: string;
  experience?: string;
  location?: string;
  rate?: number;
  ratePer?: string;
  currency?: string;
  availability?: string;
  isAvailable?: boolean;
  bio?: string;
  skills?: string[];
  certifications?: string[];
  email?: string | null;
  phone?: string | null;
  rating?: number | null;
  reviews?: number | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  verified?: boolean;
  showcase?: PortfolioShowcaseItem[];
  fallbackInitials?: string;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface ProfilePortfolioTemplateProps {
  profile: ProfilePortfolioData;
  className?: string;
}

export function ProfilePortfolioTemplate({
  profile,
  className,
}: ProfilePortfolioTemplateProps) {
  const [preview, setPreview] = useState<PortfolioShowcaseItem | null>(null);
  const {
    name,
    title,
    discipline,
    experience,
    location,
    rate,
    ratePer,
    currency,
    availability,
    isAvailable,
    bio,
    skills = [],
    certifications = [],
    email,
    phone,
    rating,
    reviews,
    avatarUrl,
    bannerUrl,
    verified,
    showcase = [],
    fallbackInitials,
  } = profile;

  const availabilityLabel = isAvailable
    ? "Available for hire"
    : availability || "Unavailable";

  const availabilityTone = isAvailable
    ? ("success" as const)
    : availability === "Busy"
      ? ("destructive" as const)
      : availability === "Available Soon"
        ? ("warning" as const)
        : ("secondary" as const);

  return (
    <Card
      className={cn(
        "overflow-hidden border bg-card text-card-foreground shadow-sm",
        className
      )}
    >
      <div className="relative h-32 sm:h-40 bg-gradient-to-br from-primary/90 via-primary/55 to-primary/25">
        {bannerUrl ? (
          <img
            src={bannerUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_30%_20%,white,transparent_40%),radial-gradient(circle_at_80%_70%,white,transparent_35%)]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        {verified && (
          <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-emerald-500/95 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur">
            <BadgeCheck className="size-3.5" />
            Verified
          </div>
        )}
      </div>

      <CardContent className="relative px-5 pb-5 pt-0 sm:px-6">
        <div className="-mt-12 mb-4 flex items-end justify-between gap-3">
          <div className="relative">
            <div
              className="absolute -inset-1 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 blur-md"
              aria-hidden
            />
            <Avatar className="relative h-24 w-24 border-4 border-background shadow-md">
              <AvatarImage src={avatarUrl ?? undefined} alt={name} />
              <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-semibold">
                {getInitials(name || fallbackInitials || "U")}
              </AvatarFallback>
            </Avatar>
          </div>
          <Badge variant={availabilityTone} className="mb-1.5 shrink-0 px-2.5 py-1">
            <span
              className={cn(
                "mr-1.5 inline-block size-1.5 rounded-full",
                isAvailable ? "bg-emerald-500" : "bg-current opacity-60",
              )}
              aria-hidden
            />
            {availabilityLabel}
          </Badge>
        </div>

        <div className="space-y-0.5">
          <h3 className="text-2xl font-bold tracking-tight">
            {name.trim() || "Your Name"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {[title, discipline].filter(Boolean).join(" · ") || "Professional title"}
          </p>
        </div>

        {bio ? (
          <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-foreground/90">
            {bio}
          </p>
        ) : (
          <p className="mt-3 text-sm italic text-muted-foreground">
            Add a short bio to tell clients what you do.
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-none border border-border/60 bg-border/60 sm:grid-cols-4">
          <div className="bg-card p-3">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <MapPin size={11} /> Location
            </span>
            <p className="mt-1 truncate text-sm font-medium" title={location ?? undefined}>
              {location || "—"}
            </p>
          </div>
          <div className="bg-card p-3">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Clock size={11} /> Experience
            </span>
            <p className="mt-1 truncate text-sm font-medium" title={experience ?? undefined}>
              {experience || "—"}
            </p>
          </div>
          <div className="bg-card p-3">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <DollarSign size={11} /> Rate
            </span>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {Number(rate) > 0 ? (
                <>
                  {Number(rate).toLocaleString()}
                  {currency && (
                    <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                      {currency}
                    </span>
                  )}
                  {ratePer && (
                    <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                      / {ratePer}
                    </span>
                  )}
                </>
              ) : (
                "—"
              )}
            </p>
          </div>
          <div className="bg-card p-3">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Star size={11} fill="currentColor" /> Rating
            </span>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {rating != null && rating > 0 ? (
                <>
                  {rating.toFixed(1)}
                  <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                    ({reviews ?? 0} review{reviews === 1 ? "" : "s"})
                  </span>
                </>
              ) : (
                "—"
              )}
            </p>
          </div>
        </div>

        {(skills.length > 0 || certifications.length > 0) && (
          <Separator className="my-5" />
        )}

        {skills.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Briefcase size={12} /> Skills
            </div>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((tag) => (
                <Badge key={tag} variant="secondary" className="font-normal">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {certifications.length > 0 && (
          <div className={cn("space-y-2", skills.length > 0 && "mt-4")}>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Award size={12} /> Certifications
            </div>
            <div className="flex flex-wrap gap-1.5">
              {certifications.map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="gap-1 font-normal"
                >
                  <Award size={10} /> {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {showcase.length > 0 && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Images size={12} /> Project Showcase
              <span className="rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
                {showcase.length}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {showcase.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPreview(item)}
                  className="group relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`View project ${item.title}`}
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Images size={18} />
                    </span>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent opacity-90 transition-opacity" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 p-2 text-left">
                    <span className="line-clamp-1 text-[11px] font-semibold text-white">
                      {item.title}
                    </span>
                    {item.year && (
                      <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur">
                        {item.year}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {(email || phone) && (
          <>
            <Separator className="my-5" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2 text-xs">
                {email && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Mail size={12} />
                    <span className="truncate">{email}</span>
                  </span>
                )}
                {phone && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Phone size={12} />
                    {phone}
                  </span>
                )}
              </div>
              {email && (
                <Button size="sm" className="gap-2" asChild>
                  <a href={`mailto:${email}`}>
                    <Mail size={14} /> Contact
                  </a>
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>

      <DialogTemplate
        open={preview !== null}
        onOpenChange={(open) => !open && setPreview(null)}
        title={
          <>
            {preview?.title}
            {preview?.year ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <CalendarDays size={11} /> {preview.year}
              </span>
            ) : null}
          </>
        }
        description={preview?.description}
        size="2xl"
        className="sm:rounded-none"
        contentClassName="p-0 gap-0"
      >
        {preview?.imageUrl ? (
          <div className="relative bg-black">
            <img
              src={preview.imageUrl}
              alt={preview.title}
              className="max-h-[70vh] w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Images size={32} />
          </div>
        )}
      </DialogTemplate>
    </Card>
  );
}

export default ProfilePortfolioTemplate;