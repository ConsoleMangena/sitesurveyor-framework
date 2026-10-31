import { useState } from "react";
import { cn } from "@/lib/utils";
import { assetMediaUrl } from "@/lib/repositories/assetMedia";

export function ListingGallery({ paths }: { paths: string[] }) {
  const urls = paths
    .map((p) => assetMediaUrl(p))
    .filter((url): url is string => url !== null);
  const [active, setActive] = useState(0);
  if (urls.length === 0) return null;
  const current = urls[Math.min(active, urls.length - 1)];
  return (
    <div className="space-y-3">
      <img
        src={current}
        alt="Instrument photo"
        className="aspect-[16/10] w-full rounded-xl border border-border/80 object-cover"
      />
      {urls.length > 1 ? (
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {urls.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View instrument photo ${i + 1}`}
              aria-pressed={i === active}
              className={cn(
                "size-16 shrink-0 overflow-hidden rounded-lg border",
                i === active ? "border-primary ring-2 ring-primary/25" : "border-border",
              )}
            >
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}