import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Builds the page list for pagination controls.
 *
 * Returns `[1, '...', 4, 5, 6, '...', 20]`-style entries, always keeping the
 * current page and both ends reachable within `maxVisible` slots.
 */
export function getPageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible = 5,
): (number | "...")[] {
  if (totalPages <= 0) return [];

  if (totalPages <= maxVisible + 2) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const half = Math.floor(maxVisible / 2);
  let start = Math.max(2, currentPage - half);
  const end = Math.min(totalPages - 1, start + maxVisible - 1);
  start = Math.max(2, Math.min(start, end - maxVisible + 1));

  const pages: (number | "...")[] = [1];
  if (start > 2) pages.push("...");
  for (let page = start; page <= end; page++) pages.push(page);
  if (end < totalPages - 1) pages.push("...");
  pages.push(totalPages);

  return pages;
}
