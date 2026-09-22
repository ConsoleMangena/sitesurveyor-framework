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
    <div className="mb-4 space-y-2">
      <img
        src={current}
        alt="Instrument photo"
        className="aspect-[4/3] w-full rounded-lg border object-cover"
      />
      {urls.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {urls.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "h-14 w-14 shrink-0 overflow-hidden rounded-md border",
                i === active ? "border-primary ring-1 ring-primary" : "border-border",
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