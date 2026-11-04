import { cn } from "@/lib/utils.ts";

/**
 * The official SiteSurveyor logo lockup (`public/logo.svg`) — a confirmed brand
 * asset that is never redrawn, recoloured or cropped, so every surface renders
 * the same file with its own proportions intact.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo.svg"
      alt=""
      aria-hidden="true"
      className={cn("shrink-0 select-none object-contain", className)}
    />
  );
}
