import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils.ts";

/** The single reading width and rhythm used by the public editorial pages. */
export function PublicSection({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn("public-section", className)} {...props} />;
}
